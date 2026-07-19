# WooCommerce-Order-Sync vereinheitlichen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Der stündliche WooCommerce-Sync hält neben dem KPI-`orders`-Store auch die ERP-Tabelle `sales_orders` aktuell — inkrementell, inkl. Status/Storno-Abgleich bestehender Belege.

**Architecture:** Kopplung auf Job-Ebene in `scripts/sync-woocommerce.ts` (gleicher `runDue`-Zeitplan + `runConnector`-Lock). Der ERP-Import macht einen eigenen `_fields`-Fetch (`mirror.fetchOrdersRaw`, inkl. `line_items`) mit eigenem Watermark; `importWooCommerceOrders` gleicht bei bereits importierten Belegen jetzt auch Status + Events ab.

**Tech Stack:** TypeScript, node-postgres (`pool`), WooCommerce REST (wc/v3) via `WooCommerceMirror`, vitest.

## Global Constraints

- Umsatz-/Status-Semantik unverändert aus [[2026-07-19-umsatz-kpi-storno-bereinigt-design]]: `sales_orders.status` muss den aktuellen WooCommerce-Status tragen, damit Stornos in den KPIs greifen.
- Nur **woo-gematchte** Belege (`external_references` source `woocommerce`, entity_type `sales_order`, ⇒ `channel='shop'`) werden angefasst. Manuelle Belege / andere Kanäle bleiben unberührt.
- Statusabbildung ausschließlich über `mapOrderStatus` (bestehend). `storniert` hat **keine** Event-Stage (Event-Enum: bestellt/kommissioniert/rechnung_gestellt/bezahlt/retoure) ⇒ Storno = reiner Status.
- Eigener ERP-Watermark (`app_settings`-Keys `woocommerce_erp_orders_synced_at`, `woocommerce_erp_orders_full_synced_at`), unabhängig vom Connector-Watermark.
- **App NIE lokal starten** (`npm run dev`/`docker compose` verboten). Deploy nur bryx-test (`/opt/budp-dev/deploy.sh`) nach Nutzer-Freigabe (Controller, letzter Task).
- Tests laufen mit `npx vitest`. DB-Tests brauchen die **saubere Sibling-DB** `bryx_kosten_test` (Dev-DB verschmutzt) — vor DB-Tests:
  `set -a; source .env; set +a; export DATABASE_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/bryx_kosten_test";process.stdout.write(u.toString())')`.
  Reine (fetch-gemockte) Tests brauchen keine DB/.env.
- vitest typcheckt NICHT → jede .ts-Task endet mit `npx tsc --noEmit` (clean). Alias `@`→`src`. `fileParallelism:false`.
- `git add` NUR die im Task gelisteten Pfade — NIE `git add -A`/`.`.
- Bekannt-rot, NICHT blockierend: `tests/db/rls.test.ts` (Host-Caveat; auf Test-DB grün).

---

### Task 1: `mirror.fetchOrdersRaw` — inkrementeller `modified_after`

**Files:**
- Modify: `src/woocommerce/mirror.ts` (Methode `fetchOrdersRaw`, ~Zeile 139-149)
- Test: `tests/woocommerce/mirror.test.ts` (describe `WooCommerceMirror.fetchOrdersRaw`)

**Interfaces:**
- Produces: `fetchOrdersRaw(page?: number, perPage?: number, modifiedAfter?: Date): Promise<MirrorPage<Record<string, unknown>>>` — hängt bei gesetztem `modifiedAfter` `&modified_after=<ISO>&dates_are_gmt=true` an; sonst unverändert.

- [ ] **Step 1: Failing test ergänzen**

In `tests/woocommerce/mirror.test.ts` im `describe('WooCommerceMirror.fetchOrdersRaw')` einen Test anhängen:

