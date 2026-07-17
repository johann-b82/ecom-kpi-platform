# Verfügbarkeit: Bestandsverlauf, Verkaufskurve & Nachliefer-Prognose — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aus den WooCommerce-Daten pro Artikel und pro Kategorie eine Bestandsverlaufs- und Verkaufskurve plus eine Nachliefer-Prognose (Reichweite, Leerdatum, Bestellvorschlag) darstellen; das Verfügbarkeit-Modul wird zum Dashboard.

**Architecture:** Ein täglicher Job zieht den Live-Bestand aus WooCommerce in `stock_levels` und schreibt einen Tages-Snapshot in die neue Append-only-Tabelle `stock_snapshots` (Bestandshistorie beginnt heute, wächst vorwärts). Reine Rechen- und Query-Funktionen im Modul `src/verfuegbarkeit/` liefern Bestands-/Verkaufsreihen (aus `stock_snapshots` bzw. `sales_order_lines`), eine Prognose und ein Kategorie-Rollup. Die UI unter `/verfügbarkeit` wird von einer reinen Liste zu einem Dashboard (Kategorie-Übersicht + Alerts → Artikel-Detail mit zwei Kurven + Prognosekachel), Charts über die vorhandenen Recharts-Primitive.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), PostgreSQL (`pg` Pool via `@/lib/db`), Recharts, TypeScript, Vitest, Tailwind (ERP-Designtokens).

## Global Constraints

- **Kein lokaler App-Lauf.** App nur auf dem VPS (`root@194.164.204.249`, https://budp.lumeapps.de) betreiben/verifizieren. Vitest läuft lokal (`npx vitest`).
- **ERP-Designsystem verbindlich** (`docs/design/design-system.md`): Akzent nur via `--accent`/`bg-accent`/`text-brand`, warme `neutral`-Palette (keine gray/slate/zinc/stone), Dark-Mode-Varianten Pflicht, `.anno` nur für UPPERCASE-Mikrolabels. Charts nutzen `@/components/charts/chart-style` (`BRAND`, `MUTED`, `TICK`, `num`).
- **Hilfe-Doku pflegen** (`src/lib/help/content.ts`): Datenmodell-Änderung → Datenmodell-Seite; neue Funktion → Modul-Hilfe. Registry-Test `tests/lib/help-content.test.ts` erzwingt eine Hilfeseite je App.
- **DB-Zugriff** immer über `import { pool } from '@/lib/db'` (Skripte: `../src/lib/db`). Idempotentes Schema in `db/schema.sql` (`CREATE TABLE IF NOT EXISTS`), RLS in `db/rls.sql`; angewandt via `npm run migrate`.
- **Prognose-Konstanten:** Verbrauchsfenster = 90 Tage, Wiederbeschaffungshorizont (Übersee) `LEAD_TIME_DAYS` = 90 Tage, Alert-Schwelle Reichweite < 90 Tage.
- **Git:** Conventional Commits (`feat:`/`fix:`/`refactor:`/`test:`/`docs:`), kleine Commits je Task, deutschsprachige Copy in der UI.

---

### Task 1: Tabelle `stock_snapshots` (Schema + RLS)

**Files:**
- Modify: `db/schema.sql` (nach dem `stock_adjustments`-Block, ~Zeile 396)
- Modify: `db/rls.sql` (analog zu den übrigen ERP-Tabellen)
- Test: `tests/db/stock-snapshots-schema.test.ts` (Create)

**Interfaces:**
- Produces: Tabelle `stock_snapshots(variant_id UUID, warehouse_id UUID, snapshot_date DATE, quantity_on_hand INT, quantity_reserved INT)`, PK `(variant_id, warehouse_id, snapshot_date)`.

- [ ] **Step 1: Schema-Block ergänzen**

In `db/schema.sql` direkt nach dem `stock_adjustments`-CREATE einfügen:

```sql
-- Täglicher Bestands-Snapshot je Variante/Lager. Append-only, ein Satz pro Tag;
-- Quelle für den Bestandsverlauf (WooCommerce liefert keine Historie).
CREATE TABLE IF NOT EXISTS stock_snapshots (
  variant_id        UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  snapshot_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity_on_hand  INT  NOT NULL,
  quantity_reserved INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (variant_id, warehouse_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS stock_snapshots_variant_date_idx
  ON stock_snapshots (variant_id, snapshot_date);
```

- [ ] **Step 2: RLS-Policy ergänzen**

Öffne `db/rls.sql`, finde die Policy für `stock_adjustments` und füge einen analogen Block für `stock_snapshots` an (gleiche `ENABLE ROW LEVEL SECURITY` + Policy-Struktur wie die Nachbartabelle; denselben Rollen-/`app_user`-Ausdruck kopieren, der dort verwendet wird).

- [ ] **Step 3: Failing test schreiben**

```typescript
// tests/db/stock-snapshots-schema.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';

afterAll(async () => { await pool.end(); });

describe('stock_snapshots schema', () => {
  it('existiert mit PK (variant_id, warehouse_id, snapshot_date)', async () => {
    const cols = await pool.query(
      `SELECT column_name FROM information_schema.columns
        WHERE table_name = 'stock_snapshots' ORDER BY column_name`);
    const names = cols.rows.map((r: { column_name: string }) => r.column_name);
    expect(names).toEqual(
      ['quantity_on_hand', 'quantity_reserved', 'snapshot_date', 'variant_id', 'warehouse_id']);
    const pk = await pool.query(
      `SELECT a.attname FROM pg_index i
         JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
        WHERE i.indrelid = 'stock_snapshots'::regclass AND i.indisprimary
        ORDER BY a.attname`);
    expect(pk.rows.map((r: { attname: string }) => r.attname)).toEqual(
      ['snapshot_date', 'variant_id', 'warehouse_id']);
  });
});
```

- [ ] **Step 4: Migration anwenden, Test läuft**

Run: `npm run migrate && npx vitest run tests/db/stock-snapshots-schema.test.ts`
Expected: „Schema applied." + PASS. (Falls die lokale DB nicht erreichbar ist, Migration/Test auf dem VPS ausführen.)

- [ ] **Step 5: Commit**

```bash
git add db/schema.sql db/rls.sql tests/db/stock-snapshots-schema.test.ts
git commit -m "feat(verfuegbarkeit): stock_snapshots Tabelle für Bestandsverlauf"
```

---

### Task 2: WooCommerce-Bestand fokussiert nach `stock_levels` ziehen

**Files:**
- Create: `src/woocommerce/stock-refresh.ts`
- Test: `tests/woocommerce/stock-refresh.test.ts`

**Interfaces:**
- Consumes: `WooCommerceMirror` aus `src/woocommerce/mirror.ts` (`fetchProductsRaw(page, perPage)`, `fetchVariationsRaw(productWooId, page, perPage)` → `MirrorPage<Record<string, unknown>>` mit `{ items, totalPages }`).
- Produces:
  - `collectStockFromMirror(mirror: Pick<WooCommerceMirror, 'fetchProductsRaw' | 'fetchVariationsRaw'>): Promise<{ sku: string; qty: number }[]>` — pure gegenüber der DB; testbar mit Fake-Mirror.
  - `applyStockLevels(client: Pool | PoolClient, rows: { sku: string; qty: number }[]): Promise<number>` — upsert in `stock_levels` (Standardlager), gibt betroffene Zeilen zurück.

- [ ] **Step 1: Failing test für `collectStockFromMirror`**

```typescript
// tests/woocommerce/stock-refresh.test.ts
import { describe, it, expect } from 'vitest';
import { collectStockFromMirror } from '../../src/woocommerce/stock-refresh';

function page(items: Record<string, unknown>[], totalPages = 1) {
  return { items, totalPages, total: items.length, page: 1 };
}

describe('collectStockFromMirror', () => {
  it('sammelt sku+stock_quantity von simplen Produkten und Variationen', async () => {
    const fake = {
      fetchProductsRaw: async (p: number) => p === 1 ? page([
        { id: 1, type: 'simple', sku: 'A', stock_quantity: 5 },
        { id: 2, type: 'variable', sku: 'PARENT' },
      ]) : page([]),
      fetchVariationsRaw: async (wooId: number) => wooId === 2
        ? page([{ id: 20, sku: 'B', stock_quantity: 3 }, { id: 21, sku: 'C', stock_quantity: 0 }])
        : page([]),
    };
    const rows = await collectStockFromMirror(fake as never);
    expect(rows).toEqual([
      { sku: 'A', qty: 5 }, { sku: 'B', qty: 3 }, { sku: 'C', qty: 0 },
    ]);
  });

  it('überspringt Einträge ohne sku oder ohne numerische Menge', async () => {
    const fake = {
      fetchProductsRaw: async (p: number) => p === 1 ? page([
        { id: 1, type: 'simple', sku: '', stock_quantity: 5 },
        { id: 2, type: 'simple', sku: 'D', stock_quantity: null },
        { id: 3, type: 'simple', sku: 'E', stock_quantity: 7 },
      ]) : page([]),
      fetchVariationsRaw: async () => page([]),
    };
    const rows = await collectStockFromMirror(fake as never);
    expect(rows).toEqual([{ sku: 'E', qty: 7 }]);
  });
});
```

- [ ] **Step 2: Test rot verifizieren**

Run: `npx vitest run tests/woocommerce/stock-refresh.test.ts`
Expected: FAIL („Cannot find module '.../stock-refresh'").

- [ ] **Step 3: `stock-refresh.ts` implementieren**

```typescript
// src/woocommerce/stock-refresh.ts
import type { Pool, PoolClient } from 'pg';
import type { WooCommerceMirror } from './mirror';

type MirrorLike = Pick<WooCommerceMirror, 'fetchProductsRaw' | 'fetchVariationsRaw'>;

const asQty = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return parseInt(v, 10);
  return null;
};
const asSku = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Zieht sku+stock_quantity aller Produkte (inkl. Variationen variabler Produkte)
 *  aus dem WooCommerce-Mirror. Kein DB-Zugriff — testbar mit Fake-Mirror. */
export async function collectStockFromMirror(mirror: MirrorLike): Promise<{ sku: string; qty: number }[]> {
  const out: { sku: string; qty: number }[] = [];
  const push = (raw: Record<string, unknown>) => {
    const sku = asSku(raw.sku); const qty = asQty(raw.stock_quantity);
    if (sku && qty !== null) out.push({ sku, qty });
  };
  for (let page = 1; ; page += 1) {
    const p = await mirror.fetchProductsRaw(page, 100);
    for (const raw of p.items) {
      if (raw.type === 'variable') {
        const wooId = Number(raw.id);
        for (let vp = 1; ; vp += 1) {
          const vpage = await mirror.fetchVariationsRaw(wooId, vp, 100);
          for (const vr of vpage.items) push(vr);
          if (vp >= vpage.totalPages || vpage.items.length === 0) break;
        }
      } else {
        push(raw);
      }
    }
    if (page >= p.totalPages || p.items.length === 0) break;
  }
  return out;
}

/** Upsert der gesammelten Mengen ins Standardlager (match per SKU → variant_id).
 *  Unbekannte SKUs werden ignoriert. Gibt die Zahl geschriebener Zeilen zurück. */
export async function applyStockLevels(
  client: Pool | PoolClient, rows: { sku: string; qty: number }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const skus = rows.map((r) => r.sku);
  const qtys = rows.map((r) => r.qty);
  const res = await client.query(
    `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand)
     SELECT v.id, (SELECT id FROM warehouses WHERE is_default LIMIT 1), s.qty
       FROM unnest($1::text[], $2::int[]) AS s(sku, qty)
       JOIN product_variants v ON v.sku = s.sku
     ON CONFLICT (variant_id, warehouse_id)
       DO UPDATE SET quantity_on_hand = EXCLUDED.quantity_on_hand`,
    [skus, qtys]);
  return res.rowCount ?? 0;
}
```

- [ ] **Step 4: Test grün verifizieren**

Run: `npx vitest run tests/woocommerce/stock-refresh.test.ts`
Expected: PASS (beide Fälle).

- [ ] **Step 5: Commit**

```bash
git add src/woocommerce/stock-refresh.ts tests/woocommerce/stock-refresh.test.ts
git commit -m "feat(verfuegbarkeit): WooCommerce-Bestand fokussiert in stock_levels ziehen"
```

---

### Task 3: Tages-Snapshot-Writer + Job-Skript

**Files:**
- Create: `src/verfuegbarkeit/snapshot.ts`
- Create: `scripts/snapshot-stock.ts`
- Modify: `package.json` (Script `snapshot:stock`, nach `backfill:stock-reorder`)
- Test: `tests/verfuegbarkeit/snapshot.test.ts`

**Interfaces:**
- Consumes: `applyStockLevels`, `collectStockFromMirror` (Task 2); `loadConnectorConfig` aus `@/lib/credentials`; `WooCommerceMirror`.
- Produces: `writeDailySnapshot(client: Pool | PoolClient, today?: string): Promise<number>` — schreibt je Variante/Lager genau einen Satz für `today` (Default `CURRENT_DATE`), idempotent via `ON CONFLICT DO NOTHING`; gibt eingefügte Zeilen zurück.

- [ ] **Step 1: Failing test (Idempotenz)**

```typescript
// tests/verfuegbarkeit/snapshot.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';
import { writeDailySnapshot } from '../../src/verfuegbarkeit/snapshot';

const TODAY = '2026-07-17';
let variantId: string;

beforeAll(async () => {
  // Nutze eine beliebige vorhandene Variante mit Standardlager-Bestand.
  const wh = await pool.query(`SELECT id FROM warehouses WHERE is_default LIMIT 1`);
  const whId = wh.rows[0].id;
  const v = await pool.query(`SELECT id FROM product_variants LIMIT 1`);
  variantId = v.rows[0].id;
  await pool.query(
    `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand, quantity_reserved)
     VALUES ($1, $2, 42, 3)
     ON CONFLICT (variant_id, warehouse_id) DO UPDATE SET quantity_on_hand = 42, quantity_reserved = 3`,
    [variantId, whId]);
  await pool.query(`DELETE FROM stock_snapshots WHERE snapshot_date = $1`, [TODAY]);
});

afterAll(async () => {
  await pool.query(`DELETE FROM stock_snapshots WHERE snapshot_date = $1`, [TODAY]);
  await pool.end();
});

describe('writeDailySnapshot', () => {
  it('schreibt genau einen Satz pro Variante/Lager/Tag und ist idempotent', async () => {
    const first = await writeDailySnapshot(pool, TODAY);
    expect(first).toBeGreaterThan(0);
    const second = await writeDailySnapshot(pool, TODAY);
    expect(second).toBe(0); // ON CONFLICT DO NOTHING
    const row = await pool.query(
      `SELECT quantity_on_hand, quantity_reserved FROM stock_snapshots
        WHERE variant_id = $1 AND snapshot_date = $2`, [variantId, TODAY]);
    expect(row.rows[0]).toMatchObject({ quantity_on_hand: 42, quantity_reserved: 3 });
    const cnt = await pool.query(
      `SELECT count(*)::int AS n FROM stock_snapshots WHERE variant_id = $1 AND snapshot_date = $2`,
      [variantId, TODAY]);
    expect(cnt.rows[0].n).toBe(1);
  });
});
```

