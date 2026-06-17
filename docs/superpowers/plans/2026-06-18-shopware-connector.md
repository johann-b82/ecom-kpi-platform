# Shopware-6-Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Echte Bestell-/Kundendaten aus Shopware 6 (Admin-API) über einen On-Demand-CLI-Sync ins bestehende kanonische Schema laden, sodass DO/CARE-KPIs Live-Daten zeigen.

**Architecture:** Drei isolierte Einheiten nach dem vorhandenen `Connector`-Muster: `client.ts` (OAuth2-Auth + paginiertes Fetch), `connector.ts` (`normalizeOrders()` → `CanonicalDataset`, rein/testbar), `write.ts` (transaktionaler Full-Replace von nur `orders`+`customers`). Ein CLI-Skript `scripts/sync-shopware.ts` verdrahtet fetch→normalize→write. Engine/API/UI bleiben unverändert.

**Tech Stack:** TypeScript · `fetch` (global, in Tests injiziert) · `pg` · `tsx` · Vitest. Baut auf KPI-Plattform V1.

## Global Constraints

- Auth: **OAuth2 `client_credentials`** gegen `{SHOPWARE_API_URL}/api/oauth/token` (client_id = Access Key ID, client_secret = Secret).
- Es werden **nur `orders` + `customers`** befüllt. `daily_metrics`, `ad_spend`, `subscribers` bleiben unangetastet. **Kein Schema-Change.**
- `revenue` = `order.amountTotal` (**brutto**, inkl. Steuer).
- **Stornos ausschließen:** Orders mit `stateMachineState.technicalName === 'cancelled'` zählen nicht.
- `customerId` = `orderCustomer.customerId`, Fallback `orderCustomer.id` (Gastbestellung), sonst `'unknown'`.
- `customers[]` wird **aus den Orders abgeleitet** (Gruppierung nach `customerId`), nicht separat gefetcht — konsistent mit `orders`.
- Schreiben = **Transaktion, Full-Replace**: `TRUNCATE orders, customers` + gebündelte Multi-Row-Inserts. **Bei 0 Orders abbrechen ohne TRUNCATE.**
- Sync = **On-Demand-CLI** `npm run sync:shopware`. **Kein Scheduler.**
- **Secrets nur in `.env`** (gitignored), nie in Fixtures/Commits.
- Kanonische Typen (unverändert aus V1): `Order { orderId, customerId, date, revenue, isFirstOrder }`, `Customer { customerId, firstOrderDate, lastOrderDate, ordersCount, totalRevenue }`, `CanonicalDataset { dailyMetrics, orders, customers, adSpend, subscribers }`.

---

## File Structure

```
src/connectors/shopware/
  types.ts        # Shopware-Rohtypen (ShopwareOrder, ShopwareOrderPage, …)
  connector.ts    # normalizeOrders(raw): CanonicalDataset  (rein)
  client.ts       # ShopwareClient: getToken + fetchAllOrders (paginiert, 401-Refresh)
  write.ts        # writeOrdersAndCustomers(data): transaktionaler Full-Replace
scripts/sync-shopware.ts   # CLI: fetch → normalize → write
tests/connectors/shopware/
  normalize.test.ts   # rein, Fixtures inline
  client.test.ts      # gemockter fetch
  write.test.ts       # Integration gegen DB
.env.example        # + SHOPWARE_* Variablen
package.json        # + "sync:shopware" script
```

---

### Task 1: Shopware-Rohtypen & `normalizeOrders` (rein)

**Files:**
- Create: `src/connectors/shopware/types.ts`, `src/connectors/shopware/connector.ts`
- Test: `tests/connectors/shopware/normalize.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset`, `Order`, `Customer` aus `@/lib/types`.
- Produces:
  - Typen `ShopwareOrderCustomer`, `ShopwareOrderState`, `ShopwareOrder`, `ShopwareOrderPage`.
  - `normalizeOrders(rawOrders: ShopwareOrder[]): CanonicalDataset` — befüllt nur `orders`+`customers`; schließt `cancelled` aus; `revenue=amountTotal`; `date=orderDateTime[0:10]`; `isFirstOrder` = früheste Order je Kunde; Kunden abgeleitet.