```ts
  it('hängt modified_after (dates_are_gmt) nur an, wenn ein Datum übergeben wird', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([], { 'X-WP-Total': '0', 'X-WP-TotalPages': '0' }));
    const mirror = new WooCommerceMirror(cfg, fetchMock as unknown as typeof fetch);

    await mirror.fetchOrdersRaw(1, 100);
    expect(fetchMock.mock.calls[0][0]).not.toContain('modified_after');

    await mirror.fetchOrdersRaw(1, 100, new Date('2026-07-16T00:00:00.000Z'));
    const url = fetchMock.mock.calls[1][0] as string;
    expect(url).toContain('modified_after=2026-07-16T00%3A00%3A00.000Z');
    expect(url).toContain('dates_are_gmt=true');
  });
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npx vitest run tests/woocommerce/mirror.test.ts -t "modified_after"`
Expected: FAIL — `fetchOrdersRaw` akzeptiert noch kein drittes Argument; die URL enthält kein `modified_after`.

- [ ] **Step 3: Methode erweitern**

In `src/woocommerce/mirror.ts` die Methode ersetzen:

```ts
  // Orders incl. billing + line_items for the ERP import; optional modifiedAfter
  // for incremental syncs (WooCommerce bumps date_modified on any status change).
  async fetchOrdersRaw(page = 1, perPage = 100, modifiedAfter?: Date): Promise<MirrorPage<Record<string, unknown>>> {
    const fields = 'id,number,status,date_created,date_paid,total,currency,customer_id,billing,line_items';
    const mod = modifiedAfter
      ? `&modified_after=${encodeURIComponent(modifiedAfter.toISOString())}&dates_are_gmt=true`
      : '';
    const url = `${this.base}/orders?per_page=${perPage}&page=${page}&orderby=id&order=asc&status=any&_fields=${fields}${mod}`;
    const res = await this.get(url);
    if (!res.ok) throw new Error(`WooCommerce orders fetch failed: ${res.status} ${await res.text()}`);
    const items = (await res.json()) as Record<string, unknown>[];
    const { total, totalPages } = WooCommerceMirror.totals(res);
    return { items, total, totalPages, page };
  }
```

- [ ] **Step 4: Tests + Typecheck grün**

Run: `npx vitest run tests/woocommerce/mirror.test.ts` und `npx tsc --noEmit`
Expected: PASS / clean. (Der bestehende `import:woocommerce-orders`-Aufruf `fetchOrdersRaw(page, 100)` bleibt gültig — drittes Arg optional.)

- [ ] **Step 5: Commit**

```bash
git add src/woocommerce/mirror.ts tests/woocommerce/mirror.test.ts
git commit -m "feat(woo): fetchOrdersRaw unterstützt modified_after (inkrementell)"
```

---

### Task 2: ERP-Watermark

**Files:**
- Create: `src/woocommerce/erp-watermark.ts`
- Test: `tests/woocommerce/erp-watermark.test.ts` (neu)

**Interfaces:**
- Produces: `getErpWatermarks(): Promise<{ syncedAt: Date | null; fullSyncedAt: Date | null }>`, `setErpWatermarks(startedAt: Date, opts: { full: boolean }): Promise<void>`, `shouldErpFullResync(syncedAt: Date | null, fullSyncedAt: Date | null, now: Date): boolean`.

- [ ] **Step 1: Failing test (pure)**

`tests/woocommerce/erp-watermark.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { shouldErpFullResync } from '@/woocommerce/erp-watermark';

const FULL_MAX_AGE_MS = 72_000_000; // 20h

describe('shouldErpFullResync', () => {
  const now = new Date('2026-07-19T12:00:00.000Z');

  it('erzwingt full, wenn noch nie gelaufen', () => {
    expect(shouldErpFullResync(null, null, now)).toBe(true);
  });

  it('erzwingt full, wenn der letzte Full älter als 20h ist', () => {
    const old = new Date(now.getTime() - FULL_MAX_AGE_MS - 1000);
    expect(shouldErpFullResync(now, old, now)).toBe(true);
  });

  it('bleibt inkrementell, wenn der Full frisch ist', () => {
    const fresh = new Date(now.getTime() - 60_000);
    expect(shouldErpFullResync(now, fresh, now)).toBe(false);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npx vitest run tests/woocommerce/erp-watermark.test.ts`
Expected: FAIL — Modul `@/woocommerce/erp-watermark` existiert nicht.

- [ ] **Step 3: Modul anlegen**

`src/woocommerce/erp-watermark.ts` (gespiegelt von `src/connectors/woocommerce/watermark.ts`, eigene Keys):