- [ ] **Step 2: Test rot verifizieren**

Run: `npx vitest run tests/verfuegbarkeit/snapshot.test.ts`
Expected: FAIL („Cannot find module '.../snapshot'"). (Bei fehlender lokaler DB auf dem VPS ausführen.)

- [ ] **Step 3: `snapshot.ts` implementieren**

```typescript
// src/verfuegbarkeit/snapshot.ts
import type { Pool, PoolClient } from 'pg';

/** Schreibt für `today` (Default CURRENT_DATE) einen Bestands-Snapshot je
 *  Variante/Lager aus dem aktuellen stock_levels. Idempotent pro Tag. */
export async function writeDailySnapshot(
  client: Pool | PoolClient, today?: string,
): Promise<number> {
  const res = await client.query(
    `INSERT INTO stock_snapshots (variant_id, warehouse_id, snapshot_date, quantity_on_hand, quantity_reserved)
     SELECT variant_id, warehouse_id, COALESCE($1::date, CURRENT_DATE), quantity_on_hand, quantity_reserved
       FROM stock_levels
     ON CONFLICT (variant_id, warehouse_id, snapshot_date) DO NOTHING`,
    [today ?? null]);
  return res.rowCount ?? 0;
}
```

- [ ] **Step 4: Test grün verifizieren**

Run: `npx vitest run tests/verfuegbarkeit/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Job-Skript schreiben**

```typescript
// scripts/snapshot-stock.ts
// Täglicher Bestands-Snapshot: (1) Live-Bestand aus WooCommerce in stock_levels,
// (2) Tages-Snapshot in stock_snapshots. Idempotent pro Tag; per Cron auf dem VPS.
import { WooCommerceMirror } from '../src/woocommerce/mirror';
import { collectStockFromMirror, applyStockLevels } from '../src/woocommerce/stock-refresh';
import { writeDailySnapshot } from '../src/verfuegbarkeit/snapshot';
import { loadConnectorConfig } from '../src/lib/credentials';
import { pool } from '../src/lib/db';

async function main() {
  const cfg = await loadConnectorConfig('woocommerce');
  const mirror = new WooCommerceMirror({
    storeUrl: cfg.WOOCOMMERCE_STORE_URL,
    consumerKey: cfg.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: cfg.WOOCOMMERCE_CONSUMER_SECRET,
  });
  const rows = await collectStockFromMirror(mirror);
  const written = await applyStockLevels(pool, rows);
  console.log(`Bestand aus WooCommerce aktualisiert: ${written} Varianten (von ${rows.length} gelesen).`);
  const snap = await writeDailySnapshot(pool);
  console.log(`Snapshot geschrieben: ${snap} neue Sätze (heute).`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: npm-Script registrieren**

In `package.json` nach der Zeile `"backfill:stock-reorder": ...` einfügen:

```json
    "snapshot:stock": "tsx scripts/snapshot-stock.ts",
```

- [ ] **Step 7: Skript-Lauf verifizieren (VPS)**

Run (auf dem VPS, mit gesetzten WooCommerce-Credentials): `npm run snapshot:stock`
Expected: zwei Log-Zeilen (Bestand aktualisiert / Snapshot geschrieben), Exit 0. Zweiter Lauf am selben Tag → „Snapshot geschrieben: 0 neue Sätze".

- [ ] **Step 8: Commit**

```bash
git add src/verfuegbarkeit/snapshot.ts scripts/snapshot-stock.ts package.json tests/verfuegbarkeit/snapshot.test.ts
git commit -m "feat(verfuegbarkeit): täglicher Bestands-Snapshot-Job (snapshot:stock)"
```

- [ ] **Step 9: Täglichen Cron auf dem VPS einrichten**

Auf dem VPS eine Crontab-Zeile ergänzen (einmal täglich, z.B. 02:30), analog zum bestehenden stündlichen `sync-runner`-Cron:

```
30 2 * * * cd /root/ecom-platform && npm run snapshot:stock >> /var/log/snapshot-stock.log 2>&1
```

Verify: `crontab -l` zeigt die Zeile. (Diese Änderung ist Infrastruktur, kein Commit.)

---

### Task 4: Prognose-Berechnung (`forecast.ts`)

**Files:**
- Create: `src/verfuegbarkeit/forecast.ts`
- Test: `tests/verfuegbarkeit/forecast.test.ts`

**Interfaces:**
- Produces:
  - `LEAD_TIME_DAYS = 90`, `CONSUMPTION_WINDOW_DAYS = 90` (Konstanten, exportiert).
  - `interface ForecastInput { onHand: number; reorderPoint: number; unitsInWindow: number; windowDays: number }`
  - `interface Forecast { avgDailyConsumption: number; reichweiteTage: number | null; leerAmDatum: string | null; sollBestellen: boolean; bestellvorschlag: number }`
  - `computeForecast(input: ForecastInput, today: Date): Forecast`

- [ ] **Step 1: Failing test schreiben**

```typescript
// tests/verfuegbarkeit/forecast.test.ts
import { describe, it, expect } from 'vitest';
import { computeForecast } from '../../src/verfuegbarkeit/forecast';

const TODAY = new Date('2026-07-17T00:00:00Z');

describe('computeForecast', () => {
  it('rechnet Ø-Verbrauch, Reichweite und Leerdatum', () => {
    // 180 Stück in 90 Tagen = 2/Tag; 100 auf Lager → 50 Tage Reichweite.
    const f = computeForecast({ onHand: 100, reorderPoint: 40, unitsInWindow: 180, windowDays: 90 }, TODAY);
    expect(f.avgDailyConsumption).toBeCloseTo(2, 6);
    expect(f.reichweiteTage).toBeCloseTo(50, 6);
    expect(f.leerAmDatum).toBe('2026-09-05'); // 17.07. + 50 Tage
  });

  it('empfiehlt Bestellung, wenn Reichweite < LEAD_TIME_DAYS (90)', () => {
    // 2/Tag, 100 auf Lager → 50 Tage < 90 → bestellen; Ziel 90 Tage Deckung = 180, minus 100 = 80.
    const f = computeForecast({ onHand: 100, reorderPoint: 40, unitsInWindow: 180, windowDays: 90 }, TODAY);
    expect(f.sollBestellen).toBe(true);
    expect(f.bestellvorschlag).toBe(80);
  });

  it('empfiehlt nichts bei ausreichender Reichweite', () => {
    // 2/Tag, 400 auf Lager → 200 Tage > 90.
    const f = computeForecast({ onHand: 400, reorderPoint: 40, unitsInWindow: 180, windowDays: 90 }, TODAY);
    expect(f.sollBestellen).toBe(false);
    expect(f.bestellvorschlag).toBe(0);
    expect(f.reichweiteTage).toBeCloseTo(200, 6);
  });

  it('behandelt Null-Verbrauch: keine endliche Reichweite, kein Leerdatum', () => {
    const f = computeForecast({ onHand: 100, reorderPoint: 40, unitsInWindow: 0, windowDays: 90 }, TODAY);
    expect(f.avgDailyConsumption).toBe(0);
    expect(f.reichweiteTage).toBeNull();
    expect(f.leerAmDatum).toBeNull();
    expect(f.sollBestellen).toBe(false);
    expect(f.bestellvorschlag).toBe(0);
  });
});
```

- [ ] **Step 2: Test rot verifizieren**

Run: `npx vitest run tests/verfuegbarkeit/forecast.test.ts`
Expected: FAIL („Cannot find module '.../forecast'").

- [ ] **Step 3: `forecast.ts` implementieren**

```typescript
// src/verfuegbarkeit/forecast.ts
// Nachliefer-Prognose: Verbrauchsrate + Reichweite. Bestellung aus Übersee →
// 90-Tage-Fenster und 90-Tage-Wiederbeschaffungshorizont.
export const CONSUMPTION_WINDOW_DAYS = 90;
export const LEAD_TIME_DAYS = 90;

export interface ForecastInput {
  onHand: number; reorderPoint: number; unitsInWindow: number; windowDays: number;
}
export interface Forecast {
  avgDailyConsumption: number;
  reichweiteTage: number | null;
  leerAmDatum: string | null;
  sollBestellen: boolean;
  bestellvorschlag: number;
}

function addDaysIso(today: Date, days: number): string {
  const d = new Date(today.getTime());
  d.setUTCDate(d.getUTCDate() + Math.floor(days));
  return d.toISOString().slice(0, 10);
}

export function computeForecast(input: ForecastInput, today: Date): Forecast {
  const { onHand, unitsInWindow, windowDays } = input;
  const avg = unitsInWindow > 0 && windowDays > 0 ? unitsInWindow / windowDays : 0;
  const reichweiteTage = avg > 0 ? onHand / avg : null;
  const leerAmDatum = reichweiteTage !== null ? addDaysIso(today, reichweiteTage) : null;
  const sollBestellen = reichweiteTage !== null && reichweiteTage < LEAD_TIME_DAYS;
  const bestellvorschlag = sollBestellen
    ? Math.max(0, Math.ceil(avg * LEAD_TIME_DAYS) - onHand)
    : 0;
  return { avgDailyConsumption: avg, reichweiteTage, leerAmDatum, sollBestellen, bestellvorschlag };
}
```

- [ ] **Step 4: Test grün verifizieren**

Run: `npx vitest run tests/verfuegbarkeit/forecast.test.ts`
Expected: PASS (4 Fälle).

- [ ] **Step 5: Commit**

```bash
git add src/verfuegbarkeit/forecast.ts tests/verfuegbarkeit/forecast.test.ts
git commit -m "feat(verfuegbarkeit): Nachliefer-Prognose (Verbrauchsrate + Reichweite)"
```

---

### Task 5: Reihen-Queries & Prognose-Inputs (`history.ts`)

**Files:**
- Create: `src/verfuegbarkeit/history.ts`
- Modify: `src/verfuegbarkeit/types.ts` (neue Typen anhängen)
- Test: `tests/verfuegbarkeit/history.test.ts`

**Interfaces:**
- Consumes: `pool` (`@/lib/db`); Tabellen `stock_snapshots`, `sales_order_lines`, `sales_orders`, `stock_levels`, `product_variants`, `products`.
- Produces (in `types.ts`):
  - `interface SeriesPoint { date: string; value: number }`
  - `interface VariantForecastInput { variantId: string; sku: string; productName: string; onHand: number; reorderPoint: number; unitsInWindow: number }`
- Produces (in `history.ts`):
  - `stockSeries(variantId: string, days: number): Promise<SeriesPoint[]>` — Bestand/Tag aus `stock_snapshots` (Summe über Lager).
  - `salesSeries(variantId: string, days: number): Promise<SeriesPoint[]>` — verkaufte Stück/Tag aus `sales_order_lines`.
  - `stockSeriesByCategory(category: string, days: number): Promise<SeriesPoint[]>`
  - `salesSeriesByCategory(category: string, days: number): Promise<SeriesPoint[]>`
  - `getVariantForecastInput(variantId: string): Promise<VariantForecastInput | null>` — onHand (Summe `stock_levels`), reorderPoint, verkaufte Stück in `CONSUMPTION_WINDOW_DAYS`.

- [ ] **Step 1: Typen in `types.ts` anhängen**

```typescript
// ── Bestandsverlauf / Prognose ──
export interface SeriesPoint { date: string; value: number }
export interface VariantForecastInput {
  variantId: string; sku: string; productName: string;
  onHand: number; reorderPoint: number; unitsInWindow: number;
}
```

- [ ] **Step 2: Failing test schreiben**

```typescript
// tests/verfuegbarkeit/history.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';
import { stockSeries, salesSeries, getVariantForecastInput } from '../../src/verfuegbarkeit/history';

afterAll(async () => { await pool.end(); });

describe('history queries', () => {
  it('stockSeries liefert eine sortierte Datum→Menge-Reihe', async () => {
    const v = await pool.query(`SELECT variant_id FROM stock_snapshots LIMIT 1`);
    if (v.rows.length === 0) return; // keine Snapshots vorhanden → nichts zu prüfen
    const series = await stockSeries(v.rows[0].variant_id, 365);
    expect(Array.isArray(series)).toBe(true);
    for (const p of series) {
      expect(typeof p.date).toBe('string');
      expect(typeof p.value).toBe('number');
    }
    const dates = series.map((p) => p.date);
    expect([...dates]).toEqual([...dates].sort());
  });

  it('salesSeries + getVariantForecastInput geben Zahlen zurück', async () => {
    const v = await pool.query(`SELECT id FROM product_variants LIMIT 1`);
    const id = v.rows[0].id;
    const sales = await salesSeries(id, 90);
    expect(Array.isArray(sales)).toBe(true);
    const fi = await getVariantForecastInput(id);
    if (fi) {
      expect(typeof fi.onHand).toBe('number');
      expect(typeof fi.unitsInWindow).toBe('number');
      expect(typeof fi.reorderPoint).toBe('number');
    }
  });
});
```

- [ ] **Step 3: Test rot verifizieren**

Run: `npx vitest run tests/verfuegbarkeit/history.test.ts`
Expected: FAIL („Cannot find module '.../history'").

- [ ] **Step 4: `history.ts` implementieren**

```typescript
// src/verfuegbarkeit/history.ts
import { pool } from '@/lib/db';
import { CONSUMPTION_WINDOW_DAYS } from './forecast';
import type { SeriesPoint, VariantForecastInput } from './types';

const SALES_FILTER = `o.status NOT IN ('angebot','storniert')`;

export async function stockSeries(variantId: string, days: number): Promise<SeriesPoint[]> {
  const r = await pool.query(
    `SELECT snapshot_date::text AS date, SUM(quantity_on_hand)::int AS value
       FROM stock_snapshots
      WHERE variant_id = $1 AND snapshot_date >= CURRENT_DATE - $2::int
      GROUP BY snapshot_date ORDER BY snapshot_date`, [variantId, days]);
  return r.rows.map((x: { date: string; value: number }) => ({ date: x.date, value: Number(x.value) }));
}

export async function salesSeries(variantId: string, days: number): Promise<SeriesPoint[]> {
  const r = await pool.query(
    `SELECT COALESCE(o.placed_at, o.created_at)::date::text AS date, SUM(l.quantity)::int AS value
       FROM sales_order_lines l
       JOIN sales_orders o ON o.id = l.order_id
      WHERE l.variant_id = $1
        AND COALESCE(o.placed_at, o.created_at)::date >= CURRENT_DATE - $2::int
        AND ${SALES_FILTER}
      GROUP BY date ORDER BY date`, [variantId, days]);
  return r.rows.map((x: { date: string; value: number }) => ({ date: x.date, value: Number(x.value) }));
}

export async function stockSeriesByCategory(category: string, days: number): Promise<SeriesPoint[]> {
  const r = await pool.query(
    `SELECT s.snapshot_date::text AS date, SUM(s.quantity_on_hand)::int AS value
       FROM stock_snapshots s
       JOIN product_variants v ON v.id = s.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE p.category = $1 AND s.snapshot_date >= CURRENT_DATE - $2::int
      GROUP BY s.snapshot_date ORDER BY s.snapshot_date`, [category, days]);
  return r.rows.map((x: { date: string; value: number }) => ({ date: x.date, value: Number(x.value) }));
}

export async function salesSeriesByCategory(category: string, days: number): Promise<SeriesPoint[]> {
  const r = await pool.query(
    `SELECT COALESCE(o.placed_at, o.created_at)::date::text AS date, SUM(l.quantity)::int AS value
       FROM sales_order_lines l
       JOIN sales_orders o ON o.id = l.order_id
       JOIN product_variants v ON v.id = l.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE p.category = $1
        AND COALESCE(o.placed_at, o.created_at)::date >= CURRENT_DATE - $2::int
        AND ${SALES_FILTER}
      GROUP BY date ORDER BY date`, [category, days]);
  return r.rows.map((x: { date: string; value: number }) => ({ date: x.date, value: Number(x.value) }));
}

export async function getVariantForecastInput(variantId: string): Promise<VariantForecastInput | null> {
  const head = await pool.query(
    `SELECT v.sku, p.name AS product_name, v.reorder_point,
            COALESCE((SELECT SUM(quantity_on_hand) FROM stock_levels WHERE variant_id = v.id), 0)::int AS on_hand
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.id = $1`, [variantId]);
  if (head.rows.length === 0) return null;
  const units = await pool.query(
    `SELECT COALESCE(SUM(l.quantity), 0)::int AS units
       FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id
      WHERE l.variant_id = $1
        AND COALESCE(o.placed_at, o.created_at)::date >= CURRENT_DATE - $2::int
        AND ${SALES_FILTER}`, [variantId, CONSUMPTION_WINDOW_DAYS]);
  const h = head.rows[0];
  return {
    variantId, sku: h.sku, productName: h.product_name,
    onHand: Number(h.on_hand), reorderPoint: Number(h.reorder_point ?? 0),
    unitsInWindow: Number(units.rows[0].units),
  };
}
```

- [ ] **Step 5: Test grün verifizieren**

Run: `npx vitest run tests/verfuegbarkeit/history.test.ts`
Expected: PASS. (Bei fehlender lokaler DB auf dem VPS ausführen.)

- [ ] **Step 6: Commit**

```bash
git add src/verfuegbarkeit/history.ts src/verfuegbarkeit/types.ts tests/verfuegbarkeit/history.test.ts
git commit -m "feat(verfuegbarkeit): Bestands-/Verkaufsreihen + Prognose-Inputs"
```

---

### Task 6: Kategorie-Rollup fürs Dashboard

**Files:**
- Modify: `src/verfuegbarkeit/history.ts` (Funktion `categoryRollup` anhängen)
- Modify: `src/verfuegbarkeit/types.ts` (`CategoryRollupRow` anhängen)
- Test: `tests/verfuegbarkeit/category-rollup.test.ts`

**Interfaces:**
- Produces:
  - `interface CategoryRollupRow { category: string; variantCount: number; gesamtbestand: number; anzahlUnterMeldebestand: number; anzahlKritisch: number }`
  - `categoryRollup(): Promise<CategoryRollupRow[]>` — je Kategorie: Anzahl Varianten, Gesamtbestand, Zahl unter Meldebestand, Zahl „kritisch" (Reichweite < `LEAD_TIME_DAYS`).

**Hinweis zur „kritisch"-Definition:** Reichweite `< 90` Tage bei 90-Tage-Fenster ⟺ `onHand < unitsIn90d`. Das lässt sich direkt in SQL auswerten (kein Rückgriff auf `computeForecast`).

- [ ] **Step 1: Typ anhängen**

In `src/verfuegbarkeit/types.ts`:

```typescript
export interface CategoryRollupRow {
  category: string; variantCount: number; gesamtbestand: number;
  anzahlUnterMeldebestand: number; anzahlKritisch: number;
}
```

- [ ] **Step 2: Failing test schreiben**

```typescript
// tests/verfuegbarkeit/category-rollup.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';
import { categoryRollup } from '../../src/verfuegbarkeit/history';

afterAll(async () => { await pool.end(); });

describe('categoryRollup', () => {
  it('liefert je Kategorie konsistente Aggregate', async () => {
    const rows = await categoryRollup();
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) {
      expect(typeof r.category).toBe('string');
      expect(r.variantCount).toBeGreaterThan(0);
      expect(r.gesamtbestand).toBeGreaterThanOrEqual(0);
      expect(r.anzahlUnterMeldebestand).toBeGreaterThanOrEqual(0);
      expect(r.anzahlKritisch).toBeLessThanOrEqual(r.variantCount);
    }
  });
});
```

- [ ] **Step 3: Test rot verifizieren**

Run: `npx vitest run tests/verfuegbarkeit/category-rollup.test.ts`
Expected: FAIL („categoryRollup is not a function").

- [ ] **Step 4: `categoryRollup` in `history.ts` anhängen**

```typescript
import type { SeriesPoint, VariantForecastInput, CategoryRollupRow } from './types';
// (bestehenden Import um CategoryRollupRow erweitern)

export async function categoryRollup(): Promise<CategoryRollupRow[]> {
  const r = await pool.query(
    `WITH sold AS (
       SELECT l.variant_id, SUM(l.quantity)::int AS units
         FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id
        WHERE COALESCE(o.placed_at, o.created_at)::date >= CURRENT_DATE - 90
          AND o.status NOT IN ('angebot','storniert')
        GROUP BY l.variant_id
     ),
     stock AS (
       SELECT variant_id, SUM(quantity_on_hand)::int AS on_hand
         FROM stock_levels GROUP BY variant_id
     )
     SELECT COALESCE(p.category, 'Ohne Kategorie') AS category,
            COUNT(*)::int AS variant_count,
            COALESCE(SUM(st.on_hand), 0)::int AS gesamtbestand,
            COUNT(*) FILTER (WHERE v.reorder_point > 0
                              AND COALESCE(st.on_hand, 0) < v.reorder_point)::int AS unter_meldebestand,
            COUNT(*) FILTER (WHERE COALESCE(sd.units, 0) > 0
                              AND COALESCE(st.on_hand, 0) < sd.units)::int AS kritisch
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN stock st ON st.variant_id = v.id
       LEFT JOIN sold sd ON sd.variant_id = v.id
      GROUP BY COALESCE(p.category, 'Ohne Kategorie')
      ORDER BY category`);
  return r.rows.map((x: {
    category: string; variant_count: number; gesamtbestand: number;
    unter_meldebestand: number; kritisch: number;
  }) => ({
    category: x.category, variantCount: Number(x.variant_count),
    gesamtbestand: Number(x.gesamtbestand),
    anzahlUnterMeldebestand: Number(x.unter_meldebestand),
    anzahlKritisch: Number(x.kritisch),
  }));
}
```

- [ ] **Step 5: Test grün verifizieren**

Run: `npx vitest run tests/verfuegbarkeit/category-rollup.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/verfuegbarkeit/history.ts src/verfuegbarkeit/types.ts tests/verfuegbarkeit/category-rollup.test.ts
git commit -m "feat(verfuegbarkeit): Kategorie-Rollup mit Reorder-/Kritisch-Zählern"
```

---

### Task 7: Bestandsliste nach `/verfügbarkeit/liste` verschieben + Sidebar

**Files:**
- Create: `src/app/(shell)/verfuegbarkeit/liste/page.tsx` (bisheriger Listen-Inhalt)
- Modify: `src/components/VerfuegbarkeitSidebar.tsx` (Nav-Einträge + Active-Logik)
- Modify: `src/app/(shell)/verfuegbarkeit/page.tsx` (wird in Task 8 zum Dashboard; hier zunächst nur Platzhalter, der auf die Liste verweist — in Task 8 ersetzt)

**Interfaces:**
- Produces: Route `/verfuegbarkeit/liste` mit der vollständigen Bestandsliste (`BestandListe`).

**Hinweis:** Reine Verschiebung — die Listenlogik (`listStockPaged` + `BestandListe`) bleibt unverändert, nur der Pfad ändert sich. Das Dashboard selbst kommt in Task 8.

- [ ] **Step 1: Listen-Seite anlegen**

Inhalt aus dem bisherigen `verfuegbarkeit/page.tsx` 1:1 nach `verfuegbarkeit/liste/page.tsx` übernehmen (Funktion in `BestandListePage` umbenennen, Import-Pfade bleiben `@/`-absolut, daher unverändert):

```tsx
// src/app/(shell)/verfuegbarkeit/liste/page.tsx
import { listStockPaged } from '@/verfuegbarkeit/repository';
import { BestandListe } from '@/components/BestandListe';

export const dynamic = 'force-dynamic';
const PAGE_SIZE = 50;

export default async function BestandListePage(
  { searchParams }: { searchParams: { q?: string; filter?: string; sort?: string; page?: string } },
) {
  const search = searchParams.q?.trim() || '';
  const filter = searchParams.filter === 'below' ? 'below' : 'all';
  const page = Math.max(1, Number(searchParams.page) || 1);
  const { rows, total } = await listStockPaged({
    search, filter, sort: searchParams.sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Bestandsliste</h2>
      <BestandListe rows={rows} total={total} page={page} pageSize={PAGE_SIZE} search={search} filter={filter} />
    </div>
  );
}
```

- [ ] **Step 2: Sidebar-Navigation aktualisieren**

In `src/components/VerfuegbarkeitSidebar.tsx` die `ITEMS`-Liste und die Active-Logik anpassen, sodass „Übersicht" (Dashboard) auf `/verfuegbarkeit` und „Bestandsliste" auf `/verfuegbarkeit/liste` zeigt:

```tsx
const ITEMS = [
  { href: '/verfuegbarkeit', label: 'Übersicht' },
  { href: '/verfuegbarkeit/liste', label: 'Bestandsliste' },
  { href: '/verfuegbarkeit/wareneingang', label: 'Wareneingang' },
  { href: '/verfuegbarkeit/meldebestand', label: 'Meldebestand' },
];
```

Und die Active-Berechnung ersetzen (die alte Sonderlogik für `/verfuegbarkeit` entfernen, da „Übersicht" jetzt nur die exakte Route ist; Artikel-/Kategorie-Detailseiten liegen unter eigenen Pfaden):

```tsx
const active = it.href === '/verfuegbarkeit'
  ? pathname === '/verfuegbarkeit'
  : pathname === it.href || pathname.startsWith(it.href + '/');
```

- [ ] **Step 3: Verifizieren (VPS)**

Deploy auf dem VPS, dann im Browser `/verfuegbarkeit/liste` öffnen: die vollständige Bestandsliste erscheint, Suche/Filter/Pagination funktionieren. Sidebar zeigt „Übersicht" + „Bestandsliste".

- [ ] **Step 4: Commit**

```bash
git add "src/app/(shell)/verfuegbarkeit/liste/page.tsx" src/components/VerfuegbarkeitSidebar.tsx
git commit -m "refactor(verfuegbarkeit): Bestandsliste nach /liste, Sidebar um Übersicht ergänzt"
```

---

### Task 8: Dashboard-Übersicht (`/verfügbarkeit`)

**Files:**
- Create: `src/components/VerfuegbarkeitDashboard.tsx` (Client-Komponente: KPI-Zeile + Kategorie-Tabelle)
- Modify: `src/app/(shell)/verfuegbarkeit/page.tsx` (Server-Seite: lädt Rollup + KPIs)
- Test: `tests/verfuegbarkeit/dashboard-kpis.test.ts`

**Interfaces:**
- Consumes: `categoryRollup()` (Task 6); `KpiCard` aus `@/components/KpiCard`.
- Produces:
  - `dashboardKpis(): Promise<{ gesamtbestand: number; unterMeldebestand: number; kritisch: number }>` in `src/verfuegbarkeit/history.ts` (Summe über Rollup).
  - Dashboard-UI unter `/verfuegbarkeit`.

- [ ] **Step 1: Failing test für `dashboardKpis`**

```typescript
// tests/verfuegbarkeit/dashboard-kpis.test.ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';
import { dashboardKpis, categoryRollup } from '../../src/verfuegbarkeit/history';

afterAll(async () => { await pool.end(); });

describe('dashboardKpis', () => {
  it('summiert die Rollup-Zeilen konsistent', async () => {
    const [kpis, rollup] = await Promise.all([dashboardKpis(), categoryRollup()]);
    const sum = rollup.reduce((a, r) => ({
      bestand: a.bestand + r.gesamtbestand,
      unter: a.unter + r.anzahlUnterMeldebestand,
      kritisch: a.kritisch + r.anzahlKritisch,
    }), { bestand: 0, unter: 0, kritisch: 0 });
    expect(kpis.gesamtbestand).toBe(sum.bestand);
    expect(kpis.unterMeldebestand).toBe(sum.unter);
    expect(kpis.kritisch).toBe(sum.kritisch);
  });
});
```

- [ ] **Step 2: Test rot verifizieren**

Run: `npx vitest run tests/verfuegbarkeit/dashboard-kpis.test.ts`
Expected: FAIL („dashboardKpis is not a function").

- [ ] **Step 3: `dashboardKpis` in `history.ts` anhängen**

```typescript
export async function dashboardKpis(): Promise<{
  gesamtbestand: number; unterMeldebestand: number; kritisch: number;
}> {
  const rows = await categoryRollup();
  return rows.reduce((a, r) => ({
    gesamtbestand: a.gesamtbestand + r.gesamtbestand,
    unterMeldebestand: a.unterMeldebestand + r.anzahlUnterMeldebestand,
    kritisch: a.kritisch + r.anzahlKritisch,
  }), { gesamtbestand: 0, unterMeldebestand: 0, kritisch: 0 });
}
```

- [ ] **Step 4: Test grün verifizieren**

Run: `npx vitest run tests/verfuegbarkeit/dashboard-kpis.test.ts`
Expected: PASS.

- [ ] **Step 5: Dashboard-Komponente schreiben**

```tsx
// src/components/VerfuegbarkeitDashboard.tsx
'use client';
import Link from 'next/link';
import { KpiCard } from '@/components/KpiCard';
import { num } from '@/components/charts/chart-style';
import type { CategoryRollupRow } from '@/verfuegbarkeit/types';

export function VerfuegbarkeitDashboard({ kpis, rollup }: {
  kpis: { gesamtbestand: number; unterMeldebestand: number; kritisch: number };
  rollup: CategoryRollupRow[];
}) {
  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Übersicht</h2>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label="Gesamtbestand" value={num(kpis.gesamtbestand)} />
        <KpiCard label="Unter Meldebestand" value={num(kpis.unterMeldebestand)} />
        <KpiCard label="Reichweite < 90 Tage" value={num(kpis.kritisch)} />
      </div>

      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
              <th className="px-4 py-2 font-medium">Kategorie</th>
              <th className="px-4 py-2 text-right font-medium">Artikel</th>
              <th className="px-4 py-2 text-right font-medium">Bestand</th>
              <th className="px-4 py-2 text-right font-medium">Unter Meldebestand</th>
              <th className="px-4 py-2 text-right font-medium">Kritisch (&lt; 90 T)</th>
            </tr>
          </thead>
          <tbody>
            {rollup.map((r) => (
              <tr key={r.category} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                <td className="px-4 py-2">
                  <Link href={`/verfuegbarkeit/kategorie/${encodeURIComponent(r.category)}`}
                        className="text-brand hover:text-brand-dark">{r.category}</Link>
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{num(r.variantCount)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{num(r.gesamtbestand)}</td>
                <td className="px-4 py-2 text-right tabular-nums">{num(r.anzahlUnterMeldebestand)}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${r.anzahlKritisch > 0 ? 'font-semibold text-brand' : ''}`}>
                  {num(r.anzahlKritisch)}
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

**Hinweis:** Prüfe die tatsächliche Prop-Signatur von `KpiCard` in `src/components/KpiCard.tsx` und passe `label`/`value` an, falls sie anders heißen (z.B. `title`/`metric`).

- [ ] **Step 6: Dashboard-Seite verdrahten**

```tsx
// src/app/(shell)/verfuegbarkeit/page.tsx
import { categoryRollup, dashboardKpis } from '@/verfuegbarkeit/history';
import { VerfuegbarkeitDashboard } from '@/components/VerfuegbarkeitDashboard';

export const dynamic = 'force-dynamic';

export default async function VerfuegbarkeitUebersichtPage() {
  const [kpis, rollup] = await Promise.all([dashboardKpis(), categoryRollup()]);
  return <VerfuegbarkeitDashboard kpis={kpis} rollup={rollup} />;
}
```

- [ ] **Step 7: Verifizieren (VPS + Browser)**

Deploy auf dem VPS. `/verfuegbarkeit` öffnen: KPI-Zeile (Gesamtbestand, Unter Meldebestand, Reichweite < 90 Tage) + Kategorie-Tabelle mit klickbaren Kategorien. Dark-Mode prüfen (warme Neutraltöne, Akzent via `text-brand`). Selbst im Browser durchklicken.

- [ ] **Step 8: Commit**

```bash
git add "src/app/(shell)/verfuegbarkeit/page.tsx" src/components/VerfuegbarkeitDashboard.tsx src/verfuegbarkeit/history.ts tests/verfuegbarkeit/dashboard-kpis.test.ts
git commit -m "feat(verfuegbarkeit): Dashboard-Übersicht mit KPIs + Kategorie-Tabelle"
```

---

### Task 9: Artikel-Detail — Kurven + Prognosekachel

**Files:**
- Create: `src/components/StockSalesChart.tsx` (Client: Bestands-Linie + Verkaufs-Balken)
- Create: `src/components/ForecastTile.tsx` (Client: Prognosekachel)
- Modify: `src/app/(shell)/verfuegbarkeit/[variantId]/page.tsx` (Reihen + Prognose laden, an `BestandDetail` übergeben)
- Modify: `src/components/BestandDetail.tsx` (Charts + Kachel einbetten)

**Interfaces:**
- Consumes: `stockSeries`, `salesSeries`, `getVariantForecastInput` (Task 5); `computeForecast` (Task 4); `SeriesPoint`, `Forecast` (Typen); Chart-Primitive `ChartCard`, `chart-style`.
- Produces: erweiterte `BestandDetail`-Props um `stock: SeriesPoint[]`, `sales: SeriesPoint[]`, `forecast: Forecast | null`.

- [ ] **Step 1: Kombichart-Komponente schreiben**

```tsx
// src/components/StockSalesChart.tsx
'use client';
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, MUTED, TICK, TOOLTIP_LABEL_STYLE, num } from '@/components/charts/chart-style';
import type { SeriesPoint } from '@/verfuegbarkeit/types';

// Bestands- und Verkaufsreihe auf gemeinsamer Zeitachse zusammenführen.
function merge(stock: SeriesPoint[], sales: SeriesPoint[]) {
  const byDate = new Map<string, { date: string; Bestand?: number; Verkauf?: number }>();
  for (const p of stock) byDate.set(p.date, { date: p.date, Bestand: p.value });
  for (const p of sales) {
    const row = byDate.get(p.date) ?? { date: p.date };
    row.Verkauf = p.value; byDate.set(p.date, row);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function StockSalesChart({ stock, sales }: { stock: SeriesPoint[]; sales: SeriesPoint[] }) {
  const data = merge(stock, sales);
  if (data.length === 0) {
    return (
      <ChartCard title="Bestands- & Verkaufsverlauf">
        <p className="mt-3 text-sm text-neutral-500">
          Noch keine Verlaufsdaten. Die Bestandskurve beginnt mit dem ersten täglichen Snapshot.
        </p>
      </ChartCard>
    );
  }
  return (
    <ChartCard title="Bestands- & Verkaufsverlauf">
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e7e2d9" vertical={false} />
            <XAxis dataKey="date" tick={TICK} minTickGap={24} />
            <YAxis tick={TICK} width={48} tickFormatter={(n) => num(Number(n))} />
            <Tooltip formatter={(v, n) => [num(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend />
            <Bar dataKey="Verkauf" fill={MUTED} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line dataKey="Bestand" stroke={BRAND} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
```

- [ ] **Step 2: Prognosekachel schreiben**

```tsx
// src/components/ForecastTile.tsx
'use client';
import { ChartCard } from '@/components/charts/ChartCard';
import { num } from '@/components/charts/chart-style';
import type { Forecast } from '@/verfuegbarkeit/forecast';

export function ForecastTile({ forecast }: { forecast: Forecast | null }) {
  if (!forecast) {
    return <ChartCard title="Nachliefer-Prognose">
      <p className="mt-3 text-sm text-neutral-500">Keine Prognose verfügbar.</p></ChartCard>;
  }
  const { avgDailyConsumption, reichweiteTage, leerAmDatum, sollBestellen, bestellvorschlag } = forecast;
  const reichweiteLabel = reichweiteTage === null ? 'kein Verbrauch'
    : `${num(Math.round(reichweiteTage))} Tage`;
  return (
    <ChartCard title="Nachliefer-Prognose">
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="anno text-neutral-500">Ø Verbrauch/Tag</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{num(Math.round(avgDailyConsumption * 10) / 10)}</dd></div>
        <div><dt className="anno text-neutral-500">Reichweite</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{reichweiteLabel}</dd></div>
        <div><dt className="anno text-neutral-500">Voraussichtlich leer</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{leerAmDatum ?? '—'}</dd></div>
        <div><dt className="anno text-neutral-500">Bestellvorschlag</dt>
          <dd className={sollBestellen ? 'font-semibold text-brand' : 'text-neutral-900 dark:text-neutral-100'}>
            {sollBestellen ? `${num(bestellvorschlag)} Stück bestellen` : '—'}</dd></div>
      </dl>
      {sollBestellen && (
        <p className="mt-3 text-xs text-neutral-500">
          Reichweite unter 90 Tagen — bei Übersee-Lieferzeit jetzt nachbestellen.
        </p>
      )}
    </ChartCard>
  );
}
```

- [ ] **Step 3: Detail-Seite Daten laden**

```tsx
// src/app/(shell)/verfuegbarkeit/[variantId]/page.tsx
import { notFound } from 'next/navigation';
import { getVariantStock, listWarehouses } from '@/verfuegbarkeit/repository';
import { stockSeries, salesSeries, getVariantForecastInput } from '@/verfuegbarkeit/history';
import { computeForecast, type Forecast } from '@/verfuegbarkeit/forecast';
import { BestandDetail } from '@/components/BestandDetail';

export const dynamic = 'force-dynamic';

export default async function VariantStockPage({ params }: { params: { variantId: string } }) {
  const detail = await getVariantStock(params.variantId);
  if (!detail) notFound();
  const [warehouses, stock, sales, fi] = await Promise.all([
    listWarehouses(),
    stockSeries(params.variantId, 365),
    salesSeries(params.variantId, 365),
    getVariantForecastInput(params.variantId),
  ]);
  const forecast: Forecast | null = fi
    ? computeForecast({ onHand: fi.onHand, reorderPoint: fi.reorderPoint, unitsInWindow: fi.unitsInWindow, windowDays: 90 }, new Date())
    : null;
  return <BestandDetail detail={detail} warehouses={warehouses} stock={stock} sales={sales} forecast={forecast} />;
}
```

- [ ] **Step 4: `BestandDetail` erweitern**

In `src/components/BestandDetail.tsx`:
1. Imports ergänzen:

```tsx
import { StockSalesChart } from '@/components/StockSalesChart';
import { ForecastTile } from '@/components/ForecastTile';
import type { SeriesPoint } from '@/verfuegbarkeit/types';
import type { Forecast } from '@/verfuegbarkeit/forecast';
```

2. Props erweitern:

```tsx
export function BestandDetail({ detail, warehouses, stock, sales, forecast }: {
  detail: VariantStockDetail; warehouses: WarehouseOption[];
  stock: SeriesPoint[]; sales: SeriesPoint[]; forecast: Forecast | null;
}) {
```

3. Direkt nach dem Kopf-`<div>` (Zeile mit `Meldebestand …`) und vor dem bestehenden Bestands-/Korrektur-Bereich einfügen:

```tsx
<div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
  <div className="lg:col-span-2"><StockSalesChart stock={stock} sales={sales} /></div>
  <ForecastTile forecast={forecast} />
</div>
```

- [ ] **Step 5: Typecheck + bestehende Tests**

Run: `npx tsc --noEmit && npx vitest run tests/verfuegbarkeit`
Expected: keine Typfehler; vorhandene Verfügbarkeit-Tests grün.

- [ ] **Step 6: Verifizieren (VPS + Browser)**

Deploy auf dem VPS. Eine Artikel-Detailseite `/verfuegbarkeit/<variantId>` öffnen (Link aus der Bestandsliste): Kombichart (Bestandslinie + Verkaufsbalken) + Prognosekachel erscheinen; bei fehlender Historie der Leerzustand-Hinweis. Dark-Mode + Akzentfarbe prüfen. Selbst durchklicken.

- [ ] **Step 7: Commit**

```bash
git add src/components/StockSalesChart.tsx src/components/ForecastTile.tsx src/components/BestandDetail.tsx "src/app/(shell)/verfuegbarkeit/[variantId]/page.tsx"
git commit -m "feat(verfuegbarkeit): Artikel-Detail mit Bestands-/Verkaufskurve + Prognosekachel"
```

---

### Task 10: Kategorie-Detailseite

**Files:**
- Create: `src/app/(shell)/verfuegbarkeit/kategorie/[category]/page.tsx`
- Create: `src/components/KategorieDetail.tsx` (Client: aggregierte Kurve + Artikel-Liste mit Reorder-Status)
- Modify: `src/verfuegbarkeit/history.ts` (`listCategoryVariants` anhängen)
- Modify: `src/verfuegbarkeit/types.ts` (`CategoryVariantRow` anhängen)

**Interfaces:**
- Consumes: `stockSeriesByCategory`, `salesSeriesByCategory` (Task 5); `StockSalesChart` (Task 9).
- Produces:
  - `interface CategoryVariantRow { variantId: string; sku: string; productName: string; onHand: number; reorderPoint: number; belowReorder: boolean }`
  - `listCategoryVariants(category: string): Promise<CategoryVariantRow[]>`
  - Route `/verfuegbarkeit/kategorie/[category]`.

- [ ] **Step 1: Typ anhängen**

In `src/verfuegbarkeit/types.ts`:

```typescript
export interface CategoryVariantRow {
  variantId: string; sku: string; productName: string;
  onHand: number; reorderPoint: number; belowReorder: boolean;
}
```

- [ ] **Step 2: `listCategoryVariants` in `history.ts` anhängen**

```typescript
import type { SeriesPoint, VariantForecastInput, CategoryRollupRow, CategoryVariantRow } from './types';
// (Import um CategoryVariantRow erweitern)

export async function listCategoryVariants(category: string): Promise<CategoryVariantRow[]> {
  const r = await pool.query(
    `SELECT v.id AS variant_id, v.sku, p.name AS product_name, v.reorder_point,
            COALESCE((SELECT SUM(quantity_on_hand) FROM stock_levels WHERE variant_id = v.id), 0)::int AS on_hand
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE COALESCE(p.category, 'Ohne Kategorie') = $1
      ORDER BY p.name, v.sku`, [category]);
  return r.rows.map((x: {
    variant_id: string; sku: string; product_name: string; reorder_point: number; on_hand: number;
  }) => ({
    variantId: x.variant_id, sku: x.sku, productName: x.product_name,
    onHand: Number(x.on_hand), reorderPoint: Number(x.reorder_point ?? 0),
    belowReorder: Number(x.reorder_point ?? 0) > 0 && Number(x.on_hand) < Number(x.reorder_point),
  }));
}
```

- [ ] **Step 3: Kategorie-Detail-Komponente schreiben**

```tsx
// src/components/KategorieDetail.tsx
'use client';
import Link from 'next/link';
import { StockSalesChart } from '@/components/StockSalesChart';
import { num } from '@/components/charts/chart-style';
import type { SeriesPoint, CategoryVariantRow } from '@/verfuegbarkeit/types';

export function KategorieDetail({ category, stock, sales, variants }: {
  category: string; stock: SeriesPoint[]; sales: SeriesPoint[]; variants: CategoryVariantRow[];
}) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/verfuegbarkeit" className="text-brand hover:text-brand-dark">← Übersicht</Link>
        <h2 className="text-xl font-bold tracking-tight">{category}</h2>
      </div>
      <StockSalesChart stock={stock} sales={sales} />
      <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
              <th className="px-4 py-2 font-medium">SKU</th>
              <th className="px-4 py-2 font-medium">Artikel</th>
              <th className="px-4 py-2 text-right font-medium">Bestand</th>
              <th className="px-4 py-2 text-right font-medium">Meldebestand</th>
            </tr>
          </thead>
          <tbody>
            {variants.map((v) => (
              <tr key={v.variantId} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
                <td className="px-4 py-2">
                  <Link href={`/verfuegbarkeit/${v.variantId}`} className="text-brand hover:text-brand-dark">{v.sku}</Link>
                </td>
                <td className="px-4 py-2">{v.productName}</td>
                <td className={`px-4 py-2 text-right tabular-nums ${v.belowReorder ? 'font-semibold text-brand' : ''}`}>
                  {num(v.onHand)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">{v.reorderPoint > 0 ? num(v.reorderPoint) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Kategorie-Seite verdrahten**

```tsx
// src/app/(shell)/verfuegbarkeit/kategorie/[category]/page.tsx
import { stockSeriesByCategory, salesSeriesByCategory, listCategoryVariants } from '@/verfuegbarkeit/history';
import { KategorieDetail } from '@/components/KategorieDetail';

export const dynamic = 'force-dynamic';

export default async function KategoriePage({ params }: { params: { category: string } }) {
  const category = decodeURIComponent(params.category);
  const [stock, sales, variants] = await Promise.all([
    stockSeriesByCategory(category, 365),
    salesSeriesByCategory(category, 365),
    listCategoryVariants(category),
  ]);
  return <KategorieDetail category={category} stock={stock} sales={sales} variants={variants} />;
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Typfehler.

- [ ] **Step 6: Verifizieren (VPS + Browser)**

Deploy auf dem VPS. Von `/verfuegbarkeit` eine Kategorie anklicken: aggregierte Bestands-/Verkaufskurve + Artikel-Liste; SKU-Links führen zur Artikel-Detailseite. Zurück-Link zur Übersicht funktioniert. Dark-Mode prüfen.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(shell)/verfuegbarkeit/kategorie/[category]/page.tsx" src/components/KategorieDetail.tsx src/verfuegbarkeit/history.ts src/verfuegbarkeit/types.ts
git commit -m "feat(verfuegbarkeit): Kategorie-Detailseite mit aggregierter Kurve + Artikelliste"
```

---

### Task 11: Hilfe-Dokumentation

**Files:**
- Modify: `src/lib/help/content.ts` (Datenmodell-Seite + Verfügbarkeit-Modulhilfe)
- Test: `npx vitest run tests/lib/help-content.test.ts` (bestehender Registry-Test)

**Interfaces:**
- Consumes: bestehende Struktur in `src/lib/help/content.ts` (Seiten-Einträge). Vor dem Schreiben die dortige Datenstruktur lesen und dem exakten Muster folgen.

- [ ] **Step 1: Datenmodell-Seite ergänzen**

In `src/lib/help/content.ts` die Datenmodell-Hilfeseite um die Tabelle `stock_snapshots` erweitern (Format exakt an die bestehenden Tabellenbeschreibungen angleichen). Inhaltlich: „`stock_snapshots` — täglicher Bestands-Snapshot je Variante/Lager (`snapshot_date`, `quantity_on_hand`, `quantity_reserved`). Append-only; Quelle für den Bestandsverlauf, da WooCommerce keine Bestandshistorie liefert. Befüllt vom täglichen Job `npm run snapshot:stock`."

- [ ] **Step 2: Verfügbarkeit-Modulhilfe ergänzen**

Den Verfügbarkeit-Hilfetext um das neue Dashboard erweitern: Übersicht mit KPIs (Gesamtbestand, unter Meldebestand, Reichweite < 90 Tage) und Kategorie-Tabelle; Artikel-Detail mit Bestands-/Verkaufskurve und Nachliefer-Prognose (Ø-Verbrauch über 90 Tage, Reichweite, voraussichtliches Leerdatum, Bestellvorschlag ab Reichweite < 90 Tagen wegen Übersee-Lieferzeit); Kategorie-Detail mit aggregierter Kurve. Erwähnen, dass die Bestandskurve erst ab dem ersten Snapshot Daten zeigt.

- [ ] **Step 3: Registry-Test grün**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (jede App hat weiterhin eine Hilfeseite; keine Strukturverletzung).

- [ ] **Step 4: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(hilfe): Bestandsverlauf, Prognose & stock_snapshots dokumentiert"
```

---

### Task 12: Kategorie aus WooCommerce importieren (`products.category`)

**Kontext:** Reines Backend, unabhängig von Tasks 6/8/10 (die behandeln fehlende Kategorie als „Ohne Kategorie" und funktionieren auch ohne diesen Task). Ziel: WooCommerce-Produkte tragen künftig ihre primäre Kategorie, damit die Kategorie-Dimension des Dashboards echte Werte zeigt. Umsetzung von Spec-Abschnitt 1d.

**Files:**
- Modify: `src/woocommerce/catalog-import.ts` (Helper + `importWooCommerceProducts`)
- Test: `tests/woocommerce/catalog-category.test.ts` (Create)

**Interfaces:**
- Consumes: bestehende `importWooCommerceProducts(pool, rawProducts, priceListId)`.
- Produces: `primaryWooCategory(raw: Record<string, unknown>): string | null` — erste Woo-Kategorie (`categories[0].name`) oder `null`.

**Regeln (Spec 1d):** Primär-Kategorie = `categories[0].name`; leer/fehlt → `NULL`. Manuell gepflegten `products.category`-Wert **nicht** überschreiben (nur `NULL` füllen) — via `COALESCE(category, $neu)`.

- [ ] **Step 1: Failing test für `primaryWooCategory`**

```typescript
// tests/woocommerce/catalog-category.test.ts
import { describe, it, expect } from 'vitest';
import { primaryWooCategory } from '../../src/woocommerce/catalog-import';

describe('primaryWooCategory', () => {
  it('nimmt die erste Woo-Kategorie', () => {
    expect(primaryWooCategory({ categories: [{ id: 1, name: 'Spielzeug' }, { id: 2, name: 'Sale' }] }))
      .toBe('Spielzeug');
  });
  it('liefert null bei leerer/fehlender Kategorie', () => {
    expect(primaryWooCategory({ categories: [] })).toBeNull();
    expect(primaryWooCategory({})).toBeNull();
    expect(primaryWooCategory({ categories: [{ id: 1, name: '  ' }] })).toBeNull();
  });
});
```

- [ ] **Step 2: Test rot verifizieren**

Run: `npx vitest run tests/woocommerce/catalog-category.test.ts`
Expected: FAIL („primaryWooCategory is not exported / not a function").

- [ ] **Step 3: Helper + Import-Mapping implementieren**

In `src/woocommerce/catalog-import.ts` den Helper ergänzen (nahe `mapProduct`):

```typescript
/** Primäre Kategorie eines Woo-Produkts (erste in categories[]) oder null. */
export function primaryWooCategory(raw: Record<string, unknown>): string | null {
  const cats = raw.categories;
  if (!Array.isArray(cats) || cats.length === 0) return null;
  const first = cats[0] as { name?: unknown };
  const name = typeof first?.name === 'string' ? first.name.trim() : '';
  return name || null;
}
```

In `importWooCommerceProducts`, direkt nach `const payload = JSON.stringify(raw);` die Kategorie bestimmen:

```typescript
      const category = primaryWooCategory(raw);
```

Und **nach** dem `if/else`, das `variantId` setzt, aber **vor** dem `INSERT INTO external_references`, die Kategorie kollisionssicher füllen (überschreibt manuell gepflegte Werte nicht):

```typescript
      await c.query(
        `UPDATE products SET category = COALESCE(category, $2)
           WHERE id = (SELECT product_id FROM product_variants WHERE id = $1)`,
        [variantId, category]);
```

- [ ] **Step 4: Test grün verifizieren**

Run: `npx vitest run tests/woocommerce/catalog-category.test.ts`
Expected: PASS (beide Fälle).

- [ ] **Step 5: „Nicht überschreiben"-Regel gegen die Test-DB prüfen**

Kurzer Integrationsbeleg (Test-DB `bryx_kosten_test`, nach `set -a; source .env; set +a` + DATABASE_URL-Override): ein Produkt mit manuell gesetzter `category` behält diese nach einem `importWooCommerceProducts`-Lauf mit abweichender Woo-Kategorie; ein Produkt mit `category = NULL` wird gefüllt. Als `node -e`/`tsx`-Skript oder Vitest-DB-Test ausführbar; Ergebnis im Report festhalten. (Falls lokal keine DB erreichbar: auf dem VPS.)

- [ ] **Step 6: Typecheck**

Run: `set -a; source .env; set +a; npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 7: Commit**

```bash
git add src/woocommerce/catalog-import.ts tests/woocommerce/catalog-category.test.ts
git commit -m "feat(verfuegbarkeit): products.category aus WooCommerce befüllen (nicht überschreiben)"
```

---

### Task 13: Gesamtverifikation & Branch-Abschluss

**Files:** keine (Verifikation)

- [ ] **Step 1: Volle Test-Suite lokal**

Run: `npx vitest run`
Expected: grün, abgesehen von den bekannten, erwarteten Ausfällen (`tests/db/rls.test.ts` auf diesem Host; ggf. DB-abhängige Verfügbarkeit-Tests, falls lokal keine DB — dann auf dem VPS ausführen).

- [ ] **Step 2: Typecheck + Lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: keine Fehler.

- [ ] **Step 3: Deploy auf dem VPS + Daten befüllen**

Auf dem VPS deployen (bestehender Deploy-Weg des Projekts). Dann:
1. `npm run import:woocommerce-catalog` — befüllt `products.category` (Task 12) für die Kategorie-Dimension.
2. `npm run snapshot:stock` — zieht Live-Bestand + schreibt mindestens einen Snapshot, damit die Bestandskurve Daten hat.

- [ ] **Step 4: End-to-End im Browser (VPS)**

Durchklicken und beobachten: `/verfuegbarkeit` (KPIs + Kategorien mit echten Kategorienamen) → Kategorie → Artikel-Detail (beide Kurven + Prognose) → `/verfuegbarkeit/liste` (Liste unverändert). Reichweite-/Bestellvorschlag-Werte auf Plausibilität prüfen. Dark-Mode auf jeder Seite.

- [ ] **Step 5: Branch abschließen**

Finishing-a-development-branch-Skill nutzen (PR gegen `main`, kein Direkt-Push).

---

## Self-Review (Plan gegen Spec)

- **Bestandsverlauf ab jetzt snapshotten:** Tasks 1–3 (Tabelle, Woo-Refresh, Tages-Job + Cron). ✓
- **Verkaufskurve je Artikel/Kategorie:** Task 5 (`salesSeries`, `salesSeriesByCategory`), dargestellt in Tasks 9/10. ✓
- **Nachliefer-Prognose (Verbrauchsrate + Reichweite, 90 Tage, Alert < 90 Tage):** Task 4 (`computeForecast`), Inputs Task 5, UI Task 9. ✓
- **Dashboard unter /verfügbarkeit (nicht nur Liste):** Tasks 7 (Liste → /liste), 8 (Übersicht), 10 (Kategorie). ✓
- **Artikel- + Kategorie-Ebene:** Tasks 9 + 10. ✓
- **ERP-Designsystem, Dark-Mode, Recharts-Primitive:** in allen UI-Tasks referenziert. ✓
- **Kategorie-Befüllung aus WooCommerce (Spec 1d, `products.category`):** Task 12 (`primaryWooCategory` + COALESCE-Fill, manuelle Werte geschützt). ✓
- **Hilfe-Doku (Datenmodell + Modul):** Task 11. ✓
- **VPS-Deploy, kein lokaler Lauf; Vitest lokal:** Global Constraints + Verifikationsschritte. ✓
- **YAGNI-Ausschlüsse (keine Rekonstruktion, kein Trendmodell, keine Multi-Lager-Prognose):** eingehalten — Prognose nutzt Gesamt-`onHand` je Variante. ✓
- **Typkonsistenz:** `SeriesPoint`, `Forecast`/`ForecastInput`, `CategoryRollupRow`, `CategoryVariantRow`, `VariantForecastInput` einheitlich über Tasks 4–10 verwendet; `computeForecast(input, today)`-Signatur in Task 4 definiert und in Task 9 so aufgerufen. ✓

**Offene Prüfpunkte für den Umsetzer (kein Blocker, im Task vermerkt):**
- `KpiCard`-Prop-Namen in Task 8 gegen die reale Komponente abgleichen.
- RLS-Policy-Ausdruck in Task 1 aus der Nachbartabelle `stock_adjustments` übernehmen.
- Genaue Struktur der Hilfe-Einträge in Task 11 vor dem Schreiben lesen.
