# Umsatz aus gespeicherter Belegsumme — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Den ausgewiesenen Umsatz um die ~24,5 % korrigieren, die verloren gehen, weil WooCommerce-Positionen gelöschter Produkte keine SKU tragen — durch eine gespeicherte Netto-Belegsumme mit Fallback auf die Positionsrechnung.

**Architecture:** `sales_orders` bekommt eine **nullable** Spalte `total_net`. Der WooCommerce-Import füllt sie aus `line_items[].total` (nach Rabatt, inklusive Positionen ohne SKU). Alle Umsatzabfragen auf Beleg-Ebene rechnen künftig `COALESCE(o.total_net, Positionssumme)`. Belege ohne gespeicherte Summe (manuell angelegt) verhalten sich unverändert.

**Tech Stack:** TypeScript, Postgres (`pg`), Next.js App Router, Vitest.

## Global Constraints

- **Die JOIN-Falle:** Heutige Abfragen lauten `FROM sales_orders o LEFT JOIN sales_order_lines l …` mit `SUM(l.quantity * l.unit_price)`. Ein **Beleg**-Wert in dieser Form würde **einmal je Position** gezählt. Jede umgestellte Abfrage MUSS den `LEFT JOIN sales_order_lines` entfernen und den Belegwert über `sales_orders` summieren.
- `total_net` ist **nullable** und wird NICHT an anderen Schreibpfaden gepflegt (kein Anlegen/Ändern/Retoure) — bewusst, damit keine Invariante driften kann.
- Umsatz = `line_items[].total` (**nach** Rabatt), nicht `subtotal`. Ohne Steuer und Versand.
- `topProducts` bleibt positionsbasiert (braucht Produktzuordnung) — NICHT umstellen.
- Tests lokal: `set -a && source .env && set +a`, dann gegen eine **Wegwerf-DB** (siehe unten). Niemals gegen die bryx-test-DB, die Tests löschen Daten.
- Design-Standard: keine UI-Umbauten außer der einen Zeile in `VerkaufDetail.tsx`.

**Wegwerf-DB für DB-Tests** (vitest lädt `.env` NICHT — ohne das scheitern alle DB-Tests an Auth und maskieren echte Fehler):

```bash
cd /root/ecom-platform && set -a && source .env && set +a
PW=$(python3 -c "import os,re;print(re.search(r'//[^:]+:([^@]+)@',os.environ['DATABASE_URL']).group(1))")
docker exec -e PGPASSWORD="$PW" supabase-db psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS citest"
docker exec -e PGPASSWORD="$PW" supabase-db psql -U postgres -d postgres -c "CREATE DATABASE citest"
docker cp db/schema.sql supabase-db:/tmp/s.sql && docker exec -e PGPASSWORD="$PW" supabase-db psql -U postgres -d citest -q -f /tmp/s.sql
docker cp db/rls.sql    supabase-db:/tmp/r.sql && docker exec -e PGPASSWORD="$PW" supabase-db psql -U postgres -d citest -q -f /tmp/r.sql
export CITEST_URL="postgres://postgres:$PW@localhost:5432/citest"
# Tests:  DATABASE_URL="$CITEST_URL" npx vitest run <datei>
```

---

### Task 1: Schema-Spalte + `mapOrderTotal`

**Files:**
- Modify: `db/schema.sql` (ALTER ans Ende, zu den übrigen ALTERs)
- Modify: `src/woocommerce/order-import.ts`
- Test: `tests/woocommerce/order-import.test.ts`

**Interfaces:**
- Produces: `mapOrderTotal(items: WooLineItem[]): number` — summiert `line_items[].total` über ALLE Positionen, auch ohne SKU.
- `WooLineItem` bekommt ein optionales Feld `total?: string | number`.

- [ ] **Step 1: Failing test schreiben**

An `tests/woocommerce/order-import.test.ts` anhängen:

