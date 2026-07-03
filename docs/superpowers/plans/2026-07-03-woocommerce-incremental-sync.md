# WooCommerce Incremental Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync only WooCommerce orders modified since the last successful run (upsert/delete) instead of TRUNCATE-replacing all ~13k orders each run.

**Architecture:** Two watermarks in `app_settings` drive `scripts/sync-woocommerce.ts`: a delta boundary and a last-full-resync marker (forces a full run when null or ≥20h old). The client fetches all orders (full) or `modified_after` (delta); the write layer upserts revenue orders / deletes non-revenue ones, then recomputes `is_first_order` and rebuilds `customers` in SQL. Aggregate derivation is shared by both the full and delta paths.

**Tech Stack:** TypeScript, Node 22, `pg`, WooCommerce REST v3, Vitest (unit + real-Postgres integration tests, CI runs `migrate`→`seed`→`test`).

## Global Constraints

- Node 22+.
- `orders` must always equal current revenue orders (status `completed`/`processing`); `customers` = aggregates derived from `orders`; `orders.is_first_order` = earliest order per customer (exactly one true).
- Never TRUNCATE to empty: full path aborts if 0 orders fetched.
- Watermarks (UTC ISO) live in `app_settings`: `woocommerce_orders_synced_at`, `woocommerce_orders_full_synced_at`.
- Full-resync trigger: `full_synced_at` null or age ≥ 20h (72_000_000 ms).
- Delta fetch uses `modified_after = synced_at − 60s`, `dates_are_gmt=true`.
- Watermarks are set only on success; start-time (not end-time) watermark.
- Integration tests connect via `DATABASE_URL`; run `npm run migrate` first.

---

### Task 1: `fetchAllOrders(modifiedAfter?)`

**Files:**
- Modify: `src/connectors/woocommerce/client.ts`
- Test: `tests/connectors/woocommerce/client.test.ts`

**Interfaces:**
- Consumes: existing `WooCommerceClient(config, fetchImpl?, timeoutMs?)`.
- Produces: `fetchAllOrders(modifiedAfter?: Date): Promise<WooOrder[]>` — when `modifiedAfter` is set, each request URL gains `&modified_after=<ISO>&dates_are_gmt=true`.

- [ ] **Step 1: Write the failing test** (append inside the existing `describe('WooCommerceClient', …)`):

```ts
  it('fügt modified_after (GMT) hinzu, wenn ein Datum übergeben wird', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]));
    const client = new WooCommerceClient(cfg, fetchMock as unknown as typeof fetch);
    await client.fetchAllOrders(new Date('2026-07-01T10:00:00.000Z'));
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('modified_after=2026-07-01T10%3A00%3A00.000Z');
    expect(url).toContain('dates_are_gmt=true');
  });

  it('lässt modified_after weg, wenn kein Datum übergeben wird', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]));
    const client = new WooCommerceClient(cfg, fetchMock as unknown as typeof fetch);
    await client.fetchAllOrders();
    expect(fetchMock.mock.calls[0][0]).not.toContain('modified_after');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/woocommerce/client.test.ts`
Expected: FAIL (URL lacks `modified_after`).

- [ ] **Step 3: Implement** — change the signature and URL in `fetchAllOrders`:

```ts
  async fetchAllOrders(modifiedAfter?: Date): Promise<WooOrder[]> {
    const all: WooOrder[] = [];
    let page = 1;
    const mod = modifiedAfter
      ? `&modified_after=${encodeURIComponent(modifiedAfter.toISOString())}&dates_are_gmt=true`
      : '';
    for (;;) {
      const url = `${this.base}/orders?per_page=${PER_PAGE}&page=${page}&orderby=id&order=asc&status=any&_fields=${ORDER_FIELDS}${mod}`;
      const res = await this.get(url);
      if (!res.ok) {
        throw new Error(`WooCommerce fetch failed: ${res.status} ${await res.text()}`);
      }
      const batch = (await res.json()) as WooOrder[];
      all.push(...batch);
      if (batch.length < PER_PAGE) break;
      page += 1;
    }
    return all;
  }
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/connectors/woocommerce/client.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/woocommerce/client.ts tests/connectors/woocommerce/client.test.ts
git commit -m "feat: WooCommerce client supports modified_after (incremental fetch)"
```

---

### Task 2: `normalizeDelta` — partition into upserts + deleteIds

**Files:**
- Modify: `src/connectors/woocommerce/connector.ts`
- Test: `tests/connectors/woocommerce/connector.test.ts`

