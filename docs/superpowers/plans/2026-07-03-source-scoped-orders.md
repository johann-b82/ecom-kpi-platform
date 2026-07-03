# Source-Scoped Orders & Customers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-key `orders` by `(source, source_id)` and `customers` by `uid` (`source:customer_id`) with delete-by-source writes, so Shopware and WooCommerce coexist.

**Architecture:** One shared source-scoped write module (`src/lib/orders-store.ts`) replaces the two duplicated `writeOrdersAndCustomers` paths; both shop connectors call it. `deriveAggregates` recomputes `is_first_order` and rebuilds `customers` in SQL. `orders`/`customers` are a rebuildable cache, so the migration drops+recreates them and clears the WooCommerce watermarks to force a full backfill. The KPI engine is unchanged (matches by `customerId`, value now a source-scoped uid).

**Tech Stack:** TypeScript, Node 22, `pg`, Vitest (real-Postgres integration tests via `DATABASE_URL`).

## Global Constraints

- Node 22+.
- `orders` PK `(source, source_id)`, column `customer_uid` = `source:customer_id`; `customers` PK `uid` (= `source:customer_id`) + `source` column.
- Writes are delete-by-source, never TRUNCATE. Full path aborts on 0 orders (before deleting that source).
- `customers` + `is_first_order` are always re-derived in SQL from the whole `orders` table, in the same transaction.
- Domain type field names in `src/lib/types.ts` are unchanged; only the values become source-scoped. `care.ts` and the rest of `src/kpi` are untouched.
- Integration tests: run `npm run migrate` against `DATABASE_URL` first. Local dev DB: `postgres://postgres:postgres@localhost:5544/postgres` (disposable `woo-test-pg` container).
- No cross-source customer unification (YAGNI).

---

### Task 1: Source-scoped schema + drop/recreate migration

**Files:**
- Modify: `db/schema.sql` (customers/orders section, lines ~10-25)
- Test: `tests/db/source-scope-migration.test.ts` (create)

**Interfaces:**
- Produces: `orders(source, source_id, customer_uid, date, revenue, is_first_order)` PK `(source, source_id)`; `customers(uid, source, first_order_date, last_order_date, orders_count, total_revenue)` PK `uid`. A migration guard drops the legacy shape and clears WooCommerce watermarks.

- [ ] **Step 1: Write the failing test** — `tests/db/source-scope-migration.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { pool } from '@/lib/db';

const schema = readFileSync(new URL('../../db/schema.sql', import.meta.url), 'utf8');

describe('source-scope migration (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  beforeEach(async () => {
    // simulate the LEGACY shape + a WooCommerce watermark
    await pool.query('DROP TABLE IF EXISTS orders CASCADE; DROP TABLE IF EXISTS customers CASCADE;');
    await pool.query(`CREATE TABLE orders (order_id TEXT PRIMARY KEY, customer_id TEXT NOT NULL,
      date DATE NOT NULL, revenue DOUBLE PRECISION NOT NULL, is_first_order BOOLEAN NOT NULL);`);
    await pool.query(`CREATE TABLE customers (customer_id TEXT PRIMARY KEY, first_order_date DATE NOT NULL,
      last_order_date DATE NOT NULL, orders_count INTEGER NOT NULL, total_revenue DOUBLE PRECISION NOT NULL);`);
    await pool.query(`INSERT INTO orders VALUES ('legacy1','c1','2026-01-01',10,true);`);
    await pool.query(`INSERT INTO app_settings(key, value) VALUES ('woocommerce_orders_synced_at','x')
      ON CONFLICT (key) DO UPDATE SET value = excluded.value;`);
  });

  it('migriert die Legacy-Tabellen auf das source-scoped Schema und löscht die WooCommerce-Watermarks', async () => {
    await pool.query(schema); // applying schema.sql runs the guard + recreates
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns WHERE table_name='orders'`,
    );
    const names = cols.rows.map((r) => r.column_name);
    expect(names).toContain('source');
    expect(names).toContain('source_id');
    expect(names).toContain('customer_uid');
    expect(names).not.toContain('order_id');
    const cnt = await pool.query('SELECT count(*)::int AS n FROM orders');
    expect(cnt.rows[0].n).toBe(0); // legacy row dropped, cache empty until resync
    const wm = await pool.query("SELECT count(*)::int AS n FROM app_settings WHERE key LIKE 'woocommerce_orders%'");
    expect(wm.rows[0].n).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres npx vitest run tests/db/source-scope-migration.test.ts`
Expected: FAIL (schema still creates `order_id`).

- [ ] **Step 3: Implement** — in `db/schema.sql`, replace the `customers` + `orders` blocks (the two `CREATE TABLE`s and the `orders_date_idx` line) with:

```sql
-- Source-scope orders/customers (legacy single-key → composite). Cache tables:
-- drop + recreate, and clear the WooCommerce watermarks so the next sync does a
-- full backfill instead of an incremental delta against empty tables.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'orders' AND column_name = 'order_id') THEN
    DROP TABLE IF EXISTS orders CASCADE;
    DROP TABLE IF EXISTS customers CASCADE;
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
      DELETE FROM app_settings
       WHERE key IN ('woocommerce_orders_synced_at', 'woocommerce_orders_full_synced_at');
    END IF;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS customers (
  uid              TEXT PRIMARY KEY,
  source           TEXT NOT NULL,
  first_order_date DATE NOT NULL,
  last_order_date  DATE NOT NULL,
  orders_count     INTEGER NOT NULL,
  total_revenue    DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  source        TEXT NOT NULL,
  source_id     TEXT NOT NULL,
  customer_uid  TEXT NOT NULL,
  date          DATE NOT NULL,
  revenue       DOUBLE PRECISION NOT NULL,
  is_first_order BOOLEAN NOT NULL,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX IF NOT EXISTS orders_date_idx ON orders (date);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_uid);