```ts
import { pool } from '@/lib/db';

const SYNCED = 'woocommerce_erp_orders_synced_at';
const FULL = 'woocommerce_erp_orders_full_synced_at';
const FULL_MAX_AGE_MS = 72_000_000; // 20h — forces a ~nightly full reconcile

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

export async function getErpWatermarks(): Promise<{ syncedAt: Date | null; fullSyncedAt: Date | null }> {
  const [syncedAt, fullSyncedAt] = await Promise.all([get(SYNCED), get(FULL)]);
  return { syncedAt, fullSyncedAt };
}

export async function setErpWatermarks(startedAt: Date, opts: { full: boolean }): Promise<void> {
  await set(SYNCED, startedAt.toISOString());
  if (opts.full) await set(FULL, startedAt.toISOString());
}

export function shouldErpFullResync(syncedAt: Date | null, fullSyncedAt: Date | null, now: Date): boolean {
  if (!syncedAt || !fullSyncedAt) return true;
  return now.getTime() - fullSyncedAt.getTime() >= FULL_MAX_AGE_MS;
}
```

- [ ] **Step 4: Tests + Typecheck grün**

Run: `npx vitest run tests/woocommerce/erp-watermark.test.ts` und `npx tsc --noEmit`
Expected: PASS / clean.

- [ ] **Step 5: Commit**

```bash
git add src/woocommerce/erp-watermark.ts tests/woocommerce/erp-watermark.test.ts
git commit -m "feat(woo): ERP-Order-Watermark (eigener Cursor, ~nächtlicher Full-Resync)"
```

---

### Task 3: `importWooCommerceOrders` — Status/Event-Reconcile bestehender Belege

