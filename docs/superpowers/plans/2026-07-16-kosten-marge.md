# Kosten & Marge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** bryx um belegbasierte Kosten & Deckungsbeitrag erweitern — echtes DB je Vertriebskanal (Kanal-Vergleich), DB je Beleg (Beleg-Detail), und ein ehrliches DB/MER + Marketing-Effizienz-je-Ads-Kanal-Panel im E-Commerce-Dashboard.

**Architecture:** Zwei neue Postgres-Tabellen (`order_costs` beleggenau, `channel_costs` periodisch) im bestehenden `db/schema.sql`. Der EK wird beim `createOrder`/`createReturn` als vorzeichenbehaftete `order_costs`-Zeile eingefroren. Aggregation über den bestehenden `pool` (ERP), Ads-Effizienz aus dem bereits geladenen `dataset.adSpend` (KPI/Supabase). UI über bestehende Design-System-Komponenten (KpiCard, sortierbare Tabellen, `.anno`-Labels).

**Tech Stack:** Next.js (App Router, Server Components + Server Actions), TypeScript, `pg` Pool, Supabase (nur KPI-Reads), vitest, recharts-freie Tabellen.

## Global Constraints

- **Deployment:** Niemals lokal deployen. App läuft auf VPS (`root@194.164.204.249`, https://budp.lumeapps.de). Tests (`npx vitest`) laufen lokal. (Projekt-`CLAUDE.md`)
- **Migrationen:** Kein `supabase/migrations`. Idempotente Statements an `db/schema.sql` anhängen; `npm run migrate` (liest `schema.sql` + `rls.sql`) ist idempotent.
- **Design-System:** Akzent nur via `--accent`/`bg-accent`; warme `neutral`-Palette, kein kaltes gray/slate/zinc/stone; `.anno` (DM Mono) das einzige Uppercase; `dark:`-Varianten Pflicht. (Projekt-`CLAUDE.md`, `docs/design/design-system.md`)
- **order_costs.amount ist vorzeichenbehaftet:** Menge×EK bzw. Gebühr; bei Retoure negativ. DB = `revenue − Σ order_costs.amount − Σ channel_costs.amount`.
- **Werbung-Mapping:** fester Default im Code (`google_ads`/`meta_ads`/`tiktok_ads` → `shop`, `amazon_ads` → `marktplatz`) + additiver manueller `channel_costs(werbung)`-Override. Kein Einstell-UI.
- **Dashboard-Umschalter** wirkt nur auf `ad_spend`-KPIs; DB/MER + alle übrigen KPIs bleiben kombiniert. Kein Attributionsmodell.
- **Hilfe-Doku pflegen:** `src/lib/help/content.ts` (`verkauf` + `datenmodell`). Registry-Test `tests/lib/help-content.test.ts` muss grün bleiben.
- **Test-Harness:** vitest seriell (`fileParallelism:false`) gegen echtes Postgres (`DATABASE_URL`). Kein globalSetup — vor lokalen DB-Tests `npm run migrate` + `npm run seed` laufen lassen. Fixtures via `seedKontakte()`/`seedKatalog()`/`seedVerfuegbarkeit()`; Cleanup per-id in `afterAll`, genau ein `pool.end()`. Aggregat-Assertions als Vorher/Nachher-Deltas (DB ist geteilt/dirty).

---

### Task 1: Datenmodell — `order_costs` + `channel_costs`

**Files:**
- Modify: `db/schema.sql` (ans Ende anhängen, nach Zeile 447)
- Modify: `db/rls.sql` (ans Ende anhängen, nach Zeile 77)
- Test: `tests/db/kosten-schema.test.ts` (create)

**Interfaces:**
- Produces: Tabellen `order_costs(id, tenant_id, order_id, type, amount, source, source_ref, created_at)` und `channel_costs(id, tenant_id, channel, type, period_start, period_end, amount, source, external_ref)` mit CHECK-Constraints und Indizes.

- [ ] **Step 1: Write the failing test**

Create `tests/db/kosten-schema.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';

afterAll(async () => { await pool.end(); });

describe('kosten schema', () => {
  it('order_costs akzeptiert eine gültige Zeile und liest amount als numeric zurück', async () => {
    // ein bestehender Beleg aus dem Seed genügt als FK-Ziel
    const o = await pool.query<{ id: string }>('SELECT id FROM sales_orders LIMIT 1');
    const orderId = o.rows[0].id;
    const ins = await pool.query(
      `INSERT INTO order_costs (order_id, type, amount, source)
       VALUES ($1,'wareneinsatz',-12.50,'berechnet') RETURNING id, amount::float8 AS amount`,
      [orderId]);
    expect(Number(ins.rows[0].amount)).toBe(-12.5);
    await pool.query('DELETE FROM order_costs WHERE id = $1', [ins.rows[0].id]);
  });

  it('order_costs.type lehnt einen unbekannten Wert ab', async () => {
    const o = await pool.query<{ id: string }>('SELECT id FROM sales_orders LIMIT 1');
    await expect(pool.query(
      `INSERT INTO order_costs (order_id, type, amount, source) VALUES ($1,'quatsch',1,'manuell')`,
      [o.rows[0].id])).rejects.toThrow();
  });

  it('channel_costs akzeptiert eine periodische Werbezeile', async () => {
    const ins = await pool.query(
      `INSERT INTO channel_costs (channel, type, period_start, period_end, amount, source)
       VALUES ('shop','werbung','2026-01-01','2026-01-31',1100,'manuell') RETURNING id`);
    expect(ins.rows[0].id).toBeTruthy();
    await pool.query('DELETE FROM channel_costs WHERE id = $1', [ins.rows[0].id]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/kosten-schema.test.ts`
Expected: FAIL — `relation "order_costs" does not exist`.

- [ ] **Step 3: Append schema**

Append to `db/schema.sql`:

```sql
-- ── Kosten & Marge (Phase 3) ──────────────────────────────────────
-- order_costs: beleggenaue Kosten. amount ist vorzeichenbehaftet
-- (Menge×EK bzw. Gebühr; bei Retoure negativ). DB = Umsatz − Σ amount.
CREATE TABLE IF NOT EXISTS order_costs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  UUID REFERENCES tenants(id),
  order_id   UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN
               ('wareneinsatz','marktplatzgebuehr','fulfillment','versand','zahlungsgebuehr','retoure','sonstige')),
  amount     NUMERIC(12,2) NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('berechnet','api','manuell')),
  source_ref TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_costs_order_idx ON order_costs (order_id);

-- channel_costs: periodische, nicht-beleggenaue Kosten (Werbung, Lager, Abos)
-- je Vertriebskanal + Zeitraum.
CREATE TABLE IF NOT EXISTS channel_costs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID REFERENCES tenants(id),
  channel      TEXT NOT NULL CHECK (channel IN ('shop','b2b_portal','marktplatz','telefon','manuell')),
  type         TEXT NOT NULL CHECK (type IN ('werbung','lagergebuehr','abo_gebuehr','sonstige')),
  period_start DATE NOT NULL,
  period_end   DATE NOT NULL,
  amount       NUMERIC(12,2) NOT NULL,
  source       TEXT NOT NULL CHECK (source IN ('api','manuell')),
  external_ref TEXT
);
CREATE INDEX IF NOT EXISTS channel_costs_channel_period_idx ON channel_costs (channel, period_start);
```

Append to `db/rls.sql` (server-only, wie die `sales_*`-Tabellen — nur ENABLE, keine authenticated-Policy):

```sql
ALTER TABLE order_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_costs ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Apply migration**

Run: `npm run migrate`
Expected: läuft ohne Fehler durch (idempotent).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/db/kosten-schema.test.ts`
Expected: PASS (3 Tests grün).

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql db/rls.sql tests/db/kosten-schema.test.ts
git commit -m "feat(verkauf): order_costs + channel_costs Schema"
```

---

### Task 2: Typen + EK-Wareneinsatz beim Anlegen einfrieren

**Files:**
- Modify: `src/verkauf/types.ts` (Typen ergänzen)
- Modify: `src/verkauf/repository.ts` (`createOrder`, `createReturn`, neue `orderCosts()`)
- Test: `tests/verkauf/kosten.test.ts` (create)

**Interfaces:**
- Produces:
  - `type CostType = 'wareneinsatz'|'marktplatzgebuehr'|'fulfillment'|'versand'|'zahlungsgebuehr'|'retoure'|'sonstige'`
  - `type CostSource = 'berechnet'|'api'|'manuell'`
  - `interface OrderCost { id: string; orderId: string; type: CostType; amount: number; source: CostSource; sourceRef: string | null }`
  - `orderCosts(orderId: string): Promise<OrderCost[]>`
- Consumes: `createOrder(input: SalesOrderInput)`, `createReturn(originalOrderId)` aus Task-freiem Bestand.

- [ ] **Step 1: Write the failing test**

Create `tests/verkauf/kosten.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder, createReturn, transitionOrderStatus, orderCosts } from '@/verkauf/repository';