- [ ] **Step 1: Rohtypen anlegen**

`src/connectors/shopware/types.ts`:
```ts
export interface ShopwareOrderCustomer {
  customerId: string | null;
  id: string;
}
export interface ShopwareOrderState {
  technicalName: string;
}
export interface ShopwareOrder {
  id: string;
  orderDateTime: string;          // ISO, z.B. "2026-01-05T10:00:00.000+00:00"
  amountTotal: number;            // brutto
  amountNet?: number;
  stateMachineState?: ShopwareOrderState;
  orderCustomer?: ShopwareOrderCustomer;
}
export interface ShopwareOrderPage {
  data: ShopwareOrder[];
  total: number;
}
```

- [ ] **Step 2: Failing test schreiben**

`tests/connectors/shopware/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeOrders } from '@/connectors/shopware/connector';
import type { ShopwareOrder } from '@/connectors/shopware/types';

const raw: ShopwareOrder[] = [
  { id: 'o1', orderDateTime: '2026-01-05T10:00:00.000+00:00', amountTotal: 100, stateMachineState: { technicalName: 'open' }, orderCustomer: { customerId: 'c1', id: 'oc1' } },
  { id: 'o2', orderDateTime: '2026-02-10T10:00:00.000+00:00', amountTotal: 200, stateMachineState: { technicalName: 'completed' }, orderCustomer: { customerId: 'c1', id: 'oc2' } },
  { id: 'o3', orderDateTime: '2026-01-20T10:00:00.000+00:00', amountTotal: 50, stateMachineState: { technicalName: 'open' }, orderCustomer: { customerId: 'c2', id: 'oc3' } },
  { id: 'o4', orderDateTime: '2026-03-01T10:00:00.000+00:00', amountTotal: 999, stateMachineState: { technicalName: 'cancelled' }, orderCustomer: { customerId: 'c2', id: 'oc4' } },
];

describe('normalizeOrders', () => {
  it('mappt Orders, schließt Stornos aus, nutzt Brutto-Betrag', () => {
    const ds = normalizeOrders(raw);
    expect(ds.orders).toHaveLength(3); // o4 (cancelled) ausgeschlossen
    expect(ds.orders.find((o) => o.orderId === 'o1')!.revenue).toBe(100);
    expect(ds.orders.find((o) => o.orderId === 'o1')!.date).toBe('2026-01-05');
    expect(ds.orders.some((o) => o.orderId === 'o4')).toBe(false);
  });
  it('flaggt die früheste Bestellung je Kunde als isFirstOrder', () => {
    const ds = normalizeOrders(raw);
    expect(ds.orders.find((o) => o.orderId === 'o1')!.isFirstOrder).toBe(true);
    expect(ds.orders.find((o) => o.orderId === 'o2')!.isFirstOrder).toBe(false);
    expect(ds.orders.find((o) => o.orderId === 'o3')!.isFirstOrder).toBe(true); // c2 frühste (o4 raus)
  });
  it('leitet konsistente Kunden-Aggregate ab und füllt nur orders+customers', () => {
    const ds = normalizeOrders(raw);
    const c1 = ds.customers.find((c) => c.customerId === 'c1')!;
    expect(c1.ordersCount).toBe(2);
    expect(c1.totalRevenue).toBeCloseTo(300);
    expect(c1.firstOrderDate).toBe('2026-01-05');
    expect(c1.lastOrderDate).toBe('2026-02-10');
    expect(ds.dailyMetrics).toHaveLength(0);
    expect(ds.adSpend).toHaveLength(0);
    expect(ds.subscribers).toHaveLength(0);
  });
  it('nutzt orderCustomer.id als Fallback bei fehlender customerId (Gast)', () => {
    const guest: ShopwareOrder[] = [
      { id: 'g1', orderDateTime: '2026-01-01T00:00:00.000+00:00', amountTotal: 30, stateMachineState: { technicalName: 'open' }, orderCustomer: { customerId: null, id: 'guest-oc' } },
    ];
    const ds = normalizeOrders(guest);
    expect(ds.orders[0].customerId).toBe('guest-oc');
  });
});
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/shopware/normalize.test.ts`
Expected: FAIL — `@/connectors/shopware/connector` nicht gefunden.