**Interfaces:**
- Produces: `normalizeDelta(rawOrders: WooOrder[]): { upserts: Order[]; deleteIds: string[] }`.
  - `upserts` = revenue orders (`completed`/`processing`) mapped to `Order` (with `isFirstOrder: false` placeholder — recomputed in SQL).
  - `deleteIds` = `String(o.id)` for every non-revenue fetched order.
  - Customer/first-order aggregation is removed (now done in SQL).

- [ ] **Step 1: Write the failing test** — replace the body of `tests/connectors/woocommerce/connector.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeDelta } from '@/connectors/woocommerce/connector';
import type { WooOrder } from '@/connectors/woocommerce/types';

function o(id: number, status: string, customer_id = 0, total = '10.00', email?: string): WooOrder {
  return { id, status, date_created: '2026-05-01T00:00:00', total, customer_id, billing: email ? { email } : undefined };
}

describe('normalizeDelta', () => {
  it('mappt Revenue-Orders (completed/processing) nach upserts', () => {
    const { upserts, deleteIds } = normalizeDelta([o(1, 'completed', 5, '100.00'), o(2, 'processing', 6, '50.00')]);
    expect(upserts.map((u) => u.orderId)).toEqual(['1', '2']);
    expect(upserts[0]).toMatchObject({ orderId: '1', customerId: '5', date: '2026-05-01', revenue: 100, isFirstOrder: false });
    expect(deleteIds).toEqual([]);
  });

  it('sammelt Nicht-Revenue-Orders (refunded/cancelled/trash) in deleteIds', () => {
    const { upserts, deleteIds } = normalizeDelta([o(3, 'refunded'), o(4, 'cancelled'), o(5, 'trash')]);
    expect(upserts).toEqual([]);
    expect(deleteIds).toEqual(['3', '4', '5']);
  });

  it('keyt Gäste (customer_id 0) per billing-email, sonst per order-id', () => {
    const { upserts } = normalizeDelta([o(6, 'completed', 0, '10.00', 'A@x.de'), o(7, 'completed', 0, '10.00')]);
    expect(upserts[0].customerId).toBe('guest:a@x.de');
    expect(upserts[1].customerId).toBe('guest:order-7');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/woocommerce/connector.test.ts`
Expected: FAIL (`normalizeDelta` is not exported).

- [ ] **Step 3: Implement** — replace `normalizeOrders` in `connector.ts` with `normalizeDelta`:

```ts
import type { Order } from '@/lib/types';
import type { WooOrder } from './types';

// Only paid/fulfilled orders count as revenue.
const REVENUE_STATUSES = new Set(['completed', 'processing']);

function customerKey(o: WooOrder): string {
  // Registered customers key by customer_id; guests (customer_id 0) key by
  // billing email so their orders don't collapse into one pseudo-customer.
  if (o.customer_id > 0) return String(o.customer_id);
  return o.billing?.email ? `guest:${o.billing.email.toLowerCase()}` : `guest:order-${o.id}`;
}

// Partitions fetched orders into revenue rows to upsert and non-revenue ids to
// delete. customers + is_first_order are derived downstream in SQL, so this no
// longer aggregates.
export function normalizeDelta(rawOrders: WooOrder[]): { upserts: Order[]; deleteIds: string[] } {
  const upserts: Order[] = [];
  const deleteIds: string[] = [];
  for (const o of rawOrders) {
    if (REVENUE_STATUSES.has(o.status)) {
      upserts.push({
        orderId: String(o.id),
        customerId: customerKey(o),
        date: o.date_created.slice(0, 10),
        revenue: Number(o.total),
        isFirstOrder: false,
      });
    } else {
      deleteIds.push(String(o.id));
    }
  }
  return { upserts, deleteIds };
}
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/connectors/woocommerce/connector.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/woocommerce/connector.ts tests/connectors/woocommerce/connector.test.ts
git commit -m "feat: normalizeDelta partitions WooCommerce orders into upserts + deleteIds"
```

---

### Task 3: write layer — `deriveAggregates`, `fullReplace`, `applyDelta`

**Files:**
- Modify: `src/connectors/woocommerce/write.ts`
- Test: `tests/connectors/woocommerce/write.test.ts`

**Interfaces:**
- Consumes: `Order` from `@/lib/types`; `pool` from `@/lib/db`.
- Produces:
  - `fullReplace(orders: Order[]): Promise<void>` — TRUNCATE orders+customers, insert orders, `deriveAggregates`. Aborts if `orders.length === 0`.
  - `applyDelta(upserts: Order[], deleteIds: string[]): Promise<void>` — upsert `upserts`, delete `deleteIds`, `deriveAggregates`. No-op safe when both empty.
  - (`writeOrdersAndCustomers` is removed; the sync script uses the two new functions.)

