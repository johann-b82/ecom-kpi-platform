# Meldebestand: nicht-bestandsgeführte Produkte ausschließen — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Virtuelle / nicht-bestandsgeführte WooCommerce-Produkte (Geschenkgutscheine u. ä.) tauchen nicht mehr in *Verfügbarkeit · Meldebestand* auf und zählen nicht zur „kritisch"-KPI.

**Architecture:** Ein abgeleitetes Boolean `product_variants.is_stock_managed` wird beim Katalog-Import gesetzt und einmalig aus vorhandenem `external_references.raw_payload` backfilled. Das *kritisch*-/Nachbestell-Kriterium in Liste und KPI-Rollup gated auf dieses Flag.

**Tech Stack:** TypeScript, PostgreSQL (self-hosted Supabase, dev/test auf diesem Host), Vitest, `pg`, `tsx`.

## Global Constraints

- Ausschlussregel: Variante **nicht** bestandsgeführt, wenn **irgendeine** ihrer Woo-Refs `virtual = true` **oder** `manage_stock = false` ist. Werte `manage_stock = "parent"` und `= true` gelten als bestandsgeführt.
- `isStockManaged(raw)` muss JSON-Boolean **und** String-Form behandeln (`virtual: true` kommt als Boolean, `manage_stock: "parent"` als String).
- Import setzt das Flag **AND-akkumulierend** (nie von `false` zurück auf `true`). Autoritative Neuberechnung ist der Backfill.
- Query-Gate an **beiden** Stellen (`listReorderSuggestions` **und** `categoryRollup`-kritisch-Filter), damit die Invariante „Zeilen der Liste == Σ kritisch" erhalten bleibt.
- **Scope-Grenzen (nicht anfassen):** `gesamtbestand` / `variant_count` zählen weiter alle Varianten; die literale `-1` in `stock_levels` bleibt bestehen.
- Deploy-Regel: Keine lokale App-Instanz starten. DB-Migration/Backfill gegen die Dev/Test-DB dieses Hosts (`DATABASE_URL` aus `/root/ecom-platform/.env`) sind erlaubt und der normale Flow. Browser-Verifikation auf der VPS nur nach ausdrücklicher Deploy-Freigabe des Nutzers.
- Commit-Messages: Conventional Commits, deutschsprachig im Stil des Repos.

---

### Task 1: `isStockManaged` — reine Ableitungsfunktion (TDD)

**Files:**
- Modify: `src/woocommerce/catalog-import.ts` (neue exportierte Funktion, oben nach den Imports/Typen)
- Test: `tests/woocommerce/catalog-import.test.ts` (neuer `describe`-Block)

**Interfaces:**
- Produces: `export function isStockManaged(raw: Record<string, unknown>): boolean` — `false` gdw. `raw.virtual` ist `true`/`'true'` **oder** `raw.manage_stock` ist `false`/`'false'`; sonst `true`.

- [ ] **Step 1: Failing test schreiben**

In `tests/woocommerce/catalog-import.test.ts` am Ende einfügen (Import oben ergänzen: `isStockManaged` zur bestehenden Import-Zeile aus `@/woocommerce/catalog-import` hinzufügen):

```ts
describe('isStockManaged', () => {
  it('virtual (Boolean true) → nicht bestandsgeführt', () => {
    expect(isStockManaged({ virtual: true, manage_stock: 'parent' })).toBe(false);
  });
  it('virtual (String "true") → nicht bestandsgeführt', () => {
    expect(isStockManaged({ virtual: 'true' })).toBe(false);
  });
  it('manage_stock false (Boolean) → nicht bestandsgeführt', () => {
    expect(isStockManaged({ virtual: false, manage_stock: false })).toBe(false);
  });
  it('manage_stock "false" (String) → nicht bestandsgeführt', () => {
    expect(isStockManaged({ manage_stock: 'false' })).toBe(false);
  });
  it('manage_stock "parent" bei virtual=false → bestandsgeführt', () => {
    expect(isStockManaged({ virtual: false, manage_stock: 'parent' })).toBe(true);
  });
  it('manage_stock true → bestandsgeführt', () => {
    expect(isStockManaged({ virtual: false, manage_stock: true })).toBe(true);
  });
  it('fehlende Felder → bestandsgeführt (Default)', () => {
    expect(isStockManaged({})).toBe(true);
  });
});
```