```ts
import { mapOrderTotal } from '@/woocommerce/order-import';

describe('mapOrderTotal', () => {
  it('summiert alle Positionen — auch die ohne SKU (geloeschte Produkte)', () => {
    const items = [
      { sku: 'A1', quantity: 2, price: 10, total: '20.00' },
      { quantity: 1, price: 55.5, total: '55.50' },          // ohne SKU
      { sku: 'B2', quantity: 1, price: 5, total: '5.00' },
    ];
    expect(mapOrderTotal(items as any)).toBeCloseTo(80.5);
  });
  it('nutzt total (nach Rabatt), nicht subtotal', () => {
    const items = [{ sku: 'A1', quantity: 1, price: 100, subtotal: '100.00', total: '80.00' }];
    expect(mapOrderTotal(items as any)).toBeCloseTo(80);
  });
  it('leere Liste ergibt 0, fehlendes total zaehlt als 0', () => {
    expect(mapOrderTotal([])).toBe(0);
    expect(mapOrderTotal([{ sku: 'X', quantity: 1, price: 1 }] as any)).toBe(0);
  });
});
```

- [ ] **Step 2: Test rot laufen lassen**

Run: `npx vitest run tests/woocommerce/order-import.test.ts`
Expected: FAIL („mapOrderTotal is not a function").

- [ ] **Step 3: Schema-Spalte ergänzen**

In `db/schema.sql` bei den übrigen `ALTER TABLE`-Anweisungen am Dateiende einfügen:

```sql
-- Netto-Belegsumme aus dem Quellsystem (WooCommerce, inkl. Positionen geloeschter
-- Produkte ohne SKU). Nullable: Belege ohne gespeicherte Summe rechnen weiter aus
-- ihren Positionen, es gibt daher keine Invariante zu pflegen.
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS total_net NUMERIC(12,2);
```

- [ ] **Step 4: `mapOrderTotal` implementieren**

In `src/woocommerce/order-import.ts`, direkt unter `mapOrderLines`:

```ts
// Netto-Belegsumme aus WooCommerce: Summe ueber ALLE Positionen, auch die ohne
// SKU (geloeschte Produkte). `total` ist der Betrag NACH Rabatt — `subtotal`
// waere davor und wuerde Rabatte als Umsatz ausweisen.
export function mapOrderTotal(items: WooLineItem[]): number {
  return items.reduce((s, it) => s + (Number(it.total) || 0), 0);
}
```

Und `WooLineItem` (im selben File) um das Feld erweitern:

```ts
interface WooLineItem { sku?: string; quantity: number; price: string | number; total?: string | number }
```

- [ ] **Step 5: Test grün**

Run: `npx vitest run tests/woocommerce/order-import.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql src/woocommerce/order-import.ts tests/woocommerce/order-import.test.ts
git commit -m "feat(verkauf): sales_orders.total_net + mapOrderTotal aus Woo-Positionen"
```

---

### Task 2: Import schreibt `total_net` (beide Pfade)

**Files:**
- Modify: `src/woocommerce/order-import.ts` (Neuanlage- UND Bestandspfad)
- Test: `tests/woocommerce/order-import.test.ts`

**Interfaces:**
- Consumes: `mapOrderTotal` (Task 1).
- Produces: `importWooCommerceOrders` setzt `sales_orders.total_net` beim Anlegen und beim erneuten Import.

- [ ] **Step 1: Failing test schreiben**

An die DB-Tests in `tests/woocommerce/order-import.test.ts` anhängen (Muster der vorhandenen DB-Tests dort übernehmen — gleiche Fixtures/Hilfen):

```ts
it('setzt total_net beim Import und auch beim erneuten Import (idempotent)', async () => {
  const raw = [{
    id: 987654, number: '987654', status: 'completed', date_created: '2026-05-01T10:00:00',
    billing: { first_name: 'Max', last_name: 'Muster', email: 'max@example.com' },
    line_items: [
      { sku: 'SKU-EXIST', quantity: 1, price: 30, total: '30.00' },
      { quantity: 1, price: 70, total: '70.00' },   // ohne SKU -> Position faellt weg, Summe nicht
    ],
  }];
  await importWooCommerceOrders(pool, raw as any, priceListId);
  const a = await pool.query(`SELECT total_net FROM sales_orders WHERE number = '987654'`);
  expect(Number(a.rows[0].total_net)).toBeCloseTo(100);

  await importWooCommerceOrders(pool, raw as any, priceListId);   // erneut
  const b = await pool.query(`SELECT total_net FROM sales_orders WHERE number = '987654'`);
  expect(Number(b.rows[0].total_net)).toBeCloseTo(100);
});
```

- [ ] **Step 2: Rot laufen lassen**

Run: `DATABASE_URL="$CITEST_URL" npx vitest run tests/woocommerce/order-import.test.ts`
Expected: FAIL (`total_net` ist NULL).

- [ ] **Step 3: Beide Import-Pfade ergänzen**

In `src/woocommerce/order-import.ts`:

- Im **Bestandspfad** (dort, wo `existingOrderId` behandelt und `result.ordersLinked`/`ordersUpdated` hochgezählt wird) nach dem Positions-Abgleich ergänzen:

```ts
        await c.query('UPDATE sales_orders SET total_net = $2 WHERE id = $1',
          [existingOrderId, mapOrderTotal(rawLines)]);
```

- Im **Neuanlage-Pfad**: `total_net` im `INSERT INTO sales_orders (…)` mitschreiben (Spalte + Wert `mapOrderTotal(rawLines)` ergänzen), ODER direkt nach dem Insert per `UPDATE` setzen — wähle die Variante, die den bestehenden Code am wenigsten umbaut.

`rawLines` ist die Liste der Woo-`line_items` des jeweiligen Belegs (dieselbe, die schon an `mapOrderLines` geht).

- [ ] **Step 4: Grün**

Run: `DATABASE_URL="$CITEST_URL" npx vitest run tests/woocommerce/order-import.test.ts`
Expected: PASS (alle, auch die bestehenden).

- [ ] **Step 5: Commit**

```bash
git add src/woocommerce/order-import.ts tests/woocommerce/order-import.test.ts
git commit -m "feat(verkauf): Bestellimport schreibt total_net auf beiden Pfaden"
```

---

### Task 3: `ORDER_REVENUE_SQL` + Umstellung `verkauf/repository.ts`

**Files:**
- Modify: `src/verkauf/repository.ts`
- Test: `tests/verkauf/repository.test.ts`

**Interfaces:**
- Produces: Modul-Konstante `ORDER_REVENUE_SQL`, genutzt von `salesTotals`, `revenueNetTotal`, `salesDailySeries`, `revenueByDay`, `channelSummary`, `ecomSalesFacts`, `createDebitorOpenItem`.

- [ ] **Step 1: Failing tests schreiben**

An `tests/verkauf/repository.test.ts` anhängen (bestehende Fixture-Hilfen des Files nutzen):

```ts
it('salesTotals: gespeicherte Belegsumme hat Vorrang vor den Positionen', async () => {
  const before = await salesTotals(RANGE);
  const id = await createOrderWithLines([{ qty: 1, price: 30 }]);   // Hilfsfunktion des Files
  await pool.query(`UPDATE sales_orders SET total_net = 100 WHERE id = $1`, [id]);
  const after = await salesTotals(RANGE);
  expect(after.revenueNet - before.revenueNet).toBeCloseTo(100);    // 100, nicht 30
});

it('salesTotals: mehrere Positionen vervielfachen die Belegsumme NICHT', async () => {
  const before = await salesTotals(RANGE);
  const id = await createOrderWithLines([{ qty: 1, price: 10 }, { qty: 1, price: 10 }, { qty: 1, price: 10 }]);
  await pool.query(`UPDATE sales_orders SET total_net = 100 WHERE id = $1`, [id]);
  const after = await salesTotals(RANGE);
  expect(after.revenueNet - before.revenueNet).toBeCloseTo(100);    // 100, nicht 300
});

it('salesTotals: ohne total_net weiterhin aus Positionen', async () => {
  const before = await salesTotals(RANGE);
  await createOrderWithLines([{ qty: 2, price: 10 }]);
  const after = await salesTotals(RANGE);
  expect(after.revenueNet - before.revenueNet).toBeCloseTo(20);
});
```

Falls `createOrderWithLines` im File nicht existiert: die vorhandene Art, Testbelege anzulegen, übernehmen und die `sales_orders`-ID zurückgeben.

- [ ] **Step 2: Rot laufen lassen**

Run: `DATABASE_URL="$CITEST_URL" npx vitest run tests/verkauf/repository.test.ts`
Expected: FAIL — Test 1 liefert 30 statt 100, Test 2 liefert 30 statt 100.

- [ ] **Step 3: Konstante einführen**

In `src/verkauf/repository.ts` neben `REVENUE_STATUS_SQL`:

```ts
// Umsatz je Beleg: die gespeicherte Netto-Summe aus dem Quellsystem hat Vorrang
// (sie enthaelt auch Positionen geloeschter Produkte ohne SKU); fehlt sie, wird
// aus den Positionen gerechnet. ACHTUNG: Abfragen, die das benutzen, duerfen
// sales_order_lines NICHT joinen — sonst zaehlt der Wert je Position mit.
const ORDER_REVENUE_SQL = `COALESCE(o.total_net, (
  SELECT COALESCE(SUM(l.quantity * l.unit_price), 0)
    FROM sales_order_lines l WHERE l.order_id = o.id
))`;
```

- [ ] **Step 4: Abfragen umstellen**

Für **jede** der Funktionen `salesTotals`, `revenueNetTotal`, `salesDailySeries`, `revenueByDay`, `channelSummary`, `ecomSalesFacts` (beide Stellen: Umsatz und die `life`-CTE für CLV) und `createDebitorOpenItem`:

1. `LEFT JOIN sales_order_lines l ON l.order_id = o.id` aus dem `FROM` **entfernen**.
2. Jedes `SUM(l.quantity * l.unit_price)` durch `SUM(${ORDER_REVENUE_SQL})` ersetzen (die `FILTER (…)`-Klauseln unverändert lassen).
3. In `createDebitorOpenItem` (Einzelbeleg, kein SUM) den Ausdruck
   `(SELECT COALESCE(SUM(quantity*unit_price),0) FROM sales_order_lines WHERE order_id = o.id)`
   durch `ORDER_REVENUE_SQL` ersetzen — dort muss der Beleg als `o` aliasiert sein.

`topProducts` (Umsatz je Produkt) bleibt **unverändert** positionsbasiert.

- [ ] **Step 5: Grün — inkl. aller bestehenden Tests des Files**

Run: `DATABASE_URL="$CITEST_URL" npx vitest run tests/verkauf/`
Expected: PASS. Die bestehenden Umsatz-Assertions (z. B. `revenueNet` ≈ 50, Storno-Fälle, `channelSummary` ≈ 200) müssen unverändert grün sein — sie arbeiten ohne `total_net` und laufen damit über den Fallback.

- [ ] **Step 6: Commit**

```bash
git add src/verkauf/repository.ts tests/verkauf/repository.test.ts
git commit -m "feat(verkauf): Umsatz-KPIs nutzen die gespeicherte Belegsumme mit Positions-Fallback"
```

---

### Task 4: Umstellung `kontakte/analytics.ts`

**Files:**
- Modify: `src/kontakte/analytics.ts`
- Test: `tests/kontakte/analytics.test.ts`

**Interfaces:**
- Consumes: dieselbe COALESCE-Logik wie Task 3. Da die Konstante in `verkauf/repository.ts` modul-privat ist, hier eine gleichlautende lokale Konstante definieren (kein Export quer durch die Domänen).

- [ ] **Step 1: Failing test schreiben**

An `tests/kontakte/analytics.test.ts` anhängen:

```ts
it('customerKpis: gespeicherte Belegsumme hat Vorrang und vervielfacht nicht', async () => {
  const before = (await customerKpis(RANGE)).revenueNet;
  const id = await createOrderWithLines([{ qty: 1, price: 10 }, { qty: 1, price: 10 }]);
  await pool.query(`UPDATE sales_orders SET total_net = 100 WHERE id = $1`, [id]);
  const after = (await customerKpis(RANGE)).revenueNet;
  expect(after - before).toBeCloseTo(100);   // 100, nicht 20 und nicht 200
});
```

(Fixture-Hilfen des Files verwenden; Signatur von `customerKpis` dort nachlesen.)

- [ ] **Step 2: Rot laufen lassen**

Run: `DATABASE_URL="$CITEST_URL" npx vitest run tests/kontakte/analytics.test.ts`
Expected: FAIL (liefert 20).

- [ ] **Step 3: Umstellen**

In `src/kontakte/analytics.ts` dieselbe Konstante anlegen:

```ts
// Siehe verkauf/repository.ts: gespeicherte Belegsumme hat Vorrang; Abfragen,
// die das nutzen, duerfen sales_order_lines nicht joinen.
const ORDER_REVENUE_SQL = `COALESCE(o.total_net, (
  SELECT COALESCE(SUM(l.quantity * l.unit_price), 0)
    FROM sales_order_lines l WHERE l.order_id = o.id
))`;
```

und in `customerMetrics` (beide Stellen: `clv` und `p_revenue`), `customerKpis`, `customerSummary`, `customerOrders` jeweils den `sales_order_lines`-JOIN entfernen und `SUM(l.quantity*l.unit_price)` durch `SUM(${ORDER_REVENUE_SQL})` ersetzen. Bei `customerOrders` (ein Wert je Beleg, kein SUM) direkt `ORDER_REVENUE_SQL` einsetzen.

- [ ] **Step 4: Grün**

Run: `DATABASE_URL="$CITEST_URL" npx vitest run tests/kontakte/`
Expected: PASS, inkl. der bestehenden Assertions (`revenueNet` ≈ 50, `clv >= revenueNet`, Summenkonsistenz).

- [ ] **Step 5: Commit**

```bash
git add src/kontakte/analytics.ts tests/kontakte/analytics.test.ts
git commit -m "feat(kontakte): Kundenumsatz nutzt die gespeicherte Belegsumme"
```

---

### Task 5: Beleg-Detailseite

**Files:**
- Modify: `src/components/VerkaufDetail.tsx` (Zeile ~36) und die Stelle, die den Beleg lädt (`src/verkauf/repository.ts`, Detail-Query) sowie den Typ des Belegs.

**Interfaces:**
- Consumes: `sales_orders.total_net`.
- Produces: Der Beleg-Typ trägt `totalNet: number | null`; `VerkaufDetail` nutzt ihn statt der Positionssumme, wenn gesetzt.

- [ ] **Step 1: Beleg-Query + Typ erweitern**

In `src/verkauf/repository.ts` die Funktion, die einen einzelnen Beleg samt `lines` und `costs` lädt, um `o.total_net` erweitern und im zurückgegebenen Objekt als `totalNet: row.total_net === null ? null : Number(row.total_net)` bereitstellen. Den zugehörigen TypeScript-Typ (dort oder in `src/verkauf/types.ts`) um `totalNet: number | null` ergänzen.

- [ ] **Step 2: Komponente umstellen**

In `src/components/VerkaufDetail.tsx` die Zeile

```tsx
const total = order.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
```

ersetzen durch

```tsx
// Gespeicherte Netto-Belegsumme hat Vorrang — sie enthaelt auch Positionen
// geloeschter Produkte, die es in order.lines nicht mehr gibt.
const total = order.totalNet ?? order.lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0);
```

- [ ] **Step 3: Typecheck + Tests**

Run: `npx tsc --noEmit` → keine Fehler.
Run: `DATABASE_URL="$CITEST_URL" npx vitest run tests/verkauf/ tests/components/`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/verkauf/ src/components/VerkaufDetail.tsx
git commit -m "feat(verkauf): Beleg-Detail zeigt die gespeicherte Belegsumme"
```

---

### Task 6: Volle Verifikation

- [ ] **Step 1: Wegwerf-DB frisch aufsetzen** (Befehle in „Global Constraints").

- [ ] **Step 2: Komplette Suite**

Run: `DATABASE_URL="$CITEST_URL" npx vitest run`
Expected: **alle** Tests grün. Bei rotem Test: NICHT als Umgebungsproblem abtun — die Wegwerf-DB ist korrekt aufgesetzt, ein roter Test ist echt.

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit` → sauber.

- [ ] **Step 4: Wegwerf-DB entfernen**

```bash
docker exec -e PGPASSWORD="$PW" supabase-db psql -U postgres -d postgres -c "DROP DATABASE IF EXISTS citest"
```

## Rollout (durch den Controller, nicht durch Task-Subagenten)

1. Deploy bryx-test (`/opt/budp-dev/deploy.sh`), Kampagnen-/Verkaufsansicht im Browser prüfen.
2. PR gegen `main`, CI abwarten (CI hat eigenes Postgres und führt die DB-Tests wirklich aus).
3. Nach Merge: Prod deployen (`cd /opt/budp/app && ./deploy/deploy.sh`).
4. Auf Prod `npm run import:woocommerce-orders` erneut laufen lassen (idempotent, ~10 Min, abgekoppelt starten) — setzt `total_net` auf den bestehenden 13.993 Belegen nach.
5. **Gegenprobe:** Die Stichprobe aus der Spec erneut fahren (400 Belege, Seiten 1/40/80/120) und Woo-Positionssumme gegen den errechneten Umsatz halten. Erwartung: Abweichung ≈ 0 % statt 24,5 %.