- [ ] **Step 4: `normalizeOrders` implementieren**

`src/connectors/shopware/connector.ts`:
```ts
import type { CanonicalDataset, Customer, Order } from '@/lib/types';
import type { ShopwareOrder } from './types';

export function normalizeOrders(rawOrders: ShopwareOrder[]): CanonicalDataset {
  const orders: Order[] = rawOrders
    .filter((o) => o.stateMachineState?.technicalName !== 'cancelled')
    .map((o) => ({
      orderId: o.id,
      customerId: o.orderCustomer?.customerId ?? o.orderCustomer?.id ?? 'unknown',
      date: o.orderDateTime.slice(0, 10),
      revenue: o.amountTotal,
      isFirstOrder: false,
    }));

  // isFirstOrder = früheste Order je Kunde (genau eine)
  const earliest = new Map<string, string>();
  for (const o of orders) {
    const cur = earliest.get(o.customerId);
    if (!cur || o.date < cur) earliest.set(o.customerId, o.date);
  }
  const flagged = new Set<string>();
  for (const o of orders) {
    if (!flagged.has(o.customerId) && o.date === earliest.get(o.customerId)) {
      o.isFirstOrder = true;
      flagged.add(o.customerId);
    }
  }

  // Kunden aus Orders ableiten
  const byCustomer = new Map<string, Order[]>();
  for (const o of orders) {
    const arr = byCustomer.get(o.customerId) ?? [];
    arr.push(o);
    byCustomer.set(o.customerId, arr);
  }
  const customers: Customer[] = [...byCustomer.entries()].map(([customerId, custOrders]) => {
    const dates = custOrders.map((o) => o.date).sort();
    return {
      customerId,
      firstOrderDate: dates[0],
      lastOrderDate: dates[dates.length - 1],
      ordersCount: custOrders.length,
      totalRevenue: Math.round(custOrders.reduce((s, o) => s + o.revenue, 0) * 100) / 100,
    };
  });

  return { dailyMetrics: [], orders, customers, adSpend: [], subscribers: [] };
}
```

- [ ] **Step 5: Test ausführen — grün**

Run: `npm test -- tests/connectors/shopware/normalize.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/connectors/shopware/types.ts src/connectors/shopware/connector.ts tests/connectors/shopware/normalize.test.ts
git commit -m "feat: shopware order normalization to canonical dataset"
```

---

### Task 2: `ShopwareClient` (Auth + paginiertes Fetch)

**Files:**
- Create: `src/connectors/shopware/client.ts`
- Test: `tests/connectors/shopware/client.test.ts`

**Interfaces:**
- Consumes: `ShopwareOrder`, `ShopwareOrderPage` aus `./types`.
- Produces:
  - `interface ShopwareConfig { apiUrl: string; clientId: string; clientSecret: string }`
  - `class ShopwareClient` mit Konstruktor `(config: ShopwareConfig, fetchImpl?: typeof fetch)`, `getToken(): Promise<string>`, `fetchAllOrders(): Promise<ShopwareOrder[]>` (paginiert `limit=500`, erneuert Token bei `401` und wiederholt).

- [ ] **Step 1: Failing test schreiben**