- [ ] **Step 2: Test laufen lassen, Fehlschlag bestätigen**

Run: `npx vitest run tests/woocommerce/catalog-import.test.ts -t isStockManaged`
Expected: FAIL — `isStockManaged is not a function` / Import nicht auflösbar.

- [ ] **Step 3: Minimale Implementierung**

In `src/woocommerce/catalog-import.ts` nach `primaryWooCategory` (vor `mapProduct`) einfügen:

```ts
/** Bestandsgeführt gdw. WooCommerce eine echte physische Menge trackt.
 *  Nicht bestandsgeführt bei virtual=true oder manage_stock=false; die Werte
 *  manage_stock='parent'/true und fehlende Felder gelten als bestandsgeführt.
 *  Behandelt sowohl JSON-Boolean- als auch String-Form (Woo-API mischt beides). */
export function isStockManaged(raw: Record<string, unknown>): boolean {
  if (raw.virtual === true || raw.virtual === 'true') return false;
  if (raw.manage_stock === false || raw.manage_stock === 'false') return false;
  return true;
}
```

- [ ] **Step 4: Test laufen lassen, grün bestätigen**

Run: `npx vitest run tests/woocommerce/catalog-import.test.ts -t isStockManaged`
Expected: PASS (7 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/woocommerce/catalog-import.ts tests/woocommerce/catalog-import.test.ts
git commit -m "feat(woocommerce): isStockManaged — virtuelle/nicht-bestandsgeführte Produkte erkennen"
```

---

### Task 2: Schema-Spalte `is_stock_managed`

**Files:**
- Modify: `db/schema.sql` (nach der `product_variants`-Tabellendefinition, ~Zeile 300)

**Interfaces:**
- Produces: Spalte `product_variants.is_stock_managed BOOLEAN NOT NULL DEFAULT true`.

- [ ] **Step 1: ALTER hinzufügen**

In `db/schema.sql` direkt nach dem schließenden `);` der `product_variants`-Tabelle (Zeile 300) einfügen:

```sql
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS is_stock_managed BOOLEAN NOT NULL DEFAULT true;
```

- [ ] **Step 2: Migration gegen die Dev/Test-DB anwenden**

Run: `set -a && . ./.env && set +a && npx tsx scripts/migrate.ts`
Expected: Ausgabe `Schema applied.` und `RLS policies applied.`, kein Fehler.

- [ ] **Step 3: Spalte verifizieren**

Run:
```bash
set -a && . ./.env && set +a && node -e "import('pg').then(async ({default:pg})=>{const p=new pg.Pool({connectionString:process.env.DATABASE_URL});const r=await p.query(\"SELECT column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_name='product_variants' AND column_name='is_stock_managed'\");console.log(r.rows);await p.end();})"
```
Expected: eine Zeile `is_stock_managed | boolean | NO | true`.

- [ ] **Step 4: Commit**

```bash
git add db/schema.sql
git commit -m "feat(db): product_variants.is_stock_managed (Default true)"
```

---

### Task 3: Flag beim Katalog-Import setzen (AND-akkumulierend)

**Files:**
- Modify: `src/woocommerce/catalog-import.ts` (in `importWooCommerceVariations` und `importWooCommerceProducts`)

**Interfaces:**
- Consumes: `isStockManaged` (Task 1); Spalte `is_stock_managed` (Task 2).

- [ ] **Step 1: In `importWooCommerceProducts` UPDATE ergänzen**

Nach dem `external_references`-Upsert (aktuell Zeilen 164-169), noch vor dem Preis-Block, einfügen — `raw` ist hier das unveränderte Woo-Produktobjekt:

```ts
      await c.query(
        `UPDATE product_variants SET is_stock_managed = is_stock_managed AND $2 WHERE id = $1`,
        [variantId, isStockManaged(raw)]);