```

- [ ] **Step 4: Run test** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql tests/db/source-scope-migration.test.ts
git commit -m "feat: source-scoped orders/customers schema + drop-recreate migration"
```

---

### Task 2: Read mapping — repository + test helper to new columns

**Files:**
- Modify: `src/kpi/repository.ts:12-13`
- Modify: `tests/helpers/pg-supabase.ts:12-13`
- Test: `tests/kpi/repository-source-scope.test.ts` (create)

**Interfaces:**
- Produces: `loadDataset(supabase)` returns orders as `{orderId: source_id, customerId: customer_uid, date, revenue, isFirstOrder}` and customers as `{customerId: uid, …}`. The `pgSupabase()` helper mirrors this for integration tests.

- [ ] **Step 1: Write the failing test** — `tests/kpi/repository-source-scope.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import { pgSupabase } from '../helpers/pg-supabase';

describe('loadDataset source-scoped mapping (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => {
    await pool.query('DELETE FROM orders; DELETE FROM customers;');
    await pool.query(`INSERT INTO orders(source, source_id, customer_uid, date, revenue, is_first_order)
      VALUES ('woocommerce','1','woocommerce:5','2026-05-01',100,true);`);
    await pool.query(`INSERT INTO customers(uid, source, first_order_date, last_order_date, orders_count, total_revenue)
      VALUES ('woocommerce:5','woocommerce','2026-05-01','2026-05-01',1,100);`);
  });

  it('mappt die source-scoped Spalten auf die Domain-Felder', async () => {
    const ds = await loadDataset(pgSupabase());
    expect(ds.orders[0]).toMatchObject({ orderId: '1', customerId: 'woocommerce:5', revenue: 100, isFirstOrder: true });
    expect(ds.customers[0]).toMatchObject({ customerId: 'woocommerce:5', ordersCount: 1 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres npx vitest run tests/kpi/repository-source-scope.test.ts`
Expected: FAIL (old SELECT references `order_id`/`customer_id`).

- [ ] **Step 3: Implement** —

`src/kpi/repository.ts` lines 12-13, replace the orders + customers selects:

```ts
    supabase.from('orders').select('orderId:source_id, customerId:customer_uid, date, revenue, isFirstOrder:is_first_order'),
    supabase.from('customers').select('customerId:uid, firstOrderDate:first_order_date, lastOrderDate:last_order_date, ordersCount:orders_count, totalRevenue:total_revenue'),
```

`tests/helpers/pg-supabase.ts` lines 12-13, replace the `orders` and `customers` entries:

```ts
  orders: `SELECT source_id AS "orderId", customer_uid AS "customerId", date::text AS date, revenue, is_first_order AS "isFirstOrder" FROM orders`,
  customers: `SELECT uid AS "customerId", first_order_date::text AS "firstOrderDate", last_order_date::text AS "lastOrderDate", orders_count AS "ordersCount", total_revenue AS "totalRevenue" FROM customers`,
```