`tests/connectors/shopware/client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { ShopwareClient } from '@/connectors/shopware/client';

const config = { apiUrl: 'https://shop.example', clientId: 'id', clientSecret: 'secret' };

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('ShopwareClient', () => {
  it('holt ein Token und paginiert bis total erreicht ist', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ access_token: 'T', expires_in: 600 }))      // token
      .mockResolvedValueOnce(res({ data: [{ id: 'o1' }, { id: 'o2' }], total: 3 })) // page 1
      .mockResolvedValueOnce(res({ data: [{ id: 'o3' }], total: 3 }));             // page 2
    const client = new ShopwareClient(config, fetchMock as unknown as typeof fetch);
    const orders = await client.fetchAllOrders();
    expect(orders.map((o) => o.id)).toEqual(['o1', 'o2', 'o3']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // erster Call ist der Token-Endpoint
    expect((fetchMock.mock.calls[0][0] as string)).toContain('/api/oauth/token');
  });

  it('erneuert das Token bei 401 und wiederholt den Request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ access_token: 'T1' }))            // initial token
      .mockResolvedValueOnce(res({}, 401))                          // page1 → 401
      .mockResolvedValueOnce(res({ access_token: 'T2' }))           // refresh token
      .mockResolvedValueOnce(res({ data: [{ id: 'o1' }], total: 1 })); // retry page1
    const client = new ShopwareClient(config, fetchMock as unknown as typeof fetch);
    const orders = await client.fetchAllOrders();
    expect(orders.map((o) => o.id)).toEqual(['o1']);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('wirft bei fehlgeschlagenem Auth', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res({ error: 'bad' }, 401));
    const client = new ShopwareClient(config, fetchMock as unknown as typeof fetch);
    await expect(client.getToken()).rejects.toThrow(/auth failed/i);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/shopware/client.test.ts`
Expected: FAIL — `@/connectors/shopware/client` nicht gefunden.

- [ ] **Step 3: `ShopwareClient` implementieren**