```

- [ ] **Step 2: In `importWooCommerceVariations` UPDATE ergänzen**

Nach dem `external_references`-Upsert (aktuell Zeilen 87-92), noch vor dem Preis-Block (`if (price !== null)`), einfügen — `raw` ist hier das Variations-Rohobjekt:

```ts
      await c.query(
        `UPDATE product_variants SET is_stock_managed = is_stock_managed AND $2 WHERE id = $1`,
        [variantId, isStockManaged(raw)]);
```

- [ ] **Step 3: Bestehende Woo-Import-Tests laufen lassen (keine Regression)**

Run: `npx vitest run tests/woocommerce/catalog-import.test.ts`
Expected: PASS (bestehende `mapProduct`-Tests + `isStockManaged` grün; die reinen Funktionstests sind DB-frei und nicht betroffen).

- [ ] **Step 4: Commit**

```bash
git add src/woocommerce/catalog-import.ts
git commit -m "feat(woocommerce): is_stock_managed beim Katalog-Import setzen (AND-akkumulierend)"
```

---

### Task 4: Backfill für bereits gespiegelte Varianten

**Files:**
- Modify: `scripts/backfill-stock-and-reorder.ts` (neuer UPDATE-Block)

**Interfaces:**
- Consumes: Spalte `is_stock_managed` (Task 2).

- [ ] **Step 1: Backfill-UPDATE ergänzen**

In `scripts/backfill-stock-and-reorder.ts` nach dem Bestand-INSERT-Block (nach der `console.log(\`Bestand gesetzt: ...\`)`-Zeile, aktuell Zeile 35) einfügen:

```ts
  // 1b) is_stock_managed aus den Woo-Rohdaten ableiten. bool_and: Variante nur
  // bestandsgeführt, wenn ALLE ihre Refs es sind; COALESCE(...,true) fängt den
  // Fall ab, dass virtual/manage_stock in allen Refs fehlen (per-Ref NULL).
  const managed = await pool.query(
    `UPDATE product_variants v SET is_stock_managed = sub.managed
       FROM (
         SELECT er.entity_id,
                COALESCE(bool_and(NOT (er.raw_payload->>'virtual' = 'true'
                                       OR er.raw_payload->>'manage_stock' = 'false')), true) AS managed
           FROM external_references er
          WHERE er.source_system = 'woocommerce' AND er.entity_type = 'product_variant'
          GROUP BY er.entity_id
       ) sub
      WHERE v.id = sub.entity_id`);
  console.log(`is_stock_managed gesetzt: ${managed.rowCount} Varianten.`);
```

- [ ] **Step 2: Backfill gegen die Dev/Test-DB laufen lassen**

Run: `set -a && . ./.env && set +a && npx tsx scripts/backfill-stock-and-reorder.ts`
Expected: u. a. Zeile `is_stock_managed gesetzt: <N> Varianten.`, kein Fehler.

- [ ] **Step 3: Gutschein-Varianten prüfen**

Run:
```bash
set -a && . ./.env && set +a && node -e "import('pg').then(async ({default:pg})=>{const p=new pg.Pool({connectionString:process.env.DATABASE_URL});const r=await p.query(\"SELECT sku,is_stock_managed FROM product_variants WHERE sku IN ('8-WooCommerce','115-WooCommerce') ORDER BY sku\");console.log(r.rows);const c=await p.query('SELECT count(*)::int AS unmanaged FROM product_variants WHERE is_stock_managed=false');console.log('unmanaged total',c.rows[0].unmanaged);await p.end();})"
```
Expected: beide Gutschein-SKUs `is_stock_managed: false`; `unmanaged total` > 0 (grob im Bereich der ~79 nicht-bestandsgeführten Refs, nach Variant-Dedup).