- [ ] **Step 1: Write the failing test** — replace `tests/connectors/woocommerce/write.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { fullReplace, applyDelta } from '@/connectors/woocommerce/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import { pgSupabase } from '../../helpers/pg-supabase';
import type { Order } from '@/lib/types';

const base: Order[] = [
  { orderId: 'w1', customerId: '11', date: '2026-05-01', revenue: 100, isFirstOrder: false },
  { orderId: 'w2', customerId: '11', date: '2026-05-02', revenue: 50, isFirstOrder: false },
  { orderId: 'w3', customerId: '22', date: '2026-05-03', revenue: 30, isFirstOrder: false },
];

describe('WooCommerce write (integration, benötigt laufende DB)', () => {
  beforeEach(async () => { await fullReplace(base); });
  afterAll(async () => { await pool.end(); });

  it('fullReplace baut orders + customers + is_first_order auf', async () => {
    const after = await loadDataset(pgSupabase());
    expect(after.orders.map((o) => o.orderId).sort()).toEqual(['w1', 'w2', 'w3']);
    const c11 = after.customers.find((c) => c.customerId === '11')!;
    expect(c11).toMatchObject({ ordersCount: 2, firstOrderDate: '2026-05-01', lastOrderDate: '2026-05-02' });
    expect(c11.totalRevenue).toBeCloseTo(150);
    // exactly one first order per customer, at the earliest date
    const firsts = after.orders.filter((o) => o.isFirstOrder).map((o) => o.orderId).sort();
    expect(firsts).toEqual(['w1', 'w3']);
  });

  it('fullReplace bricht bei 0 Orders ab, ohne zu truncaten', async () => {
    await expect(fullReplace([])).rejects.toThrow(/0 orders/i);
    expect((await loadDataset(pgSupabase())).orders.length).toBe(3);
  });

  it('applyDelta upsertet neue/geänderte Orders und rechnet Aggregate neu', async () => {
    await applyDelta(
      [{ orderId: 'w2', customerId: '11', date: '2026-05-02', revenue: 999, isFirstOrder: false },  // update
       { orderId: 'w4', customerId: '22', date: '2026-05-04', revenue: 20, isFirstOrder: false }],   // insert
      [],
    );
    const after = await loadDataset(pgSupabase());
    expect(after.orders.find((o) => o.orderId === 'w2')!.revenue).toBeCloseTo(999);
    expect(after.customers.find((c) => c.customerId === '22')!.ordersCount).toBe(2);
  });

  it('applyDelta löscht Orders in deleteIds (aus dem Revenue-Set gefallen)', async () => {
    await applyDelta([], ['w2']);
    const after = await loadDataset(pgSupabase());
    expect(after.orders.map((o) => o.orderId).sort()).toEqual(['w1', 'w3']);
    expect(after.customers.find((c) => c.customerId === '11')!.ordersCount).toBe(1);
  });

  it('applyDelta ist idempotent', async () => {
    const delta: Order[] = [{ orderId: 'w4', customerId: '22', date: '2026-05-04', revenue: 20, isFirstOrder: false }];
    await applyDelta(delta, []);
    await applyDelta(delta, []);
    const after = await loadDataset(pgSupabase());
    expect(after.orders.filter((o) => o.orderId === 'w4').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run migrate && npx vitest run tests/connectors/woocommerce/write.test.ts`
Expected: FAIL (`fullReplace`/`applyDelta` not exported).

- [ ] **Step 3: Implement** — replace `write.ts`:

```ts
import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { Order } from '@/lib/types';

const CHUNK = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertOrders(client: PoolClient, orders: Order[]): Promise<void> {
  for (const part of chunk(orders, CHUNK)) {
    const values: unknown[] = [];
    const rows = part.map((o, i) => {
      const b = i * 4;
      values.push(o.orderId, o.customerId, o.date, o.revenue);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},false)`;
    });
    await client.query(
      `INSERT INTO orders(order_id, customer_id, date, revenue, is_first_order) VALUES ${rows.join(',')}
       ON CONFLICT (order_id) DO UPDATE SET
         customer_id = excluded.customer_id, date = excluded.date, revenue = excluded.revenue`,
      values,
    );
  }
}

async function deleteOrders(client: PoolClient, ids: string[]): Promise<void> {
  for (const part of chunk(ids, CHUNK)) {
    await client.query(`DELETE FROM orders WHERE order_id = ANY($1)`, [part]);
  }
}