`src/connectors/shopware/client.ts`:
```ts
import type { ShopwareOrder, ShopwareOrderPage } from './types';

export interface ShopwareConfig {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
}

const PAGE_SIZE = 500;

export class ShopwareClient {
  private token: string | null = null;

  constructor(
    private readonly config: ShopwareConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getToken(): Promise<string> {
    const res = await this.fetchImpl(`${this.config.apiUrl}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });
    if (!res.ok) {
      throw new Error(`Shopware auth failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { access_token: string };
    this.token = json.access_token;
    return this.token;
  }

  private async authedGet(path: string): Promise<Response> {
    if (!this.token) await this.getToken();
    let res = await this.fetchImpl(`${this.config.apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (res.status === 401) {
      await this.getToken();
      res = await this.fetchImpl(`${this.config.apiUrl}${path}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
    }
    return res;
  }

  async fetchAllOrders(): Promise<ShopwareOrder[]> {
    const all: ShopwareOrder[] = [];
    let page = 1;
    for (;;) {
      const path =
        `/api/order?limit=${PAGE_SIZE}&page=${page}&total-count-mode=1` +
        `&associations[orderCustomer][]&associations[stateMachineState][]`;
      const res = await this.authedGet(path);
      if (!res.ok) {
        throw new Error(`Shopware fetch failed: ${res.status} ${await res.text()}`);
      }
      const json = (await res.json()) as ShopwareOrderPage;
      all.push(...json.data);
      if (json.data.length === 0 || all.length >= (json.total ?? all.length)) break;
      page += 1;
    }
    return all;
  }
}
```

- [ ] **Step 4: Test ausführen — grün**

Run: `npm test -- tests/connectors/shopware/client.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/shopware/client.ts tests/connectors/shopware/client.test.ts
git commit -m "feat: shopware admin api client with oauth and pagination"
```

---

### Task 3: Transaktionaler Write, CLI-Skript & Konfiguration

**Files:**
- Create: `src/connectors/shopware/write.ts`, `scripts/sync-shopware.ts`
- Modify: `package.json` (Script `sync:shopware`), `.env.example` (SHOPWARE_*)
- Test: `tests/connectors/shopware/write.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset` aus `@/lib/types`; `pool` aus `@/lib/db`; `ShopwareClient` (Task 2), `normalizeOrders` (Task 1).
- Produces: `writeOrdersAndCustomers(data: CanonicalDataset): Promise<void>` — Transaktion: `TRUNCATE orders, customers` + gebündelte Inserts; wirft bei `data.orders.length === 0` **ohne** zu truncaten.

- [ ] **Step 1: Failing integration test schreiben**

`tests/connectors/shopware/write.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { writeOrdersAndCustomers } from '@/connectors/shopware/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  dailyMetrics: [], adSpend: [], subscribers: [],
  orders: [
    { orderId: 'sw1', customerId: 'k1', date: '2026-05-01', revenue: 120, isFirstOrder: true },
    { orderId: 'sw2', customerId: 'k1', date: '2026-05-20', revenue: 80, isFirstOrder: false },
  ],
  customers: [
    { customerId: 'k1', firstOrderDate: '2026-05-01', lastOrderDate: '2026-05-20', ordersCount: 2, totalRevenue: 200 },
  ],
};

describe('writeOrdersAndCustomers (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt orders+customers transaktional, lässt ad_spend unberührt', async () => {
    const before = await loadDataset();
    const adSpendBefore = before.adSpend.length;
    await writeOrdersAndCustomers(sample);
    const after = await loadDataset();
    expect(after.orders.map((o) => o.orderId).sort()).toEqual(['sw1', 'sw2']);
    expect(after.customers).toHaveLength(1);
    expect(after.customers[0].totalRevenue).toBeCloseTo(200);
    expect(after.adSpend.length).toBe(adSpendBefore); // andere Quellen unangetastet
  });

  it('bricht bei 0 Orders ab, ohne zu truncaten', async () => {
    await expect(writeOrdersAndCustomers({ ...sample, orders: [] }))
      .rejects.toThrow(/0 orders/i);
    const after = await loadDataset();
    expect(after.orders.length).toBeGreaterThan(0); // vorheriger Stand erhalten
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/shopware/write.test.ts`
Expected: FAIL — `@/connectors/shopware/write` nicht gefunden.

- [ ] **Step 3: `writeOrdersAndCustomers` implementieren**

`src/connectors/shopware/write.ts`:
```ts
import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { CanonicalDataset, Customer, Order } from '@/lib/types';

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
      const b = i * 5;
      values.push(o.orderId, o.customerId, o.date, o.revenue, o.isFirstOrder);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    await client.query(
      `INSERT INTO orders(order_id, customer_id, date, revenue, is_first_order) VALUES ${rows.join(',')}`,
      values,
    );
  }
}

async function insertCustomers(client: PoolClient, customers: Customer[]): Promise<void> {
  for (const part of chunk(customers, CHUNK)) {
    const values: unknown[] = [];
    const rows = part.map((c, i) => {
      const b = i * 5;
      values.push(c.customerId, c.firstOrderDate, c.lastOrderDate, c.ordersCount, c.totalRevenue);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    await client.query(
      `INSERT INTO customers(customer_id, first_order_date, last_order_date, orders_count, total_revenue) VALUES ${rows.join(',')}`,
      values,
    );
  }
}

export async function writeOrdersAndCustomers(data: CanonicalDataset): Promise<void> {
  if (data.orders.length === 0) {
    throw new Error('Shopware sync: 0 orders fetched — aborting without truncating.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE orders, customers');
    await insertOrders(client, data.orders);
    await insertCustomers(client, data.customers);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Test ausführen — grün**

Run: `npm test -- tests/connectors/shopware/write.test.ts`
Expected: PASS (2 Tests).
*(Hinweis: Dieser Integrationstest ersetzt die Demo-`orders`/`customers` durch Testdaten. Vor einem Dashboard-Spotcheck mit Demodaten ggf. `npm run seed` erneut laufen lassen; der Live-Sync ersetzt sie ohnehin.)*

- [ ] **Step 5: CLI-Skript implementieren**

`scripts/sync-shopware.ts`:
```ts
import { ShopwareClient } from '../src/connectors/shopware/client';
import { normalizeOrders } from '../src/connectors/shopware/connector';
import { writeOrdersAndCustomers } from '../src/connectors/shopware/write';
import { pool } from '../src/lib/db';

async function main() {
  const apiUrl = process.env.SHOPWARE_API_URL;
  const clientId = process.env.SHOPWARE_CLIENT_ID;
  const clientSecret = process.env.SHOPWARE_CLIENT_SECRET;
  if (!apiUrl || !clientId || !clientSecret) {
    throw new Error('Missing SHOPWARE_API_URL / SHOPWARE_CLIENT_ID / SHOPWARE_CLIENT_SECRET in environment.');
  }

  const client = new ShopwareClient({ apiUrl, clientId, clientSecret });
  console.log('Fetching orders from Shopware…');
  const raw = await client.fetchAllOrders();
  console.log(`Fetched ${raw.length} raw orders.`);

  const data = normalizeOrders(raw);
  console.log(`Normalized → ${data.orders.length} orders / ${data.customers.length} customers (cancelled excluded).`);

  await writeOrdersAndCustomers(data);
  console.log('Wrote orders + customers to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: `package.json`-Script ergänzen**

In `package.json` unter `"scripts"` ergänzen (nach `"seed"`):
```json
    "sync:shopware": "tsx scripts/sync-shopware.ts",
```

- [ ] **Step 7: `.env.example` ergänzen**

An `.env.example` anhängen:
```
SHOPWARE_API_URL=https://your-shop.example
SHOPWARE_CLIENT_ID=your-access-key-id
SHOPWARE_CLIENT_SECRET=your-secret-access-key
```

- [ ] **Step 8: Volle Suite ausführen — grün**

Run: `npm test`
Expected: PASS (alle bisherigen Tests + 9 neue Connector-Tests; Integrationstests benötigen die laufende DB).

- [ ] **Step 9: Commit**

```bash
git add src/connectors/shopware/write.ts scripts/sync-shopware.ts tests/connectors/shopware/write.test.ts package.json .env.example
git commit -m "feat: shopware sync CLI with transactional canonical write"
```

- [ ] **Step 10: Live-Verifikation (manuell, mit echten Zugangsdaten)**

```bash
# .env mit echten SHOPWARE_* Werten füllen (NICHT committen), DB läuft:
docker compose up -d db
npm run migrate           # falls Schema noch nicht angewendet
npm run sync:shopware     # echter Sync gegen die Instanz
```
Erwartet: „Fetched N raw orders / Normalized → … orders/customers". Danach:
```bash
curl -s "http://localhost:3001/api/kpis?days=30" | node -e 'const b=require("/dev/stdin");for(const p of b.phases){if(["do","care"].includes(p.phase))console.log(p.title,p.kpis.map(k=>k.key+"="+(k.available?k.value:"N/A")).join(", "))}'
```
Erwartet: DO (Umsatz/AOV/Revenue) und CARE (Repeat/CLV/Retention/Churn) zeigen plausible echte Werte. **Stichprobe:** Dashboard-Umsatz für 30 Tage ≈ Summe `amountTotal` nicht-stornierter Bestellungen im selben Zeitraum in Shopware. Conversion Rate bleibt anteilig N/A bis GA4 (Sessions) angebunden ist — erwartet.

---

## Definition of Done

- `npm test` grün inkl. 9 neuer Connector-Tests (normalize 4, client 3, write 2).
- `npm run sync:shopware` lädt echte Bestellungen/Kunden in `orders`+`customers`, lässt `daily_metrics`/`ad_spend`/`subscribers` unberührt, ist wiederholbar (Full-Replace).
- DO/CARE-KPIs im Dashboard zeigen echte Shopware-Werte; Umsatz-Stichprobe stimmt; Stornos ausgeschlossen, Umsatz brutto.
- Keine Secrets im Repo.

## Verifizierte Spec-Abdeckung (Self-Review)

- OAuth2 client_credentials + Token-Refresh bei 401: Task 2 ✓
- Paginiertes Fetch (`limit=500`, `total-count-mode`, Assoziationen orderCustomer + stateMachineState): Task 2 ✓
- Mapping brutto (`amountTotal`), `date`, customerId-Fallback: Task 1 ✓
- Stornos (`cancelled`) ausgeschlossen: Task 1 (Test) ✓
- `isFirstOrder` je Kunde + abgeleitete Kunden-Aggregate: Task 1 ✓
- Nur `orders`+`customers`, andere Tabellen unberührt: Task 1 (leere Arrays) + Task 3 (TRUNCATE nur dieser zwei; Test prüft ad_spend) ✓
- Transaktionaler Full-Replace, 0-Orders-Abbruch ohne TRUNCATE: Task 3 ✓
- On-Demand-CLI `npm run sync:shopware`, kein Scheduler: Task 3 ✓
- Secrets nur in `.env` (`.env.example` als Vorlage): Task 3 ✓
- Live-Verifikation inkl. Umsatz-Stichprobe: Task 3 Step 10 ✓