- [ ] **Step 4: Commit**

```bash
git add scripts/backfill-stock-and-reorder.ts
git commit -m "feat(verfuegbarkeit): Backfill is_stock_managed aus Woo-Rohdaten"
```

---

### Task 5: Query-Gate + End-to-End-Verifikation

**Files:**
- Modify: `src/verfuegbarkeit/repository.ts:170` (`listReorderSuggestions` WHERE)
- Modify: `src/verfuegbarkeit/history.ts:101-102` (`categoryRollup` kritisch-FILTER)

**Interfaces:**
- Consumes: Spalte `is_stock_managed` (Task 2), befüllt durch Backfill (Task 4).

- [ ] **Step 1: Baseline festhalten — Gutscheine sind aktuell noch drin**

Run (async IIFE nötig: `tsx -e` erlaubt kein Top-level-await):
```bash
set -a && . ./.env && set +a && npx tsx -e "
import { listReorderSuggestions } from './src/verfuegbarkeit/repository';
import { pool } from './src/lib/db';
void (async () => {
  const rows = await listReorderSuggestions();
  console.log('total', rows.length, 'gutschein', JSON.stringify(rows.filter(r=>['8-WooCommerce','115-WooCommerce'].includes(r.sku)).map(r=>r.sku)));
  await pool.end();
})();
"
```
Expected: `total 14`, `gutschein ["115-WooCommerce","8-WooCommerce"]` (Bug reproduziert, Gate noch nicht aktiv).

- [ ] **Step 2: Gate in `listReorderSuggestions` einbauen**

In `src/verfuegbarkeit/repository.ts` die WHERE-Zeile (aktuell Zeile 170)

```sql
      WHERE sd.units > 0 AND COALESCE(st.on_hand, 0) < sd.units
```

ersetzen durch:

```sql
      WHERE v.is_stock_managed AND sd.units > 0 AND COALESCE(st.on_hand, 0) < sd.units
```

- [ ] **Step 3: Gate im `categoryRollup`-FILTER einbauen**

In `src/verfuegbarkeit/history.ts` den kritisch-FILTER (aktuell Zeilen 101-102)

```sql
            COUNT(*) FILTER (WHERE COALESCE(sd.units, 0) > 0
                              AND COALESCE(st.on_hand, 0) < sd.units)::int AS kritisch
```

ersetzen durch:

```sql
            COUNT(*) FILTER (WHERE v.is_stock_managed AND COALESCE(sd.units, 0) > 0
                              AND COALESCE(st.on_hand, 0) < sd.units)::int AS kritisch
```

- [ ] **Step 4: Funktional verifizieren — Gutscheine raus, Invariante hält**

Run:
```bash
set -a && . ./.env && set +a && npx tsx -e "
import { listReorderSuggestions } from './src/verfuegbarkeit/repository';
import { categoryRollup } from './src/verfuegbarkeit/history';
import { pool } from './src/lib/db';
void (async () => {
  const rows = await listReorderSuggestions();
  const kritisch = (await categoryRollup()).reduce((a,r)=>a+r.anzahlKritisch,0);
  console.log('total', rows.length, 'gutschein', JSON.stringify(rows.filter(r=>['8-WooCommerce','115-WooCommerce'].includes(r.sku)).map(r=>r.sku)), 'ΣkritischEqualsRows', kritisch===rows.length);
  await pool.end();
})();
"
```
Expected: `total 12`, `gutschein []` (leer); `ΣkritischEqualsRows` ist `true` (Invariante Liste == Σ kritisch erhalten).

- [ ] **Step 5: Read-only Verfügbarkeits-Tests laufen lassen (keine Regression)**