- [ ] **Step 4: Run test** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/kpi/repository.ts tests/helpers/pg-supabase.ts tests/kpi/repository-source-scope.test.ts
git commit -m "feat: map source-scoped orders/customers columns in the KPI read layer"
```

---

### Task 3: Shared source-scoped write module

**Files:**
- Create: `src/lib/orders-store.ts`
- Test: `tests/lib/orders-store.test.ts` (create)

**Interfaces:**
- Consumes: `Order` from `@/lib/types`; `pool` from `@/lib/db`.
- Produces:
  - `fullReplace(source: string, orders: Order[]): Promise<void>` — `DELETE FROM orders WHERE source=$1`, insert (source-stamped), `deriveAggregates`. Aborts if `orders.length === 0`.
  - `applyDelta(source: string, upserts: Order[], deleteIds: string[]): Promise<void>` — upsert on `(source, source_id)`, delete `WHERE source=$1 AND source_id = ANY($2)`, `deriveAggregates`.
  - Each `Order`: `source_id = orderId`, `customer_uid = source + ':' + customerId`.

- [ ] **Step 1: Write the failing test** — `tests/lib/orders-store.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { fullReplace, applyDelta } from '@/lib/orders-store';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import { pgSupabase } from '../helpers/pg-supabase';
import type { Order } from '@/lib/types';

const woo: Order[] = [
  { orderId: '1', customerId: '11', date: '2026-05-01', revenue: 100, isFirstOrder: false },
  { orderId: '2', customerId: '11', date: '2026-05-02', revenue: 50, isFirstOrder: false },
];
const shop: Order[] = [
  { orderId: 'A', customerId: '11', date: '2026-05-03', revenue: 30, isFirstOrder: false },
];