**Files:**
- Modify: `src/woocommerce/order-import.ts` (`OrderImportResult` + „existing order"-Zweig, ~Zeile 79-133)
- Test: `tests/woocommerce/order-import.test.ts` (neuer DB-`describe`)

**Interfaces:**
- Consumes: `mapOrderStatus` (bestehend).
- Produces: `OrderImportResult` mit zusätzlichem `ordersUpdated: number`. Der „existing"-Zweig aktualisiert Status + automatische Events bei geändertem Status.

- [ ] **Step 1: Failing DB-Test**

In `tests/woocommerce/order-import.test.ts` oben ergänzen:

```ts
import { pool } from '@/lib/db';
import { importWooCommerceOrders } from '@/woocommerce/order-import';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
```

und einen DB-`describe` anhängen:

```ts
describe('importWooCommerceOrders — Status/Event-Reconcile', () => {
  const WOO_ID = 99900001;
  const NUM = `WC-${WOO_ID}`;
  let priceListId: string;

  const rawOrder = (status: string) => ({
    id: WOO_ID, number: String(WOO_ID), status,
    date_created: '2026-07-10T10:00:00', date_paid: '2026-07-10T10:05:00', currency: 'EUR',
    billing: { first_name: 'Recon', last_name: 'Test', email: 'recon.test@example.com', country: 'DE', postcode: '10115' },
    line_items: [{ sku: 'SJ-BLAU', quantity: 2, price: '10.00' }],
  });

  async function statusOf(): Promise<string> {
    const r = await pool.query<{ status: string }>('SELECT status FROM sales_orders WHERE number=$1', [NUM]);
    return r.rows[0]?.status;
  }
  async function eventStages(): Promise<string[]> {
    const r = await pool.query<{ stage: string }>(
      `SELECT e.stage FROM sales_order_events e JOIN sales_orders o ON o.id=e.order_id
        WHERE o.number=$1 ORDER BY e.stage`, [NUM]);
    return r.rows.map((x) => x.stage);
  }

  beforeAll(async () => {
    await seedKontakte(); await seedKatalog();
    const pl = await pool.query<{ id: string }>('SELECT id FROM price_lists WHERE is_default LIMIT 1');
    priceListId = pl.rows[0].id;
    await importWooCommerceOrders(pool, [rawOrder('processing')], priceListId); // → auftrag
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM external_references WHERE entity_type='sales_order'
         AND entity_id IN (SELECT id FROM sales_orders WHERE number=$1)`, [NUM]);
    await pool.query('DELETE FROM sales_orders WHERE number=$1', [NUM]);
    await pool.query(`DELETE FROM contacts WHERE id IN (
      SELECT entity_id FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='recon.test@example.com')`);
    await pool.query(`DELETE FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='recon.test@example.com'`);
    await pool.end();
  });

  it('setup: processing wurde als auftrag importiert', async () => {
    expect(await statusOf()).toBe('auftrag');
  });

  it('re-import als cancelled → status storniert, ordersUpdated=1, keine Zeilen-Dubletten', async () => {
    const r = await importWooCommerceOrders(pool, [rawOrder('cancelled')], priceListId);
    expect(r.ordersUpdated).toBe(1);
    expect(await statusOf()).toBe('storniert');
    const lines = await pool.query('SELECT count(*)::int n FROM sales_order_lines l JOIN sales_orders o ON o.id=l.order_id WHERE o.number=$1', [NUM]);
    expect(lines.rows[0].n).toBe(1);
  });

  it('re-import als completed → bezahlt mit bezahlt-Event; dann refunded → retoure, bezahlt-Event weg', async () => {
    await importWooCommerceOrders(pool, [rawOrder('completed')], priceListId);
    expect(await statusOf()).toBe('bezahlt');
    expect(await eventStages()).toEqual(['bestellt', 'bezahlt']);

    await importWooCommerceOrders(pool, [rawOrder('refunded')], priceListId);
    expect(await statusOf()).toBe('retoure');
    expect(await eventStages()).toEqual(['bestellt', 'retoure']);
  });

  it('re-import mit gleichem Status → ordersUpdated=0 (idempotent)', async () => {
    const r = await importWooCommerceOrders(pool, [rawOrder('refunded')], priceListId);
    expect(r.ordersUpdated).toBe(0);
    expect(await statusOf()).toBe('retoure');
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run (Test-DB):
```
set -a; source .env; set +a
export DATABASE_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/bryx_kosten_test";process.stdout.write(u.toString())')
npx vitest run tests/woocommerce/order-import.test.ts -t "Reconcile"
```
Expected: FAIL — `ordersUpdated` ist `undefined`; Status bleibt auf `auftrag` (existing-Zweig aktualisiert Status nicht).

- [ ] **Step 3: `OrderImportResult` + existing-Zweig erweitern**

In `src/woocommerce/order-import.ts` das Interface ergänzen:

```ts
export interface OrderImportResult {
  ordersCreated: number;
  ordersLinked: number;      // already imported, unchanged status (only lines reconciled)
  ordersUpdated: number;     // already imported, status changed → status + events reconciled
  contactsCreated: number;
  linesImported: number;
  linesSkipped: number;
}
```

Die Initialisierung in `importWooCommerceOrders` um `ordersUpdated: 0,` erweitern.

Im „existing order"-Zweig **nach** dem Zeilen-Reconcile, aber **anstatt** des bisherigen `result.ordersLinked++; await c.query('COMMIT'); continue;`, den Status prüfen und genau einmal committen:

```ts
        // Status + automatische Events abgleichen (Storno/Refund propagieren).
        const newStatus = mapOrderStatus(String(raw.status));
        const cur = await c.query<{ status: string }>('SELECT status FROM sales_orders WHERE id=$1', [existingOrderId]);
        if (cur.rows[0].status !== newStatus) {
          await c.query('UPDATE sales_orders SET status=$2 WHERE id=$1', [existingOrderId, newStatus]);
          await c.query('DELETE FROM sales_order_events WHERE order_id=$1 AND automated=true', [existingOrderId]);
          const placedAt = (raw.date_created as string) ?? null;
          await c.query(
            `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
             VALUES ($1,'bestellt','verkauf',true, COALESCE($2::timestamptz, now()))`, [existingOrderId, placedAt]);
          if (newStatus === 'bezahlt') {
            await c.query(
              `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
               VALUES ($1,'bezahlt','finanzen',true, COALESCE($2::timestamptz,$3::timestamptz, now()))`,
              [existingOrderId, (raw.date_paid as string) ?? null, placedAt]);
          } else if (newStatus === 'retoure') {
            await c.query(
              `INSERT INTO sales_order_events (order_id, stage, source_app, automated, occurred_at)
               VALUES ($1,'retoure','verkauf',true, COALESCE($2::timestamptz, now()))`, [existingOrderId, placedAt]);
          }
          result.ordersUpdated++;
        } else {
          result.ordersLinked++;
        }
        await c.query('COMMIT');
        continue;
```

Wichtig: Der Zeilen-Reconcile (DELETE/INSERT `sales_order_lines`) bleibt davor unverändert; nur der Abschluss des existing-Zweigs (Zähler + COMMIT) wird durch obigen Block ersetzt, sodass **genau ein** COMMIT pro Beleg erfolgt.

- [ ] **Step 4: Tests grün**

Run (Test-DB, wie Step 2, ganze Datei):
`npx vitest run tests/woocommerce/order-import.test.ts` + `npx tsc --noEmit`
Expected: PASS / clean. Der bestehende `scripts/import-woocommerce-orders.ts` liest `result` nur für die Konsolenausgabe — additive Feld-Ergänzung bricht ihn nicht.

- [ ] **Step 5: Commit**

```bash
git add src/woocommerce/order-import.ts tests/woocommerce/order-import.test.ts
git commit -m "feat(woo): Order-Import gleicht Status + Events bestehender Belege ab (Storno-Propagation)"
```

---

### Task 4: `sync-woocommerce.ts` — ERP-Import-Schritt

**Files:**
- Modify: `scripts/sync-woocommerce.ts`

**Interfaces:**
- Consumes: `WooCommerceMirror` (`../src/woocommerce/mirror`), `importWooCommerceOrders` (Task 3), `getErpWatermarks`/`setErpWatermarks`/`shouldErpFullResync` (Task 2).

- [ ] **Step 1: ERP-Block ergänzen**

In `scripts/sync-woocommerce.ts` Imports ergänzen:

```ts
import { WooCommerceMirror } from '../src/woocommerce/mirror';
import { importWooCommerceOrders } from '../src/woocommerce/order-import';
import { getErpWatermarks, setErpWatermarks, shouldErpFullResync } from '../src/woocommerce/erp-watermark';
```

In `main()`, **nach** `await setWatermarks(startedAt, { full });` und der zugehörigen Log-Zeile, vor `await pool.end();`, einfügen:

```ts
  // ── ERP-Belege (sales_orders) aus denselben WooCommerce-Bestellungen ──
  // Eigener Fetch (voller _fields inkl. line_items) + eigener Watermark; hält
  // sales_orders inkl. Statuswechsel/Storno aktuell.
  const mirror = new WooCommerceMirror({
    storeUrl: cfg.WOOCOMMERCE_STORE_URL,
    consumerKey: cfg.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: cfg.WOOCOMMERCE_CONSUMER_SECRET,
  });
  const pl = await pool.query<{ id: string }>('SELECT id FROM price_lists WHERE is_default LIMIT 1');
  if (pl.rows.length === 0) {
    console.log('ERP-Import übersprungen: keine Standard-Preisliste.');
  } else {
    const erpStarted = new Date();
    const wm = await getErpWatermarks();
    const erpFull = shouldErpFullResync(wm.syncedAt, wm.fullSyncedAt, erpStarted);
    const since = erpFull ? undefined : new Date(wm.syncedAt!.getTime() - DELTA_OVERLAP_MS);
    console.log(`ERP-Import: ${erpFull ? 'full' : `delta seit ${since!.toISOString()}`}…`);
    const orders: Record<string, unknown>[] = [];
    let page = 1;
    for (;;) {
      const p = await mirror.fetchOrdersRaw(page, 100, since);
      orders.push(...p.items);
      if (page >= p.totalPages || p.items.length === 0) break;
      page += 1;
    }
    const r = await importWooCommerceOrders(pool, orders, pl.rows[0].id);
    await setErpWatermarks(erpStarted, { full: erpFull });
    console.log(`ERP-Import fertig: ${JSON.stringify(r)}`);
  }
```

Hinweis: Der Connector-Watermark ist zu diesem Zeitpunkt bereits gesetzt; ein Fehler im ERP-Block wirft (Skript endet mit exit 1), lässt aber den Connector-Erfolg bestehen. Der ERP-Watermark wird nur nach erfolgreichem Import geschrieben ⇒ nächster Lauf holt dieselbe Delta erneut.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: clean. (Kein Unit-Test für das Live-Skript — Verifikation via Deploy/Browser in Task 6.)

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-woocommerce.ts
git commit -m "feat(woo): sync:woocommerce importiert ERP-Belege inkrementell mit (einheitlicher Sync)"
```

---

### Task 5: Doku

**Files:**
- Modify: `src/lib/help/content.ts` (Adminseite `verbindungen`)
- Test: `tests/lib/help-content.test.ts` (muss grün bleiben)

**Interfaces:** keine — reine Doku.

- [ ] **Step 1: Verbindungen-Hilfe ergänzen**

In `src/lib/help/content.ts` auf der `verbindungen`-Seite (WooCommerce-Abschnitt) einen Listenpunkt/Absatz ergänzen, der die Realität beschreibt:

```ts
            'Der stündliche WooCommerce-Sync aktualisiert zwei Stellen: die KPI-Rohdaten (orders) und die ERP-Belege (sales_orders). Statuswechsel inkl. Storno/Retoure werden dabei auf bestehende Belege übertragen (inkrementell via modified_after, nächtlicher Voll-Abgleich als Sicherheitsnetz).',
```

(Exakte Einbettung an die vorhandene Blockstruktur der `verbindungen`-Seite anpassen; nur additiv, keine slugs/Struktur ändern.)

- [ ] **Step 2: Doku-Test grün**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(woo): Verbindungen-Hilfe – Sync aktualisiert auch ERP-Belege inkl. Storno"
```

---

### Task 6: Gesamtverifikation + Deploy + Storno-Live-Test

**Files:** keine — Verifikation.

- [ ] **Step 1: Volle relevante Suite (Test-DB)**

```
set -a; source .env; set +a
export DATABASE_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/bryx_kosten_test";process.stdout.write(u.toString())')
npx vitest run tests/woocommerce tests/lib/help-content.test.ts
```
Expected: PASS.

- [ ] **Step 2: Typecheck + Build**

Run: `npx tsc --noEmit` und `npm run build`
Expected: clean / erfolgreich.

- [ ] **Step 3: Deploy bryx-test**

`/opt/budp-dev/deploy.sh` (nach Nutzer-Freigabe). Kein Prod.

- [ ] **Step 4: Sync + Storno-Live-Verifikation**

- `npm run sync:woocommerce` einmal manuell (Laufzeit-DB) → Log zeigt Connector- UND ERP-Import; `sales_orders` aktuell; `app_settings` hat `woocommerce_erp_orders_*`.
- In WooCommerce (Test-Store) eine **bereits importierte** Bestellung stornieren → `npm run sync:woocommerce` erneut → der Beleg in `sales_orders` ist `storniert`; auf `/verkauf` reagieren Stornoquote/Umsatz.
- Konsole der KPI-Seiten clean.

- [ ] **Step 5: Abschluss-Commit (falls Verifikations-Fixes)**

```bash
git add -A && git commit -m "fix(woo): Nachjustierung aus Sync-Verifikation"
```

---

## Self-Review

**Spec coverage:**
- `fetchOrdersRaw` modified_after → Task 1.
- Eigener ERP-Watermark → Task 2.
- Status+Event-Reconcile bestehender Belege (+`ordersUpdated`) → Task 3.
- Kopplung in `sync-woocommerce.ts` (eigener Fetch + Watermark, gleicher Zeitplan/Lock) → Task 4.
- Storno-Propagation via modified_after + nächtlicher Full → Task 4 (Logik) + Task 6 (Live-Verifikation).
- Doku → Task 5.
- Nur woo-gematchte `channel=shop`-Belege betroffen → Task 3 (Zweig greift nur bei existierender `external_references`-sales_order-Zuordnung).

**Placeholder scan:** keine TBD/TODO; jeder Code-Step zeigt konkreten Code.

**Type consistency:** `OrderImportResult.ordersUpdated` (Task 3) wird vom Test (Task 3) und dem Skript-Log (Task 4) gelesen; `fetchOrdersRaw(…, modifiedAfter?)` (Task 1) wird in Task 4 mit drittem Arg genutzt; `getErpWatermarks/setErpWatermarks/shouldErpFullResync` (Task 2) in Task 4 konsumiert. Konsistent.