Run: `npx vitest run tests/verfuegbarkeit/category-rollup.test.ts tests/verfuegbarkeit/dashboard-kpis.test.ts`
Expected: PASS. (Hinweis: `tests/verfuegbarkeit/repository.test.ts` seedet die DB und kann auf dieser Dev-DB an der bekannten Seed-Kollision scheitern — kein Blocker für diese Änderung; siehe Memory `dev-db-seed-collision`.)

- [ ] **Step 6: Commit**

```bash
git add src/verfuegbarkeit/repository.ts src/verfuegbarkeit/history.ts
git commit -m "feat(verfuegbarkeit): Meldebestand + kritisch-KPI gaten auf is_stock_managed"
```

- [ ] **Step 7: Optionale Browser-Verifikation (nur nach Deploy-Freigabe)**

Da die Änderung ein reiner Query-Filter ist und die UI unverändert rendert, ist Step 4 der funktionale Nachweis. Für eine visuelle Gegenprüfung auf `/verfuegbarkeit/meldebestand` müsste auf die VPS deployt werden (client-facing) — **vorher Nutzerfreigabe einholen**. Danach: Seite öffnen, bestätigen, dass „Geschenkgutschein" nicht mehr in der Meldebestand-Tabelle steht.

---

### Task 6: `belowReorder`-Flächen der Bestand-Liste ebenfalls gaten

**Kontext:** Die Ganzzweig-Review fand, dass die *Bestand*-Liste einen zweiten,
`reorder_point`-basierten „unter Meldebestand"-Begriff hat (`belowReorder =
reorder_point > 0 AND available < reorder_point`), der **nicht** gegatet war. Da
der Backfill-Schritt 2 den Gutscheinen `reorder_point = 1` gab und ihr `on_hand`
`-1` ist, erscheinen sie dort weiter als meldebedürftig. Dasselbe Symptom, andere
Seite. Fix: `is_stock_managed` in die `belowReorder`-Logik aller drei Stellen
aufnehmen.

**Files:**
- Modify: `src/verfuegbarkeit/repository.ts` (`listStock`, `listStockPaged`)
- Modify: `src/verfuegbarkeit/history.ts` (`listCategoryVariants`)

**Interfaces:**
- Consumes: Spalte `is_stock_managed` (Task 2), befüllt durch Backfill (Task 4).
- `StockRow`/`CategoryVariantRow`-Typen bleiben unverändert — `is_stock_managed`
  wird nur als Roh-Query-Feld gelesen, nicht in die Rückgabeobjekte aufgenommen.

- [ ] **Step 1: Baseline — „unter Meldebestand" enthält aktuell die Gutscheine**

Run:
```bash
set -a && . ./.env && set +a && npx tsx -e "
import { listStockPaged } from './src/verfuegbarkeit/repository';
import { pool } from './src/lib/db';
void (async () => {
  const { rows, total } = await listStockPaged({ filter: 'below', limit: 5000 });
  console.log('below total', total, 'vouchers', JSON.stringify(rows.filter(r=>['8-WooCommerce','115-WooCommerce'].includes(r.sku)).map(r=>r.sku)));
  await pool.end();
})();
"
```
Expected: `below total 10`, `vouchers ["115-WooCommerce","8-WooCommerce"]`.

- [ ] **Step 2: `listStock` gaten** (`src/verfuegbarkeit/repository.ts`)

SELECT-Liste (Zeile 14) um `v.is_stock_managed` ergänzen:
```sql
    `SELECT v.id AS variant_id, v.sku, p.name AS product_name, v.reorder_point, v.is_stock_managed,
```
`GROUP BY` (Zeile 20) um `v.is_stock_managed` ergänzen:
```sql
      GROUP BY v.id, v.sku, p.name, v.reorder_point, v.is_stock_managed
```
`belowReorder` (Zeile 27) gaten:
```ts
      reorderPoint: x.reorder_point, belowReorder: x.is_stock_managed && x.reorder_point > 0 && available < x.reorder_point,
```

- [ ] **Step 3: `listStockPaged` gaten** (`src/verfuegbarkeit/repository.ts`)