describe('orders-store (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });
  beforeEach(async () => { await pool.query('DELETE FROM orders; DELETE FROM customers;'); });

  it('fullReplace stampt source und leitet customers + is_first_order source-scoped ab', async () => {
    await fullReplace('woocommerce', woo);
    const ds = await loadDataset(pgSupabase());
    expect(ds.orders.map((o) => o.customerId).sort()).toEqual(['woocommerce:11', 'woocommerce:11']);
    const c = ds.customers.find((x) => x.customerId === 'woocommerce:11')!;
    expect(c).toMatchObject({ ordersCount: 2, firstOrderDate: '2026-05-01', lastOrderDate: '2026-05-02' });
    expect(c.totalRevenue).toBeCloseTo(150);
    expect(ds.orders.filter((o) => o.isFirstOrder).length).toBe(1);
  });

  it('zwei Quellen koexistieren — fullReplace der einen lässt die andere unberührt', async () => {
    await fullReplace('woocommerce', woo);
    await fullReplace('shopware', shop);
    const ds = await loadDataset(pgSupabase());
    expect(ds.customers.map((c) => c.customerId).sort()).toEqual(['shopware:11', 'woocommerce:11']);
    // re-running woocommerce must not touch shopware rows
    await fullReplace('woocommerce', woo);
    const ds2 = await loadDataset(pgSupabase());
    expect(ds2.customers.some((c) => c.customerId === 'shopware:11')).toBe(true);
  });

  it('fullReplace bricht bei 0 Orders ab, ohne die Quelle zu löschen', async () => {
    await fullReplace('woocommerce', woo);
    await expect(fullReplace('woocommerce', [])).rejects.toThrow(/0 orders/i);
    expect((await loadDataset(pgSupabase())).orders.length).toBe(2);
  });

  it('applyDelta upsertet/löscht nur innerhalb seiner Quelle', async () => {
    await fullReplace('woocommerce', woo);
    await fullReplace('shopware', shop);
    await applyDelta('woocommerce',
      [{ orderId: '2', customerId: '11', date: '2026-05-02', revenue: 999, isFirstOrder: false }],
      ['1']);
    const ds = await loadDataset(pgSupabase());
    expect(ds.orders.find((o) => o.orderId === '2' && o.customerId === 'woocommerce:11')!.revenue).toBeCloseTo(999);
    expect(ds.orders.some((o) => o.orderId === '1')).toBe(false);
    expect(ds.orders.some((o) => o.customerId === 'shopware:11')).toBe(true); // shopware untouched
  });

  it('applyDelta ist idempotent', async () => {
    await fullReplace('woocommerce', woo);
    const d: Order[] = [{ orderId: '3', customerId: '11', date: '2026-05-04', revenue: 20, isFirstOrder: false }];
    await applyDelta('woocommerce', d, []);
    await applyDelta('woocommerce', d, []);
    const ds = await loadDataset(pgSupabase());
    expect(ds.orders.filter((o) => o.orderId === '3').length).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres npx vitest run tests/lib/orders-store.test.ts`
Expected: FAIL (`@/lib/orders-store` not found).

- [ ] **Step 3: Implement** — `src/lib/orders-store.ts`:

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

async function insertOrders(client: PoolClient, source: string, orders: Order[]): Promise<void> {
  for (const part of chunk(orders, CHUNK)) {
    const values: unknown[] = [source]; // $1, reused as the source for every row
    const rows = part.map((o, i) => {
      const b = 1 + i * 4;
      values.push(o.orderId, `${source}:${o.customerId}`, o.date, o.revenue);
      return `($1,$${b + 1},$${b + 2},$${b + 3},$${b + 4},false)`;
    });
    await client.query(
      `INSERT INTO orders(source, source_id, customer_uid, date, revenue, is_first_order) VALUES ${rows.join(',')}
       ON CONFLICT (source, source_id) DO UPDATE SET
         customer_uid = excluded.customer_uid, date = excluded.date, revenue = excluded.revenue`,
      values,
    );
  }
}

async function deriveAggregates(client: PoolClient): Promise<void> {
  await client.query(`
    UPDATE orders o SET is_first_order = (r.rn = 1)
    FROM (SELECT source, source_id,
            ROW_NUMBER() OVER (PARTITION BY customer_uid ORDER BY date, source_id) AS rn
          FROM orders) r
    WHERE o.source = r.source AND o.source_id = r.source_id`);
  await client.query('DELETE FROM customers');
  await client.query(`
    INSERT INTO customers(uid, source, first_order_date, last_order_date, orders_count, total_revenue)
    SELECT customer_uid, source, MIN(date), MAX(date), COUNT(*), ROUND(SUM(revenue)::numeric, 2)
    FROM orders GROUP BY customer_uid, source`);
}

export async function fullReplace(source: string, orders: Order[]): Promise<void> {
  if (orders.length === 0) {
    throw new Error(`${source} sync: 0 orders fetched — aborting without deleting.`);
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM orders WHERE source = $1', [source]);
    await insertOrders(client, source, orders);
    await deriveAggregates(client);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function applyDelta(source: string, upserts: Order[], deleteIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (upserts.length > 0) await insertOrders(client, source, upserts);
    for (const part of chunk(deleteIds, CHUNK)) {
      await client.query('DELETE FROM orders WHERE source = $1 AND source_id = ANY($2)', [source, part]);
    }
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

- [ ] **Step 4: Run test** — same command → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/orders-store.ts tests/lib/orders-store.test.ts
git commit -m "feat: shared source-scoped orders-store (fullReplace/applyDelta/deriveAggregates)"
```

---

### Task 4: Wire WooCommerce onto orders-store

**Files:**
- Delete: `src/connectors/woocommerce/write.ts`, `tests/connectors/woocommerce/write.test.ts` (superseded by orders-store)
- Modify: `scripts/sync-woocommerce.ts`

**Interfaces:**
- Consumes: `fullReplace`/`applyDelta` from `@/lib/orders-store`; `normalizeDelta` from the connector (unchanged — produces raw ids).

- [ ] **Step 1: Delete the superseded WooCommerce write layer + its test**

```bash
git rm src/connectors/woocommerce/write.ts tests/connectors/woocommerce/write.test.ts
```

- [ ] **Step 2: Update `scripts/sync-woocommerce.ts`** imports + calls (pass the source):

```ts
import { fullReplace, applyDelta } from '../src/lib/orders-store';
```

and change the two write calls to:

```ts
    await fullReplace('woocommerce', upserts);
```
```ts
    await applyDelta('woocommerce', upserts, deleteIds);
```

- [ ] **Step 3: Verify** — no dangling imports, typecheck, and the incremental tests still green:

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres bash -c 'grep -rn "connectors/woocommerce/write" src scripts tests || echo NONE; npx tsc --noEmit && echo tsc-clean'`
Expected: `NONE`, `tsc-clean`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: WooCommerce sync uses shared source-scoped orders-store"
```

---

### Task 5: Wire Shopware onto orders-store

**Files:**
- Modify: `src/connectors/shopware/connector.ts` (`normalizeOrders` → return `Order[]`)
- Delete: `src/connectors/shopware/write.ts`
- Modify: `scripts/sync-shopware.ts`
- Modify: `tests/connectors/shopware/normalize.test.ts`
- Delete: `tests/connectors/shopware/write.test.ts` (superseded by orders-store)

**Interfaces:**
- Produces: `normalizeOrders(rawOrders: ShopwareOrder[]): Order[]` — revenue rows only (cancelled excluded), `isFirstOrder: false` placeholder (SQL derives it).

- [ ] **Step 1: Rewrite `tests/connectors/shopware/normalize.test.ts`** to the new return shape. Replace its body:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeOrders } from '@/connectors/shopware/connector';
import type { ShopwareOrder } from '@/connectors/shopware/types';

function o(id: string, cust: string, date: string, total: number, state = 'open'): ShopwareOrder {
  return { id, orderCustomer: { customerId: cust }, orderDateTime: `${date}T00:00:00`, amountTotal: total,
    stateMachineState: { technicalName: state } } as unknown as ShopwareOrder;
}

describe('normalizeOrders (Shopware)', () => {
  it('gibt Order-Rows zurück (cancelled ausgeschlossen), ohne JS-Aggregation', () => {
    const rows = normalizeOrders([o('1', '11', '2026-01-05', 100), o('2', '11', '2026-02-10', 200), o('3', '22', '2026-01-20', 50, 'cancelled')]);
    expect(rows.map((r) => r.orderId)).toEqual(['1', '2']);
    expect(rows[0]).toMatchObject({ orderId: '1', customerId: '11', date: '2026-01-05', revenue: 100, isFirstOrder: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres npx vitest run tests/connectors/shopware/normalize.test.ts`
Expected: FAIL (`normalizeOrders` still returns a `CanonicalDataset`).

- [ ] **Step 3: Implement** — replace `src/connectors/shopware/connector.ts` entirely:

```ts
import type { Order } from '@/lib/types';
import type { ShopwareOrder } from './types';

// Revenue rows only (cancelled excluded). customers + is_first_order are derived
// downstream in SQL (orders-store), so this no longer aggregates.
export function normalizeOrders(rawOrders: ShopwareOrder[]): Order[] {
  return rawOrders
    .filter((o) => o.stateMachineState?.technicalName !== 'cancelled')
    .map((o) => ({
      orderId: o.id,
      customerId: o.orderCustomer?.customerId ?? o.orderCustomer?.id ?? 'unknown',
      date: o.orderDateTime.slice(0, 10),
      revenue: o.amountTotal,
      isFirstOrder: false,
    }));
}
```

- [ ] **Step 4: Delete the Shopware write layer + its test, update the sync script**

```bash
git rm src/connectors/shopware/write.ts tests/connectors/shopware/write.test.ts
```

Replace `scripts/sync-shopware.ts`:

```ts
import { ShopwareClient } from '../src/connectors/shopware/client';
import { normalizeOrders } from '../src/connectors/shopware/connector';
import { fullReplace } from '../src/lib/orders-store';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';

async function main() {
  const cfg = await loadConnectorConfig('shopware');
  const client = new ShopwareClient({ apiUrl: cfg.SHOPWARE_API_URL, clientId: cfg.SHOPWARE_CLIENT_ID, clientSecret: cfg.SHOPWARE_CLIENT_SECRET });
  console.log('Fetching orders from Shopware…');
  const raw = await client.fetchAllOrders();
  console.log(`Fetched ${raw.length} raw orders.`);

  const orders = normalizeOrders(raw);
  console.log(`Normalized → ${orders.length} orders (cancelled excluded).`);

  await fullReplace('shopware', orders);
  console.log('Wrote orders + customers to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 5: Run tests + typecheck**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres bash -c 'grep -rn "connectors/shopware/write" src scripts tests || echo NONE; npx vitest run tests/connectors/shopware && npx tsc --noEmit && echo tsc-clean'`
Expected: `NONE`, tests PASS, `tsc-clean`.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: Shopware sync uses shared source-scoped orders-store"
```

---

### Task 6: Full verification + deploy

- [ ] **Step 1: Full suite + typecheck** (reset DB first, since integration tests mutate it)

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres bash -c 'npm run migrate && npx vitest run && npx tsc --noEmit'`
Expected: all tests PASS, `tsc` clean.

- [ ] **Step 2: Merge the PR to `main`** (needs user authorization) and run `/opt/budp/deploy.sh` on the VPS. The migration guard drops the legacy tables and clears the WooCommerce watermarks.

- [ ] **Step 3: Trigger a WooCommerce full backfill on the VPS** (watermarks are cleared → `shouldFullResync` true):
`docker run --rm --network supabase_default --env-file /opt/budp/app.env budp-app:local npm run sync:woocommerce`
Confirm: log says "Full resync", ~12.9k orders written, `orders`/`customers` repopulated, all rows `source='woocommerce'`.

- [ ] **Step 4: Verify coexistence-readiness** — query `SELECT DISTINCT source FROM orders;` returns `woocommerce`, and Care KPIs render on the dashboard.

---

## Notes

- `src/lib/types.ts` is intentionally unchanged — the domain field names stay; only the values become source-scoped.
- `db/rls.sql` is unchanged: it re-applies `GRANT SELECT` + `authenticated_read` policies on `orders`/`customers` after the drop/recreate on every `migrate`.
- Shopware stays full-replace (now delete-by-source); incremental sync for Shopware is out of scope.