const MUELLER = 'c1c1c1c1-0000-4000-8000-000000000001';
const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const orderIds: string[] = [];

async function variantId(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  return r.rows[0].id;
}
async function setEk(sku: string, ek: number | null): Promise<void> {
  await pool.query('UPDATE product_variants SET purchase_price = $2 WHERE sku = $1', [sku, ek]);
}

beforeAll(async () => { await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit(); });
afterAll(async () => {
  for (const id of orderIds) {
    await pool.query('DELETE FROM sales_orders WHERE related_order_id = $1', [id]);
    await pool.query('DELETE FROM open_items WHERE order_id = $1', [id]);
    await pool.query('DELETE FROM sales_orders WHERE id = $1', [id]);
  }
  await pool.end();
});

describe('EK-Einfrieren', () => {
  it('schreibt bei createOrder eine wareneinsatz-Zeile mit Menge×EK', async () => {
    await setEk('SJ-BLAU', 5);
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 3, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    const costs = await orderCosts(o.id);
    const we = costs.filter((c) => c.type === 'wareneinsatz');
    expect(we).toHaveLength(1);
    expect(we[0].amount).toBe(15);        // 3 × 5
    expect(we[0].source).toBe('berechnet');
  });

  it('schreibt KEINE wareneinsatz-Zeile, wenn purchase_price NULL ist', async () => {
    await setEk('SJ-BLAU', null);
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 2, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    expect(await orderCosts(o.id)).toHaveLength(0);
  });

  it('spiegelt den EK bei createReturn negativ', async () => {
    await setEk('SJ-BLAU', 5);
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 4, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    // Beleg bis 'bezahlt' bringen (shop startet als 'auftrag')
    await transitionOrderStatus(o.id, 'versendet');
    await transitionOrderStatus(o.id, 'rechnung_gestellt');
    await transitionOrderStatus(o.id, 'bezahlt');
    const credit = await createReturn(o.id);
    const we = (await orderCosts(credit.id)).filter((c) => c.type === 'wareneinsatz');
    expect(we[0].amount).toBe(-20);       // -4 × 5
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/verkauf/kosten.test.ts`
Expected: FAIL — `orderCosts` ist nicht exportiert / kein import.

- [ ] **Step 3: Add types**

In `src/verkauf/types.ts` nach `PriceEntry` (Zeile 51) ergänzen:

```ts
export type CostType =
  | 'wareneinsatz' | 'marktplatzgebuehr' | 'fulfillment' | 'versand' | 'zahlungsgebuehr' | 'retoure' | 'sonstige';
export type CostSource = 'berechnet' | 'api' | 'manuell';
export interface OrderCost {
  id: string; orderId: string; type: CostType; amount: number; source: CostSource; sourceRef: string | null;
}
```

- [ ] **Step 4: Freeze EK in createOrder and createReturn + add orderCosts()**

In `src/verkauf/repository.ts` den `type OrderCost` in den Typ-Import (Zeile 8-12) aufnehmen, z.B. am Ende von Zeile 11: `..., type OrderCost,`.

Einen privaten Helper neben `reserveStock` (nach Zeile 79) einfügen — beide Aufrufer nutzen ihn, keine Duplikation:

```ts
// EK vorzeichenbehaftet einfrieren (Menge×EK; bei Retoure negative Menge ⇒
// negativer Wareneinsatz). purchase_price ist nullable → ohne EK keine Zeile.
async function freezeWareneinsatz(c: PoolClient, orderId: string): Promise<void> {
  await c.query(
    `INSERT INTO order_costs (order_id, type, amount, source)
       SELECT $1, 'wareneinsatz', l.quantity * pv.purchase_price, 'berechnet'
         FROM sales_order_lines l JOIN product_variants pv ON pv.id = l.variant_id
        WHERE l.order_id = $1 AND pv.purchase_price IS NOT NULL`,
    [orderId]);
}
```

In `createOrder`, direkt **nach** der `for`-Schleife (nach Zeile 100, vor `if (startsAsAuftrag)`):

```ts
    await freezeWareneinsatz(c, orderId);   // EK zeitgleich mit dem VK einfrieren
```

In `createReturn`, direkt **nach** dem Insert der gespiegelten Zeilen (nach Zeile 248, vor `writeEvent`):

```ts
    await freezeWareneinsatz(c, creditId);  // Gutschrift ⇒ negativer Wareneinsatz
```

Am Dateiende von `src/verkauf/repository.ts` `orderCosts()` ergänzen:

```ts
export async function orderCosts(orderId: string): Promise<OrderCost[]> {
  const r = await pool.query(
    `SELECT id, order_id, type, amount, source, source_ref
       FROM order_costs WHERE order_id = $1 ORDER BY created_at, id`, [orderId]);
  return r.rows.map((x: any) => ({
    id: x.id, orderId: x.order_id, type: x.type,
    amount: Number(x.amount), source: x.source, sourceRef: x.source_ref,
  }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/verkauf/kosten.test.ts`
Expected: PASS (3 Tests). Danach `git checkout` NICHT nötig — das Test-`setEk` verändert Seed-Daten; am Ende auf 5 zurückgesetzt. (Falls andere Suites `SJ-BLAU`-EK annehmen: der abschließende `setEk('SJ-BLAU', 5)`-Zustand bleibt.)

- [ ] **Step 6: Commit**

```bash
git add src/verkauf/types.ts src/verkauf/repository.ts tests/verkauf/kosten.test.ts
git commit -m "feat(verkauf): EK-Wareneinsatz bei createOrder/createReturn einfrieren"
```

---

### Task 3: DB je Beleg — reine Marge-Funktion + Beleg-Detail

**Files:**
- Create: `src/verkauf/marge.ts`
- Modify: `src/verkauf/types.ts` (`OrderView` um `costs`)
- Modify: `src/verkauf/repository.ts` (`getOrderView` lädt `costs`)
- Modify: `src/verkauf/labels.ts` (`COST_TYPE_LABEL`, `COST_SOURCE_LABEL`)
- Modify: `src/components/VerkaufDetail.tsx` (Kosten-Block + DB)
- Test: `tests/verkauf/marge.test.ts` (create)

**Interfaces:**
- Produces: `contributionMargin(revenueNet: number, costs: OrderCost[]): { db: number; dbProzent: number | null }`
- Consumes: `OrderCost` (Task 2), `getOrderView(id)`.

- [ ] **Step 1: Write the failing test**

Create `tests/verkauf/marge.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { contributionMargin } from '@/verkauf/marge';
import type { OrderCost } from '@/verkauf/types';

const cost = (type: OrderCost['type'], amount: number): OrderCost =>
  ({ id: 'x', orderId: 'o', type, amount, source: 'berechnet', sourceRef: null });

describe('contributionMargin', () => {
  it('zieht alle Kostenzeilen vom Umsatz ab', () => {
    const r = contributionMargin(142, [cost('wareneinsatz', 64), cost('marktplatzgebuehr', 21.3)]);
    expect(r.db).toBeCloseTo(56.7, 2);
    expect(r.dbProzent!).toBeCloseTo(56.7 / 142, 4);
  });
  it('liefert dbProzent = null bei Umsatz 0', () => {
    expect(contributionMargin(0, []).dbProzent).toBeNull();
  });
  it('behandelt negative (Retoure-)Kosten korrekt', () => {
    const r = contributionMargin(-100, [cost('wareneinsatz', -40)]);
    expect(r.db).toBe(-60);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/verkauf/marge.test.ts`
Expected: FAIL — `Cannot find module '@/verkauf/marge'`.

- [ ] **Step 3: Implement marge.ts**

Create `src/verkauf/marge.ts`:

```ts
import type { OrderCost } from './types';

export function contributionMargin(
  revenueNet: number, costs: OrderCost[],
): { db: number; dbProzent: number | null } {
  const total = costs.reduce((s, c) => s + c.amount, 0);
  const db = revenueNet - total;
  return { db, dbProzent: revenueNet !== 0 ? db / revenueNet : null };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/verkauf/marge.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire costs into OrderView**

In `src/verkauf/types.ts` das `OrderView`-Interface (Zeile 44-46) erweitern:

```ts
export interface OrderView extends SalesOrder {
  contactName: string; lines: OrderViewLine[]; events: SalesOrderEvent[]; costs: OrderCost[];
}
```

In `src/verkauf/repository.ts` `getOrderView` (Zeile 462-481) den Rückgabewert um `costs` ergänzen — direkt vor `return`:

```ts
  const costs = await orderCosts(id);
```
und im Objekt: `..., events: base.events, costs,`.

- [ ] **Step 6: Add cost/source labels**

In `src/verkauf/labels.ts` ergänzen:

```ts
import type { OrderChannel, OrderStatus, CostType, CostSource } from './types';

export const COST_TYPE_LABEL: Record<CostType, string> = {
  wareneinsatz: 'Wareneinsatz', marktplatzgebuehr: 'Marktplatzgebühr', fulfillment: 'Fulfillment',
  versand: 'Versand', zahlungsgebuehr: 'Zahlungsgebühr', retoure: 'Retoure', sonstige: 'Sonstige',
};
export const COST_SOURCE_LABEL: Record<CostSource, string> = {
  berechnet: 'berechnet', api: 'API', manuell: 'manuell',
};
```
(Den bestehenden `import type { OrderChannel, OrderStatus }` durch die erweiterte Zeile ersetzen.)

- [ ] **Step 7: Render cost block in VerkaufDetail**

In `src/components/VerkaufDetail.tsx`: Import ergänzen und Kosten-Block nach der Positions-Tabelle (`</table></div>` bei Zeile 87) einfügen. Oben ergänzen:

```ts
import { contributionMargin } from '@/verkauf/marge';
import { COST_TYPE_LABEL, COST_SOURCE_LABEL } from '@/verkauf/labels';
```

Nach `const total = order.lines.reduce(...)` (Zeile 33):

```ts
  const { db, dbProzent } = contributionMargin(total, order.costs);
```

Direkt nach dem schließenden `</div>` der Positions-Karte (nach Zeile 87), noch innerhalb `<div className="space-y-4">`:

```tsx
      {order.costs.length > 0 && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="anno mb-2 text-neutral-500">Deckungsbeitrag</p>
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-b border-neutral-200 dark:border-neutral-800">
                <td className="py-2">Umsatz netto</td><td /><td className="text-right">{total.toFixed(2)} €</td>
              </tr>
              {order.costs.map((c) => (
                <tr key={c.id}>
                  <td className="py-1 text-neutral-600 dark:text-neutral-400">− {COST_TYPE_LABEL[c.type]}</td>
                  <td className="text-neutral-400">
                    <span className="anno rounded bg-neutral-100 px-1.5 py-0.5 text-xs dark:bg-neutral-800">
                      {COST_SOURCE_LABEL[c.source]}
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{(-c.amount).toFixed(2)} €</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-300 font-semibold dark:border-neutral-700">
                <td className="py-2">Deckungsbeitrag</td><td />
                <td className="text-right">
                  {db.toFixed(2)} €{dbProzent !== null && (
                    <span className="ml-2 text-neutral-500">({(dbProzent * 100).toFixed(1)} %)</span>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
```

- [ ] **Step 8: Verify typecheck + tests**

Run: `npx tsc --noEmit && npx vitest run tests/verkauf/marge.test.ts`
Expected: kein TS-Fehler, Tests grün.

- [ ] **Step 9: Commit**

```bash
git add src/verkauf/marge.ts src/verkauf/types.ts src/verkauf/repository.ts src/verkauf/labels.ts src/components/VerkaufDetail.tsx tests/verkauf/marge.test.ts
git commit -m "feat(verkauf): Deckungsbeitrag je Beleg im Beleg-Detail"
```

---

### Task 4: Kanal-Vergleich-Aggregation (echtes DB je Vertriebskanal)

**Files:**
- Create: `src/verkauf/ad-channel-map.ts`
- Modify: `src/verkauf/types.ts` (`ChannelSummary` erweitern)
- Modify: `src/verkauf/repository.ts` (`channelSummary` neu, Import der Map)
- Test: `tests/verkauf/channel-summary.test.ts` (create)

**Interfaces:**
- Produces:
  - `mapAdPlatformToChannel(platform: string): OrderChannel | null`
  - `ChannelSummary` erweitert um `wareneinsatz, gebuehren, werbung, db: number; dbProzent: number | null`
  - `channelSummary(range): Promise<ChannelSummary[]>` (Signatur unverändert, Rückgabe erweitert)
- Consumes: `order_costs`, `channel_costs`, `ad_spend` (Task 1); `OrderChannel`.

- [ ] **Step 1: Write the failing test**

Create `tests/verkauf/channel-summary.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool } from '@/lib/db';
import { addDays } from '@/lib/dates';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder, channelSummary } from '@/verkauf/repository';
import type { DateRange } from '@/verkauf/types';

const MUELLER = 'c1c1c1c1-0000-4000-8000-000000000001';
const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const orderIds: string[] = [];
const ccIds: string[] = [];

async function variantId(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  return r.rows[0].id;
}

beforeAll(async () => {
  await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit();
  await pool.query('UPDATE product_variants SET purchase_price = 5 WHERE sku = $1', ['SJ-BLAU']);
});
afterAll(async () => {
  for (const id of ccIds) await pool.query('DELETE FROM channel_costs WHERE id = $1', [id]);
  for (const id of orderIds) {
    await pool.query('DELETE FROM open_items WHERE order_id = $1', [id]);
    await pool.query('DELETE FROM sales_orders WHERE id = $1', [id]);
  }
  await pool.end();
});

describe('channelSummary Kosten', () => {
  it('berechnet Wareneinsatz und DB je Kanal aus order_costs', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const range: DateRange = { start: addDays(today, -1), end: today };
    const before = (await channelSummary(range)).find((c) => c.channel === 'b2b_portal')!;
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 10, unitPrice: 20 }],
    });
    orderIds.push(o.id);
    const after = (await channelSummary(range)).find((c) => c.channel === 'b2b_portal')!;
    expect(after.revenueNet - before.revenueNet).toBeCloseTo(200, 2);   // 10×20
    expect(after.wareneinsatz - before.wareneinsatz).toBeCloseTo(50, 2); // 10×5
    // DB-Zuwachs = Umsatz − Wareneinsatz (b2b hat keine Werbung/Gebühren im Test)
    expect(after.db - before.db).toBeCloseTo(150, 2);
  });

  it('addiert manuelle channel_costs(werbung) in die Werbung-Spalte', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const range: DateRange = { start: addDays(today, -1), end: today };
    const before = (await channelSummary(range)).find((c) => c.channel === 'telefon')!;
    const cc = await pool.query<{ id: string }>(
      `INSERT INTO channel_costs (channel, type, period_start, period_end, amount, source)
       VALUES ('telefon','werbung',$1,$1,300,'manuell') RETURNING id`, [today]);
    ccIds.push(cc.rows[0].id);
    const after = (await channelSummary(range)).find((c) => c.channel === 'telefon')!;
    expect(after.werbung - before.werbung).toBeCloseTo(300, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/verkauf/channel-summary.test.ts`
Expected: FAIL — `after.wareneinsatz` ist `undefined` (Feld existiert noch nicht).

- [ ] **Step 3: Add ad-channel map**

Create `src/verkauf/ad-channel-map.ts`:

```ts
import type { OrderChannel } from './types';

// Fester Default: Web-Ads zählen auf den Shop, Amazon-Ads auf den Marktplatz.
// Manuelle channel_costs(werbung) kommen additiv obendrauf (siehe channelSummary).
export const AD_PLATFORM_CHANNEL: Record<string, OrderChannel> = {
  google_ads: 'shop', meta_ads: 'shop', tiktok_ads: 'shop', amazon_ads: 'marktplatz',
};

export function mapAdPlatformToChannel(platform: string): OrderChannel | null {
  return AD_PLATFORM_CHANNEL[platform] ?? null;
}
```

- [ ] **Step 4: Extend ChannelSummary type**

In `src/verkauf/types.ts` (Zeile 57-59) ersetzen:

```ts
export interface ChannelSummary {
  channel: OrderChannel; revenueNet: number; orders: number; avgOrderValueNet: number;
  wareneinsatz: number; gebuehren: number; werbung: number; db: number; dbProzent: number | null;
}
```

- [ ] **Step 5: Rewrite channelSummary**

In `src/verkauf/repository.ts` den Import der Map ergänzen (nach Zeile 5):
```ts
import { mapAdPlatformToChannel } from './ad-channel-map';
```

`channelSummary` (Zeile 431-448) ersetzen durch:

```ts
export async function channelSummary(range: DateRange): Promise<ChannelSummary[]> {
  const rev = await pool.query(
    `SELECT o.channel, COUNT(DISTINCT o.id)::int AS orders,
            COALESCE(SUM(l.quantity * l.unit_price), 0)::float8 AS revenue
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id = o.id
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND o.status NOT IN ('angebot','storniert')
      GROUP BY o.channel`, [range.start, range.end]);
  const costs = await pool.query(
    `SELECT o.channel,
            COALESCE(SUM(oc.amount) FILTER (WHERE oc.type = 'wareneinsatz'), 0)::float8 AS wareneinsatz,
            COALESCE(SUM(oc.amount) FILTER (WHERE oc.type <> 'wareneinsatz'), 0)::float8 AS gebuehren
       FROM sales_orders o JOIN order_costs oc ON oc.order_id = o.id
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND o.status NOT IN ('angebot','storniert')
      GROUP BY o.channel`, [range.start, range.end]);
  const adRows = await pool.query(
    `SELECT platform, COALESCE(SUM(spend), 0)::float8 AS spend
       FROM ad_spend WHERE date BETWEEN $1 AND $2 GROUP BY platform`, [range.start, range.end]);
  const ccRows = await pool.query(
    `SELECT channel, COALESCE(SUM(amount), 0)::float8 AS amount
       FROM channel_costs WHERE type = 'werbung' AND period_start BETWEEN $1 AND $2
      GROUP BY channel`, [range.start, range.end]);

  const revBy = new Map<string, any>(rev.rows.map((x: any) => [x.channel, x]));
  const costBy = new Map<string, any>(costs.rows.map((x: any) => [x.channel, x]));
  const werbungBy = new Map<OrderChannel, number>();
  for (const r of adRows.rows as any[]) {
    const ch = mapAdPlatformToChannel(r.platform);           // unbekannte Plattform → nicht zugeordnet
    if (!ch) continue;
    werbungBy.set(ch, (werbungBy.get(ch) ?? 0) + Number(r.spend));
  }
  for (const r of ccRows.rows as any[]) {
    werbungBy.set(r.channel, (werbungBy.get(r.channel) ?? 0) + Number(r.amount));
  }

  const CH: OrderChannel[] = ['shop', 'b2b_portal', 'marktplatz', 'telefon', 'manuell'];
  return CH.map((channel) => {
    const rrow = revBy.get(channel);
    const crow = costBy.get(channel);
    const orders = rrow ? rrow.orders : 0;
    const revenueNet = rrow ? Number(rrow.revenue) : 0;
    const wareneinsatz = crow ? Number(crow.wareneinsatz) : 0;
    const gebuehren = crow ? Number(crow.gebuehren) : 0;
    const werbung = werbungBy.get(channel) ?? 0;
    const db = revenueNet - wareneinsatz - gebuehren - werbung;
    return {
      channel, orders, revenueNet, avgOrderValueNet: orders > 0 ? revenueNet / orders : 0,
      wareneinsatz, gebuehren, werbung, db, dbProzent: revenueNet !== 0 ? db / revenueNet : null,
    };
  });
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/verkauf/channel-summary.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 7: Commit**

```bash
git add src/verkauf/ad-channel-map.ts src/verkauf/types.ts src/verkauf/repository.ts tests/verkauf/channel-summary.test.ts
git commit -m "feat(verkauf): DB je Vertriebskanal inkl. Werbung-Mapping"
```

---

### Task 5: Kanal-Vergleich als sortierbare Tabelle

**Files:**
- Modify: `src/components/KanalVergleich.tsx` (Karten-Grid → Tabelle, client-side Sort)
- Test: `tests/components/kanal-vergleich.test.tsx` (create)

**Interfaces:**
- Consumes: `ChannelSummary` (Task 4), `useClientSort`/`ClientSortableTh` aus `@/components/useClientSort`, `eur` aus `@/verkauf/format`.
- Signatur `KanalVergleich({ channels }: { channels: ChannelSummary[] })` bleibt.

- [ ] **Step 1: Write the failing test**

Create `tests/components/kanal-vergleich.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KanalVergleich } from '@/components/KanalVergleich';
import type { ChannelSummary } from '@/verkauf/types';

const row = (channel: ChannelSummary['channel'], o: Partial<ChannelSummary>): ChannelSummary => ({
  channel, revenueNet: 0, orders: 0, avgOrderValueNet: 0,
  wareneinsatz: 0, gebuehren: 0, werbung: 0, db: 0, dbProzent: null, ...o,
});

describe('KanalVergleich', () => {
  it('zeigt DB% je Kanal und die Kostenspalten', () => {
    render(<KanalVergleich channels={[
      row('shop', { revenueNet: 24300, wareneinsatz: 10900, gebuehren: 700, werbung: 1100, db: 11600, dbProzent: 11600 / 24300 }),
    ]} />);
    expect(screen.getByText('Werbung')).toBeInTheDocument();
    expect(screen.getByText('47,7 %')).toBeInTheDocument();  // 11600/24300
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/kanal-vergleich.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Werbung` (altes Karten-Grid).

- [ ] **Step 3: Rewrite KanalVergleich as a table**

Replace `src/components/KanalVergleich.tsx`:

```tsx
'use client';
import type { ChannelSummary } from '@/verkauf/types';
import { CHANNEL_LABEL } from '@/verkauf/labels';
import { eur } from '@/verkauf/format';
import { useClientSort, ClientSortableTh } from './useClientSort';

const pct = (v: number | null) => (v === null ? '—' : `${(v * 100).toFixed(1).replace('.', ',')} %`);

export function KanalVergleich({ channels }: { channels: ChannelSummary[] }) {
  // Default: schwächster DB% oben — die eigentliche Botschaft der Tabelle.
  const { rows, sort, toggle } = useClientSort(channels, { col: 'dbProzent', dir: 'asc' });
  return (
    <div>
      <p className="anno mb-3 text-neutral-500">Kanal-Vergleich · netto, ohne MwSt · Werbung als eigene Spalte</p>
      <div className="overflow-x-auto rounded-lg border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead>
            <tr className="anno text-left text-neutral-500">
              <th className="px-3 py-2">Kanal</th>
              <ClientSortableTh col="revenueNet" sort={sort} toggle={toggle} className="px-3 text-right">Umsatz</ClientSortableTh>
              <ClientSortableTh col="wareneinsatz" sort={sort} toggle={toggle} className="px-3 text-right">Wareneinsatz</ClientSortableTh>
              <ClientSortableTh col="gebuehren" sort={sort} toggle={toggle} className="px-3 text-right">Gebühren</ClientSortableTh>
              <ClientSortableTh col="werbung" sort={sort} toggle={toggle} className="px-3 text-right">Werbung</ClientSortableTh>
              <ClientSortableTh col="db" sort={sort} toggle={toggle} className="px-3 text-right">DB</ClientSortableTh>
              <ClientSortableTh col="dbProzent" sort={sort} toggle={toggle} className="px-3 text-right">DB %</ClientSortableTh>
            </tr>
          </thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.channel} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="px-3 py-2 font-medium text-neutral-900 dark:text-neutral-100">{CHANNEL_LABEL[c.channel]}</td>
                <td className="px-3 text-right tabular-nums">{eur(c.revenueNet)}</td>
                <td className="px-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{eur(c.wareneinsatz)}</td>
                <td className="px-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{eur(c.gebuehren)}</td>
                <td className="px-3 text-right tabular-nums text-neutral-600 dark:text-neutral-400">{eur(c.werbung)}</td>
                <td className="px-3 text-right tabular-nums font-semibold">{eur(c.db)}</td>
                <td className="px-3 text-right tabular-nums">
                  <span className="inline-flex items-center gap-2">
                    <span className="hidden h-1.5 w-10 overflow-hidden rounded bg-neutral-100 dark:bg-neutral-800 sm:inline-block">
                      <span className="block h-full bg-accent"
                        style={{ width: `${Math.max(0, Math.min(1, c.dbProzent ?? 0)) * 100}%` }} />
                    </span>
                    {pct(c.dbProzent)}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

> Falls `useClientSort`/`ClientSortableTh` andere Prop-Namen hat als `{ col, sort, toggle }`: an die tatsächliche Signatur in `src/components/useClientSort.tsx` angleichen (dort nachsehen). Rückgabe muss `rows` (sortiert), `sort` (aktueller `Sort`) und einen Toggle-Handler liefern.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/kanal-vergleich.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/KanalVergleich.tsx tests/components/kanal-vergleich.test.tsx
git commit -m "feat(verkauf): Kanal-Vergleich als sortierbare DB-Tabelle"
```

---

### Task 6: Dashboard — DB/MER + Marketing-Effizienz je Ads-Kanal

**Files:**
- Create: `src/verkauf/marketing.ts` (reine Ads-Effizienz-Funktion)
- Modify: `src/verkauf/repository.ts` (`marginTotals`)
- Create: `src/components/MarketingMargin.tsx` (Kacheln + Umschalter-Tabelle)
- Modify: `src/app/(shell)/verkauf/dashboard/page.tsx` (Verdrahtung)
- Test: `tests/verkauf/marketing.test.ts` (create)

**Interfaces:**
- Produces:
  - `interface PlatformEfficiency { platform: string; spend: number; convValue: number; roas: number | null }`
  - `adPlatformEfficiency(adSpend: AdSpend[]): PlatformEfficiency[]`
  - `interface MarginTotals { revenueNet, wareneinsatz, gebuehren, werbung, db: number; dbProzent: number | null; adSpend: number; mer: number | null }`
  - `marginTotals(range: DateRange): Promise<MarginTotals>`
- Consumes: `channelSummary` (Task 4), `AdSpend` (`@/lib/types`), `Kpi`/`KpiCard`.

- [ ] **Step 1: Write the failing test**

Create `tests/verkauf/marketing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { adPlatformEfficiency } from '@/verkauf/marketing';
import type { AdSpend } from '@/lib/types';

const ad = (platform: AdSpend['platform'], spend: number, convValue: number): AdSpend =>
  ({ date: '2026-07-01', platform, spend, impressions: 0, clicks: 0, conversions: 0, convValue });

describe('adPlatformEfficiency', () => {
  it('gruppiert je Plattform, summiert Spend und rechnet ROAS', () => {
    const r = adPlatformEfficiency([
      ad('google_ads', 100, 380), ad('google_ads', 100, 380), ad('meta_ads', 100, 290),
    ]);
    const google = r.find((x) => x.platform === 'google_ads')!;
    expect(google.spend).toBe(200);
    expect(google.roas!).toBeCloseTo(760 / 200, 4);
    expect(r[0].spend).toBeGreaterThanOrEqual(r[1].spend); // nach Spend absteigend sortiert
  });
  it('roas = null bei Spend 0', () => {
    expect(adPlatformEfficiency([ad('tiktok_ads', 0, 0)])[0].roas).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/verkauf/marketing.test.ts`
Expected: FAIL — `Cannot find module '@/verkauf/marketing'`.

- [ ] **Step 3: Implement marketing.ts**

Create `src/verkauf/marketing.ts`:

```ts
import type { AdSpend } from '@/lib/types';

export interface PlatformEfficiency {
  platform: string; spend: number; convValue: number; roas: number | null;
}

// Erwartet bereits zeitraum-gefilterte adSpend-Zeilen.
export function adPlatformEfficiency(adSpend: AdSpend[]): PlatformEfficiency[] {
  const by = new Map<string, { spend: number; convValue: number }>();
  for (const a of adSpend) {
    const cur = by.get(a.platform) ?? { spend: 0, convValue: 0 };
    cur.spend += a.spend; cur.convValue += a.convValue;
    by.set(a.platform, cur);
  }
  return [...by.entries()]
    .map(([platform, v]) => ({
      platform, spend: v.spend, convValue: v.convValue,
      roas: v.spend > 0 ? v.convValue / v.spend : null,
    }))
    .sort((a, b) => b.spend - a.spend);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/verkauf/marketing.test.ts`
Expected: PASS.

- [ ] **Step 5: Add marginTotals to repository**

In `src/verkauf/repository.ts` `MarginTotals` in `types.ts` ergänzen (nach `ChannelSummary`):

```ts
export interface MarginTotals {
  revenueNet: number; wareneinsatz: number; gebuehren: number; werbung: number;
  db: number; dbProzent: number | null; adSpend: number; mer: number | null;
}
```

Import in `repository.ts` (Zeile 11) um `type MarginTotals` ergänzen, dann Funktion anhängen:

```ts
export async function marginTotals(range: DateRange): Promise<MarginTotals> {
  const channels = await channelSummary(range);
  const revenueNet = channels.reduce((s, c) => s + c.revenueNet, 0);
  const wareneinsatz = channels.reduce((s, c) => s + c.wareneinsatz, 0);
  const gebuehren = channels.reduce((s, c) => s + c.gebuehren, 0);
  const werbung = channels.reduce((s, c) => s + c.werbung, 0);
  const db = revenueNet - wareneinsatz - gebuehren - werbung;
  const adRes = await pool.query<{ spend: number }>(
    `SELECT COALESCE(SUM(spend), 0)::float8 AS spend FROM ad_spend WHERE date BETWEEN $1 AND $2`,
    [range.start, range.end]);
  const adSpend = Number(adRes.rows[0].spend);
  return {
    revenueNet, wareneinsatz, gebuehren, werbung, db,
    dbProzent: revenueNet !== 0 ? db / revenueNet : null,
    adSpend, mer: adSpend > 0 ? revenueNet / adSpend : null,
  };
}
```

- [ ] **Step 6: Build the MarketingMargin component**

Create `src/components/MarketingMargin.tsx`:

```tsx
'use client';
import { useState } from 'react';
import type { Kpi } from '@/kpi/types';
import type { MarginTotals } from '@/verkauf/types';
import type { PlatformEfficiency } from '@/verkauf/marketing';
import { KpiCard } from './KpiCard';
import { eur } from '@/verkauf/format';

function delta(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}
function kpi(key: string, label: string, value: number | null, unit: Kpi['unit'], deltaPct: number | null): Kpi {
  return { key, label, phase: 'do', value, unit, available: value !== null, deltaPct };
}

export function MarketingMargin(
  { current, previous, efficiency }: { current: MarginTotals; previous: MarginTotals; efficiency: PlatformEfficiency[] },
) {
  const [perChannel, setPerChannel] = useState(false);
  const kpis: Kpi[] = [
    kpi('db_total', 'Deckungsbeitrag', current.db, 'currency', delta(current.db, previous.db)),
    kpi('db_prozent', 'DB-Marge', current.dbProzent, 'percent', delta(current.dbProzent, previous.dbProzent)),
    kpi('mer', 'MER (blended)', current.mer, 'ratio', delta(current.mer, previous.mer)),
  ];
  const blendedSpend = efficiency.reduce((s, e) => s + e.spend, 0);
  const blendedConv = efficiency.reduce((s, e) => s + e.convValue, 0);
  const rows = perChannel
    ? efficiency
    : [{ platform: 'Alle Ads-Kanäle', spend: blendedSpend, convValue: blendedConv,
         roas: blendedSpend > 0 ? blendedConv / blendedSpend : null }];

  return (
    <section className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {kpis.map((k) => <KpiCard key={k.key} kpi={k} />)}
      </div>
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-2 flex items-center justify-between">
          <p className="anno text-neutral-500">Marketing-Effizienz · <span className="text-accent">plattform-gemeldet</span></p>
          <div className="flex gap-1 text-sm">
            <button onClick={() => setPerChannel(false)}
              className={`rounded px-2 py-0.5 ${!perChannel ? 'bg-accent text-white' : 'text-neutral-500'}`}>kombiniert</button>
            <button onClick={() => setPerChannel(true)}
              className={`rounded px-2 py-0.5 ${perChannel ? 'bg-accent text-white' : 'text-neutral-500'}`}>je Kanal</button>
          </div>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="anno text-left text-neutral-500">
            <th className="py-1">Kanal</th><th className="text-right">Spend</th>
            <th className="text-right">ROAS*</th><th className="text-right">conv_value*</th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.platform} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1">{r.platform}</td>
                <td className="text-right tabular-nums">{eur(r.spend)}</td>
                <td className="text-right tabular-nums">{r.roas === null ? '—' : `${r.roas.toFixed(1)}×`}</td>
                <td className="text-right tabular-nums">{eur(r.convValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="anno mt-2 text-xs text-neutral-400">
          * von der Werbeplattform berichtet — überlappend, nicht dedupliziert. Kein Umsatz je Ads-Kanal attribuiert.
        </p>
      </div>
    </section>
  );
}
```

- [ ] **Step 7: Wire into the dashboard page**

In `src/app/(shell)/verkauf/dashboard/page.tsx`:

Imports ergänzen:
```ts
import { ecomSalesFacts, marginTotals } from '@/verkauf/repository';
import { adPlatformEfficiency } from '@/verkauf/marketing';
import { MarketingMargin } from '@/components/MarketingMargin';
```

Im `Promise.all` (nach `ecomSalesFacts(previousRange(range))`) zwei Aufrufe ergänzen und den Datensatz nutzen:
```ts
const [dataset, factsCurrent, factsPrevious, marginCur, marginPrev] = await Promise.all([
  loadDataset(supabase),
  ecomSalesFacts(range),
  ecomSalesFacts(previousRange(range)),
  marginTotals(range),
  marginTotals(previousRange(range)),
]);
const efficiency = adPlatformEfficiency(
  dataset.adSpend.filter((a) => a.date >= range.start && a.date <= range.end));
```

Im JSX direkt nach `<Filters ... />` und vor der Phasen-Spalten-Map einfügen:
```tsx
<MarketingMargin current={marginCur} previous={marginPrev} efficiency={efficiency} />
```

- [ ] **Step 8: Verify typecheck + full build of touched types**

Run: `npx tsc --noEmit`
Expected: keine Fehler. (Prüft die JSX-Verdrahtung, für die es keinen Unit-Test gibt — die reine Logik ist über `adPlatformEfficiency`/`marginTotals`/`contributionMargin` getestet.)

- [ ] **Step 9: Commit**

```bash
git add src/verkauf/marketing.ts src/verkauf/types.ts src/verkauf/repository.ts src/components/MarketingMargin.tsx "src/app/(shell)/verkauf/dashboard/page.tsx" tests/verkauf/marketing.test.ts
git commit -m "feat(verkauf): Dashboard DB/MER + Marketing-Effizienz je Ads-Kanal"
```

---

### Task 7: Hilfe- & Datenmodell-Doku pflegen

**Files:**
- Modify: `src/lib/help/content.ts` (`verkauf`-Modulseite + `datenmodell`-Adminseite)
- Test: `tests/lib/help-content.test.ts` (muss grün bleiben — kein neuer Test)

**Interfaces:**
- Consumes: `DocPage`/`DocSection`/`DocBlock` aus `content.ts`.

- [ ] **Step 1: Locate the pages**

In `src/lib/help/content.ts` die bestehenden `HELP_PAGES`-Einträge mit `slug: 'verkauf'` (`group: 'module'`) und `slug: 'datenmodell'` (`group: 'admin'`) finden.

- [ ] **Step 2: Append a section to the `verkauf` page**

In das `sections`-Array der `verkauf`-Seite folgende `DocSection` einfügen:

```ts
{
  heading: 'Kosten & Deckungsbeitrag',
  blocks: [
    { type: 'p', text: 'Jeder Beleg trägt seine zurechenbaren Kosten. Der Wareneinsatz (EK × Menge) wird beim Anlegen des Belegs eingefroren — spätere EK-Änderungen lassen die alte Marge unberührt.' },
    { type: 'p', text: 'Deckungsbeitrag je Beleg = Umsatz netto − alle Kostenzeilen. Im Kanal-Vergleich kommen periodische Werbekosten hinzu: DB je Kanal = Umsatz − Wareneinsatz − Gebühren − Werbung.' },
    { type: 'note', text: 'Werbung wird ehrlich als eigene Spalte gezeigt, nicht in der Marge versteckt. Web-Ads (Google/Meta/TikTok) zählen automatisch auf den Shop, Amazon-Ads auf den Marktplatz; zusätzliche Werbekosten lassen sich manuell je Kanal buchen.' },
  ],
},
```

- [ ] **Step 3: Append a section to the `datenmodell` page**

In das `sections`-Array der `datenmodell`-Seite einfügen:

```ts
{
  heading: 'Kosten (order_costs, channel_costs)',
  blocks: [
    { type: 'p', text: 'order_costs hält beleggenaue Kosten (Wareneinsatz, Marktplatz-, Fulfillment-, Versand-, Zahlungsgebühr, Retoure, Sonstige). amount ist vorzeichenbehaftet — bei Retouren negativ.' },
    { type: 'p', text: 'channel_costs hält periodische, nicht-beleggenaue Kosten (Werbung, Lagergebühr, Abo) je Vertriebskanal und Zeitraum.' },
    { type: 'table', head: ['Tabelle', 'Zurechnung', 'Quelle'], rows: [
      ['order_costs', 'je Beleg', 'berechnet (EK) / API / manuell'],
      ['channel_costs', 'je Kanal + Zeitraum', 'API / manuell'],
    ] },
  ],
},
```

> Feldnamen (`type: 'table'` mit `head`/`rows`) an die tatsächliche `DocBlock`-Union in `content.ts` Zeile 1-6 angleichen, falls abweichend.

- [ ] **Step 4: Run the registry test**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (jede Modul-App hat weiterhin eine Hilfeseite; jede Section hat ≥1 Block).

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(hilfe): Kosten & Marge in Verkauf- und Datenmodell-Doku"
```

---

### Task 8: Gesamtverifikation + Deploy-Checkpoint

**Files:** keine (Verifikation)

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: alle Suites grün **außer** `tests/db/rls.test.ts` (16 erwartete Fehlschläge auf diesem Host — bekannt, kein Regressionssignal).

- [ ] **Step 2: Typecheck + build**

Run: `npx tsc --noEmit && npm run build`
Expected: kein TS-Fehler, Build erfolgreich.

- [ ] **Step 3: Deploy-Checkpoint (Bestätigung nötig)**

Die App läuft auf dem VPS (https://budp.lumeapps.de). Deployment ist client-/produktionsnah → **vor dem Deploy ausdrücklich bestätigen lassen**. Nach Freigabe auf dem VPS deployen (`npm run migrate` dort mitlaufen lassen, damit `order_costs`/`channel_costs` angelegt werden) und Beleg-Detail + Kanal-Vergleich + Dashboard im Browser prüfen.

- [ ] **Step 4: Final commit / PR**

Branch ist `feat/phase-3-echte-kanaldaten`. Änderungen via PR liefern (nicht nach `main` pushen).

---

## Self-Review

**Spec-Coverage:**
- Datenmodell (order_costs/channel_costs) → Task 1 ✓
- EK-Einfrieren bei createOrder (+ Retoure) → Task 2 ✓
- DB je Beleg (Beleg-Detail) → Task 3 ✓
- DB je Vertriebskanal + Werbung-Mapping (Default + manuell) → Task 4 ✓
- Kanal-Vergleich-Tabelle → Task 5 ✓
- Dashboard DB/MER + Marketing-Effizienz je Ads-Kanal, Umschalter nur auf ad_spend-KPIs → Task 6 ✓
- Hilfe-/Datenmodell-Doku → Task 7 ✓
- Tests + Deploy-Checkpoint → Task 8 ✓

**Offene Angleich-Punkte beim Umsetzen (bewusst markiert, kein Placeholder):**
- `useClientSort`/`ClientSortableTh`-Prop-Namen (Task 5) an die reale Signatur in `src/components/useClientSort.tsx` angleichen.
- `DocBlock`-Feldnamen für `type:'table'` (Task 7) an `content.ts` angleichen.
- `KpiCard`-Einheiten: `percent` erwartet einen Bruch (0..1), `ratio` einen Faktor — `marginTotals.dbProzent`/`mer` liefern genau das.

**Typ-Konsistenz:** `OrderCost`, `CostType`, `CostSource`, `ChannelSummary` (erweitert), `MarginTotals`, `PlatformEfficiency` durchgängig gleich benannt in Tasks 2–6. `contributionMargin`/`adPlatformEfficiency`/`marginTotals`/`mapAdPlatformToChannel` konsistent verwendet.