Inneres SELECT (Zeile 47) um `v.is_stock_managed` ergänzen:
```sql
    SELECT v.id AS variant_id, v.sku, p.name AS product_name, v.reorder_point, v.is_stock_managed,
```
`GROUP BY` (Zeile 55) um `v.is_stock_managed` ergänzen:
```sql
     GROUP BY v.id, v.sku, p.name, v.reorder_point, v.is_stock_managed`;
```
`below`-Filter (Zeile 57) gaten:
```ts
  const filtered = `SELECT t.* FROM (${inner}) t
     WHERE ($2::boolean = false OR (t.is_stock_managed AND t.reorder_point > 0 AND t.available < t.reorder_point))`;
```
`belowReorder`-Map (Zeile 64) gaten:
```ts
    reorderPoint: x.reorder_point, belowReorder: x.is_stock_managed && x.reorder_point > 0 && x.available < x.reorder_point,
```

- [ ] **Step 4: `listCategoryVariants` gaten** (`src/verfuegbarkeit/history.ts`)

SELECT (Zeile 120) um `v.is_stock_managed` ergänzen:
```sql
    `SELECT v.id AS variant_id, v.sku, p.name AS product_name, v.reorder_point, v.is_stock_managed,
```
`belowReorder`-Map (Zeile 130) gaten:
```ts
    belowReorder: x.is_stock_managed && Number(x.reorder_point ?? 0) > 0 && Number(x.on_hand) < Number(x.reorder_point),
```

- [ ] **Step 5: Funktional verifizieren — Gutscheine raus**

Run:
```bash
set -a && . ./.env && set +a && npx tsx -e "
import { listStockPaged } from './src/verfuegbarkeit/repository';
import { pool } from './src/lib/db';
void (async () => {
  const { rows, total } = await listStockPaged({ filter: 'below', limit: 5000 });
  console.log('below total', total, 'vouchers', JSON.stringify(rows.filter(r=>['8-WooCommerce','115-WooCommerce'].includes(r.sku)).map(r=>r.sku)), 'anyBelowFlagVoucher', rows.some(r=>['8-WooCommerce','115-WooCommerce'].includes(r.sku) && r.belowReorder));
  await pool.end();
})();
"
```
Expected: `below total 8`, `vouchers []`, `anyBelowFlagVoucher false`.

- [ ] **Step 6: Read-only Verfügbarkeits-Tests (keine Regression)**

Run: `npx vitest run tests/verfuegbarkeit/category-rollup.test.ts tests/verfuegbarkeit/dashboard-kpis.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/verfuegbarkeit/repository.ts src/verfuegbarkeit/history.ts
git commit -m "fix(verfuegbarkeit): belowReorder der Bestand-Liste auf is_stock_managed gaten"
```

---

## Self-Review

**Spec coverage:**
- Schema-Spalte → Task 2 ✓
- `isStockManaged` (Boolean + String) → Task 1 ✓
- Import-Befüllung, AND-akkumulierend, beide Pfade → Task 3 ✓
- Backfill (`bool_and` + `COALESCE`) → Task 4 ✓
- Query-Gate an beiden Stellen → Task 5 (Steps 2+3) ✓
- Invariante Liste == Σ kritisch → Task 5 Step 4 ✓
- Scope-Grenzen (gesamtbestand/-1 unangetastet) → keine Task ändert sie; explizit in Global Constraints ✓
- Unit-Test (TDD-Anker) → Task 1 ✓
- Empirische Dev-DB-Verifikation → Task 4 Step 3, Task 5 Steps 1/4 ✓

**Placeholder scan:** keine TBD/TODO/„handle edge cases"; jeder Code-Step zeigt vollständigen Code oder exakten Befehl.

**Type consistency:** `isStockManaged(raw: Record<string, unknown>): boolean` identisch in Task 1 (Definition) und Task 3 (Aufruf); Spaltenname `is_stock_managed` durchgängig in Tasks 2–5.