// Recompute is_first_order (earliest order per customer) and rebuild customers
// from the orders table. Shared by fullReplace and applyDelta.
async function deriveAggregates(client: PoolClient): Promise<void> {
  await client.query(`
    UPDATE orders o SET is_first_order = (r.rn = 1)
    FROM (SELECT order_id, ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY date, order_id) AS rn FROM orders) r
    WHERE o.order_id = r.order_id`);
  await client.query('DELETE FROM customers');
  await client.query(`
    INSERT INTO customers(customer_id, first_order_date, last_order_date, orders_count, total_revenue)
    SELECT customer_id, MIN(date), MAX(date), COUNT(*), ROUND(SUM(revenue)::numeric, 2)
    FROM orders GROUP BY customer_id`);
}

export async function fullReplace(orders: Order[]): Promise<void> {
  if (orders.length === 0) {
    throw new Error('WooCommerce sync: 0 orders fetched — aborting without truncating.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE orders, customers');
    await insertOrders(client, orders);
    await deriveAggregates(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function applyDelta(upserts: Order[], deleteIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (upserts.length > 0) await insertOrders(client, upserts);
    if (deleteIds.length > 0) await deleteOrders(client, deleteIds);
    await deriveAggregates(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/connectors/woocommerce/write.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/woocommerce/write.ts tests/connectors/woocommerce/write.test.ts
git commit -m "feat: WooCommerce fullReplace + applyDelta with shared SQL aggregate derivation"
```

---

### Task 4: watermark storage

**Files:**
- Create: `src/connectors/woocommerce/watermark.ts`
- Test: `tests/connectors/woocommerce/watermark.test.ts`

**Interfaces:**
- Produces:
  - `getWatermarks(): Promise<{ syncedAt: Date | null; fullSyncedAt: Date | null }>`
  - `setWatermarks(startedAt: Date, opts: { full: boolean }): Promise<void>` — always writes `woocommerce_orders_synced_at`; also writes `woocommerce_orders_full_synced_at` when `opts.full`.
  - `shouldFullResync(syncedAt: Date | null, fullSyncedAt: Date | null, now: Date): boolean` — pure: true if either watermark is null or `now − fullSyncedAt ≥ FULL_MAX_AGE_MS` (72_000_000).

- [ ] **Step 1: Write the failing test** — `tests/connectors/woocommerce/watermark.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { getWatermarks, setWatermarks } from '@/connectors/woocommerce/watermark';
import { pool } from '@/lib/db';

describe('WooCommerce watermarks (integration, benötigt laufende DB)', () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM app_settings WHERE key IN ('woocommerce_orders_synced_at','woocommerce_orders_full_synced_at')");
  });
  afterAll(async () => { await pool.end(); });

  it('gibt null zurück, wenn nichts gesetzt ist', async () => {
    expect(await getWatermarks()).toEqual({ syncedAt: null, fullSyncedAt: null });
  });

  it('setzt bei full=true beide Watermarks', async () => {
    const t = new Date('2026-07-03T12:00:00.000Z');
    await setWatermarks(t, { full: true });
    const w = await getWatermarks();
    expect(w.syncedAt?.toISOString()).toBe(t.toISOString());
    expect(w.fullSyncedAt?.toISOString()).toBe(t.toISOString());
  });

  it('setzt bei full=false nur synced_at, lässt full_synced_at unberührt', async () => {
    const t1 = new Date('2026-07-03T12:00:00.000Z');
    await setWatermarks(t1, { full: true });
    const t2 = new Date('2026-07-03T13:00:00.000Z');
    await setWatermarks(t2, { full: false });
    const w = await getWatermarks();
    expect(w.syncedAt?.toISOString()).toBe(t2.toISOString());
    expect(w.fullSyncedAt?.toISOString()).toBe(t1.toISOString());
  });
});

import { shouldFullResync } from '@/connectors/woocommerce/watermark';

describe('shouldFullResync (pure)', () => {
  const now = new Date('2026-07-03T12:00:00.000Z');
  it('true, wenn syncedAt null ist (erster Lauf)', () => {
    expect(shouldFullResync(null, null, now)).toBe(true);
  });
  it('true, wenn fullSyncedAt älter als 20h ist', () => {
    const old = new Date(now.getTime() - 72_000_001);
    expect(shouldFullResync(new Date(now.getTime() - 1000), old, now)).toBe(true);
  });
  it('false, wenn beide gesetzt und der letzte Full-Lauf < 20h her ist', () => {
    const recent = new Date(now.getTime() - 3_600_000);
    expect(shouldFullResync(recent, recent, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/woocommerce/watermark.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement** — `src/connectors/woocommerce/watermark.ts`:

```ts
import { pool } from '@/lib/db';

const SYNCED = 'woocommerce_orders_synced_at';
const FULL = 'woocommerce_orders_full_synced_at';

async function get(key: string): Promise<Date | null> {
  const res = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  const v = res.rows[0]?.value as string | undefined;
  return v ? new Date(v) : null;
}

async function set(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings(key, value, updated_at) VALUES($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [key, value],
  );
}

export async function getWatermarks(): Promise<{ syncedAt: Date | null; fullSyncedAt: Date | null }> {
  const [syncedAt, fullSyncedAt] = await Promise.all([get(SYNCED), get(FULL)]);
  return { syncedAt, fullSyncedAt };
}

export async function setWatermarks(startedAt: Date, opts: { full: boolean }): Promise<void> {
  await set(SYNCED, startedAt.toISOString());
  if (opts.full) await set(FULL, startedAt.toISOString());
}

const FULL_MAX_AGE_MS = 72_000_000; // 20h — forces a ~nightly full resync

export function shouldFullResync(syncedAt: Date | null, fullSyncedAt: Date | null, now: Date): boolean {
  if (!syncedAt || !fullSyncedAt) return true;
  return now.getTime() - fullSyncedAt.getTime() >= FULL_MAX_AGE_MS;
}
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/connectors/woocommerce/watermark.test.ts` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/woocommerce/watermark.ts tests/connectors/woocommerce/watermark.test.ts
git commit -m "feat: WooCommerce sync watermark storage in app_settings"
```

---

### Task 5: orchestrate `scripts/sync-woocommerce.ts`

**Files:**
- Modify: `scripts/sync-woocommerce.ts`

**Interfaces:**
- Consumes: `WooCommerceClient.fetchAllOrders`, `normalizeDelta`, `fullReplace`, `applyDelta`, `getWatermarks`, `setWatermarks`, `loadConnectorConfig`.

- [ ] **Step 1: Implement** — replace `scripts/sync-woocommerce.ts`:

```ts
import { WooCommerceClient } from '../src/connectors/woocommerce/client';
import { normalizeDelta } from '../src/connectors/woocommerce/connector';
import { fullReplace, applyDelta } from '../src/connectors/woocommerce/write';
import { getWatermarks, setWatermarks, shouldFullResync } from '../src/connectors/woocommerce/watermark';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';

const DELTA_OVERLAP_MS = 60_000; // clock-skew insurance on the modified_after boundary

async function main() {
  const cfg = await loadConnectorConfig('woocommerce');
  const client = new WooCommerceClient({
    storeUrl: cfg.WOOCOMMERCE_STORE_URL,
    consumerKey: cfg.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: cfg.WOOCOMMERCE_CONSUMER_SECRET,
  });

  const startedAt = new Date();
  const { syncedAt, fullSyncedAt } = await getWatermarks();
  const full = shouldFullResync(syncedAt, fullSyncedAt, startedAt);

  if (full) {
    console.log('Full resync: fetching all orders…');
    const raw = await client.fetchAllOrders();
    const { upserts } = normalizeDelta(raw);
    console.log(`Fetched ${raw.length}; ${upserts.length} revenue orders → full replace.`);
    await fullReplace(upserts);
  } else {
    const since = new Date(syncedAt!.getTime() - DELTA_OVERLAP_MS);
    console.log(`Incremental sync: orders modified after ${since.toISOString()}…`);
    const raw = await client.fetchAllOrders(since);
    const { upserts, deleteIds } = normalizeDelta(raw);
    console.log(`Fetched ${raw.length} modified; upsert ${upserts.length}, delete ${deleteIds.length}.`);
    await applyDelta(upserts, deleteIds);
  }

  await setWatermarks(startedAt, { full });
  console.log(`Wrote orders + customers to canonical DB. Done (${full ? 'full' : 'incremental'}).`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Typecheck + full suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean typecheck, all tests PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-woocommerce.ts
git commit -m "feat: WooCommerce sync script chooses full vs incremental via watermarks"
```

---

### Task 6: deploy + live verification (VPS)

- [ ] **Step 1:** Merge the PR to `main` (needs user authorization) and run `/opt/budp/deploy.sh` on the VPS.
- [ ] **Step 2:** First run does a full resync (watermarks unset). Confirm `sync_state = ok` and order count restored (~12,881).
- [ ] **Step 3:** Run the sync again immediately. Confirm it takes the incremental path (log: "Incremental sync: orders modified after …"), completes in seconds, and order/customer counts are unchanged.

---

## Notes on the removed `writeOrdersAndCustomers`

The old export is deleted; the only caller was `scripts/sync-woocommerce.ts` (Task 5). Confirm no other importer with `grep -rn "writeOrdersAndCustomers" src scripts tests` before finishing Task 3.
