# Storno-bereinigte Umsatz-KPI + Stornoquote — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle Verkaufs-Umsätze auf eine einzige, self-correcting Definition umstellen (`status <> 'storniert'`, inkl. Angebote, ohne MwSt) und die Stornoquote als eigene KPI mit Verlauf ergänzen.

**Architecture:** Zentrales Status-Prädikat in `src/verkauf/repository.ts`; alle Umsatz-Aggregate (Übersicht, Kanal, Dashboard) nutzen es. Der stornierte Umsatz wird pro Aggregat mit `FILTER (WHERE …)` in derselben Query mitgezogen; die Stornoquote wird daraus berechnet. Frontend: bestehende `KpiLineChart`/`KpiTrendRow` bekommen ein `'pct'`-Format; die Übersicht erhält eine anklickbare Stornoquote-Kachel, die Kanal-Detailseite ein Stornoquote-StatTile.

**Tech Stack:** Next.js (App Router, Server Components), TypeScript, node-postgres (`pool`), recharts, vitest.

## Global Constraints

- Umsatzdefinition überall identisch: `Umsatz = Σ(quantity·unit_price)` über `sales_orders` mit `status <> 'storniert'`, ohne MwSt (aus `sales_order_lines.unit_price`).
- `Stornoquote = cancelledRevenue / (revenueNet + cancelledRevenue)` (wertbasiert), `0` wenn Basis `0`.
- Warmes ERP-Design-System: Akzent nur über `--accent`/`var(--brand)`, warme `neutral`-Palette, `.anno` (DM Mono) für UPPERCASE-Microlabels, Dark-Mode-Varianten Pflicht. Keine neuen Farb-Tokens.
- Tests laufen mit `npx vitest`. **Die verkauf-Repo-Tests brauchen eine frische Sibling-DB** (die Dev-DB kollidiert wegen Seed vs. echter WooCommerce-Daten). Nicht gegen die laufende Dev-DB ausführen.
- Deployment/Browser-Verifikation nur auf dem VPS (`root@194.164.204.249`, https://budp.lumeapps.de) — **kein** lokaler App-Start.
- Konvention `revenueNet`/`avgOrderValueNet`: „Net" = *ohne MwSt* und bleibt so benannt. Neue Storno-Felder heißen `cancelledRevenue`/`stornoQuote`.

---

### Task 1: `salesTotals` — Umsatz `<> 'storniert'` + Stornofelder

**Files:**
- Modify: `src/verkauf/types.ts:62-64` (Interface `SalesTotals`)
- Modify: `src/verkauf/repository.ts:406-428` (Funktion `salesTotals`)
- Test: `tests/verkauf/repository.test.ts:272-301`

**Interfaces:**
- Produces: `SalesTotals` mit zusätzlich `cancelledRevenue: number` und `stornoQuote: number`. `salesTotals(range: DateRange, channel?: OrderChannel): Promise<SalesTotals>` — `revenueNet`/`orders` zählen jetzt alles außer `storniert` (inkl. `angebot`), `openOffers` bleibt separat (`status = 'angebot'`).

- [ ] **Step 1: Bestehenden Test an das neue Verhalten anpassen (failing)**

In `tests/verkauf/repository.test.ts` den Test bei Zeile 272 ersetzen — Angebote zählen jetzt zum Umsatz:

```ts
  it('salesTotals: Umsatz = alles außer storniert (inkl. Angebote), offene Angebote separat', async () => {
    const before = await salesTotals(range);

    // Angebot (manuell) → zählt jetzt in Umsatz (2×10=20) UND als openOffer
    const offer = await createOrder({
      contactId: MUELLER, channel: 'manuell', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 2, unitPrice: 10 }],
    });
    orderIds.push(offer.id);

    // Auftrag (shop) → Umsatz 3×10=30
    const order = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 3, unitPrice: 10 }],
    });
    orderIds.push(order.id);

    const after = await salesTotals(range);
    expect(after.revenueNet - before.revenueNet).toBeCloseTo(50);   // 20 (Angebot) + 30 (Auftrag)
    expect(after.orders - before.orders).toBe(2);                    // beide zählen
    expect(after.openOffers - before.openOffers).toBe(1);            // nur das Angebot
    expect(after.avgOrderValueNet).toBeCloseTo(after.revenueNet / after.orders);
  });

  it('salesTotals: storniert fließt in cancelledRevenue/stornoQuote, nicht in Umsatz', async () => {
    const before = await salesTotals(range);
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 4, unitPrice: 10 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'storniert');   // aus 'auftrag' erlaubt

    const after = await salesTotals(range);
    expect(after.revenueNet - before.revenueNet).toBeCloseTo(0);       // Storno NICHT im Umsatz
    expect(after.cancelledRevenue - before.cancelledRevenue).toBeCloseTo(40);
    expect(after.stornoQuote).toBeGreaterThan(0);
    expect(after.stornoQuote).toBeLessThanOrEqual(1);
  });
```

`transitionOrderStatus` ist bereits importiert (Zeile 7 der Testdatei).

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npx vitest run tests/verkauf/repository.test.ts -t "salesTotals"`
Expected: FAIL — `cancelledRevenue`/`stornoQuote` sind `undefined`, und der Umsatz-Delta ist noch 30 statt 50.

- [ ] **Step 3: Interface erweitern**

In `src/verkauf/types.ts` das Interface ersetzen:

```ts
export interface SalesTotals {
  revenueNet: number; orders: number; avgOrderValueNet: number; openOffers: number;
  cancelledRevenue: number; stornoQuote: number;
}
```

- [ ] **Step 4: `salesTotals` umschreiben**

In `src/verkauf/repository.ts` direkt über `salesTotals` (vor Zeile 406) das zentrale Prädikat einführen:

```ts
// Umsatz-Basis: alles außer storniert (inkl. Angebote/Aufträge). Self-correcting,
// da der aktuelle Status gelesen wird — verarbeitete Stornos sind automatisch abgezogen.
const REVENUE_STATUS_SQL = "o.status <> 'storniert'";
```

Dann den Body von `salesTotals` (406-428) ersetzen:

```ts
export async function salesTotals(range: DateRange, channel?: OrderChannel): Promise<SalesTotals> {
  const rev = await pool.query(
    `SELECT COALESCE(SUM(l.quantity * l.unit_price) FILTER (WHERE ${REVENUE_STATUS_SQL}), 0)::float8 AS revenue,
            (COUNT(DISTINCT o.id) FILTER (WHERE ${REVENUE_STATUS_SQL}))::int AS orders,
            COALESCE(SUM(l.quantity * l.unit_price) FILTER (WHERE o.status = 'storniert'), 0)::float8 AS cancelled
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id = o.id
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND ($3::text IS NULL OR o.channel = $3)`,
    [range.start, range.end, channel ?? null]);
  const off = await pool.query(
    `SELECT COUNT(*)::int AS open_offers FROM sales_orders o
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND o.status = 'angebot'
        AND ($3::text IS NULL OR o.channel = $3)`,
    [range.start, range.end, channel ?? null]);
  const revenueNet = Number(rev.rows[0].revenue);
  const cancelledRevenue = Number(rev.rows[0].cancelled);
  const orders = rev.rows[0].orders;
  const base = revenueNet + cancelledRevenue;
  return {
    revenueNet, orders,
    avgOrderValueNet: orders > 0 ? revenueNet / orders : 0,
    openOffers: off.rows[0].open_offers,
    cancelledRevenue,
    stornoQuote: base > 0 ? cancelledRevenue / base : 0,
  };
}
```

- [ ] **Step 5: Tests ausführen — müssen grün sein**

Run: `npx vitest run tests/verkauf/repository.test.ts`
Expected: PASS (inkl. der weiterhin bestehenden Tests „avgOrderValueNet ist 0…" und „Retoure mindert den Umsatz netto").

- [ ] **Step 6: Commit**

```bash
git add src/verkauf/types.ts src/verkauf/repository.ts tests/verkauf/repository.test.ts
git commit -m "feat(verkauf): salesTotals zählt alles außer storniert + cancelledRevenue/stornoQuote"
```

---

### Task 2: `salesDailySeries` — Verlauf inkl. stornierter Summe

**Files:**
- Modify: `src/verkauf/repository.ts:344-358` (Interface `SalesDailyPoint` + Funktion `salesDailySeries`)
- Test: `tests/verkauf/repository.test.ts` (neuer Test im `describe('B4 aggregates')`-Block)

**Interfaces:**
- Consumes: `REVENUE_STATUS_SQL` aus Task 1.
- Produces: `SalesDailyPoint { day: string; revenueNet: number; orders: number; cancelledRevenue: number }`. `salesDailySeries(range, channel?)` liefert je Tag Umsatz (`<> 'storniert'`), Belegzahl und stornierten Umsatz.

- [ ] **Step 1: Failing test**

Im `describe('B4 aggregates')`-Block (nach dem storniert-Test aus Task 1) ergänzen. `salesDailySeries` in den Import aus `@/verkauf/repository` aufnehmen (Zeile 8-11 der Testdatei):

```ts
  it('salesDailySeries: Storno erhöht cancelledRevenue, nicht revenueNet, am Bestelltag', async () => {
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 5, unitPrice: 10 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'storniert');

    const series = await salesDailySeries(range);
    const total = series.reduce((s, p) => s + p.cancelledRevenue, 0);
    expect(total).toBeGreaterThanOrEqual(50);   // enthält die 5×10 Stornierung
    // stornierter Beleg fließt nicht in revenueNet
    for (const p of series) expect(p.revenueNet).toBeGreaterThanOrEqual(0);
  });
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npx vitest run tests/verkauf/repository.test.ts -t "salesDailySeries"`
Expected: FAIL — `cancelledRevenue` fehlt auf den Punkten (bzw. Import schlägt fehl).

- [ ] **Step 3: Interface + Funktion ersetzen**

In `src/verkauf/repository.ts` (344-358):

```ts
export interface SalesDailyPoint { day: string; revenueNet: number; orders: number; cancelledRevenue: number }

// Übersichts-Kurven: Umsatz, Belegzahl und stornierter Umsatz je Tag (nach Bestelldatum).
export async function salesDailySeries(range: DateRange, channel?: OrderChannel): Promise<SalesDailyPoint[]> {
  const r = await pool.query(
    `SELECT COALESCE(o.placed_at, o.created_at)::date::text AS day,
            COALESCE(SUM(l.quantity * l.unit_price) FILTER (WHERE ${REVENUE_STATUS_SQL}), 0)::float8 AS revenue,
            (COUNT(DISTINCT o.id) FILTER (WHERE ${REVENUE_STATUS_SQL}))::int AS orders,
            COALESCE(SUM(l.quantity * l.unit_price) FILTER (WHERE o.status = 'storniert'), 0)::float8 AS cancelled
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id = o.id
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND ($3::text IS NULL OR o.channel = $3)
      GROUP BY day ORDER BY day`, [range.start, range.end, channel ?? null]);
  return r.rows.map((x: any) => ({
    day: x.day, revenueNet: Number(x.revenue), orders: x.orders, cancelledRevenue: Number(x.cancelled),
  }));
}
```

- [ ] **Step 4: Tests ausführen — grün**

Run: `npx vitest run tests/verkauf/repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/verkauf/repository.ts tests/verkauf/repository.test.ts
git commit -m "feat(verkauf): salesDailySeries liefert cancelledRevenue je Tag"
```

---

### Task 3: Restliche Aggregate auf dieselbe Basis (channelSummary, revenueByDay, topProducts, ecomSalesFacts)

**Files:**
- Modify: `src/verkauf/repository.ts` — `topProducts:323`, `revenueByDay:338`, `channelSummary:484,492,507`, `ecomSalesFacts:439,447,457`
- Test: `tests/verkauf/repository.test.ts` (neuer Test für ecomSalesFacts) + Verifikation `tests/verkauf/channel-summary.test.ts`

**Interfaces:**
- Consumes: `REVENUE_STATUS_SQL` aus Task 1.
- Produces: keine Signaturänderung — dieselben Funktionen, nur Umsatz-/Marge-Basis jetzt `<> 'storniert'` (Angebote zählen mit, Stornos raus).

- [ ] **Step 1: Failing test für Angebots-Inklusion (channelSummary + ecomSalesFacts)**

`ecomSalesFacts` in den Import aus `@/verkauf/repository` aufnehmen (`channelSummary` ist bereits importiert). Test im `describe('B4 aggregates')`-Block ergänzen. `b2b_portal` startet als `angebot` — der Delta unterscheidet alte (0) von neuer (+30) Basis:

```ts
  it('Angebote zählen jetzt in channelSummary und ecomSalesFacts', async () => {
    const beforeCh = (await channelSummary(range)).find((c) => c.channel === 'b2b_portal')!;
    const beforeFacts = await ecomSalesFacts(range, 'b2b_portal');
    const o = await createOrder({          // b2b_portal → Status 'angebot'
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 3, unitPrice: 10 }],
    });
    orderIds.push(o.id);
    const afterCh = (await channelSummary(range)).find((c) => c.channel === 'b2b_portal')!;
    const afterFacts = await ecomSalesFacts(range, 'b2b_portal');
    expect(afterCh.revenueNet - beforeCh.revenueNet).toBeCloseTo(30);    // Angebot zählt jetzt mit
    expect(afterFacts.revenue - beforeFacts.revenue).toBeCloseTo(30);
  });
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npx vitest run tests/verkauf/repository.test.ts -t "Angebote zählen jetzt"`
Expected: FAIL — beide Deltas sind auf dem alten Code `0`, weil `channelSummary`/`ecomSalesFacts` `angebot` noch über `NOT IN ('angebot','storniert')` herausfiltern.

- [ ] **Step 3: Alle sechs Prädikate ersetzen**

Jeweils `AND o.status NOT IN ('angebot','storniert')` durch `AND ${REVENUE_STATUS_SQL}` ersetzen an:
- `topProducts` (Zeile 323)
- `revenueByDay` (Zeile 338)
- `channelSummary` — drei Vorkommen: Umsatz-Query (484), Kosten-Query (492), EK-Query (507)
- `ecomSalesFacts` — drei Vorkommen: Haupt-Aggregat (439), `active`-CTE (447), `life`-CTE (457)

Beispiel `channelSummary` Umsatz-Query:

```ts
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND ${REVENUE_STATUS_SQL}
      GROUP BY o.channel`, [range.start, range.end]);
```

`marginTotals` braucht **keine** Änderung (leitet aus `channelSummary` ab).

- [ ] **Step 4: Tests ausführen — grün**

Run: `npx vitest run tests/verkauf/repository.test.ts tests/verkauf/channel-summary.test.ts`
Expected: PASS. Die channel-summary-Tests sind delta-basiert auf `auftrag`-Belegen und bleiben grün; nur ihre Inline-Kommentare zur „angebot wird herausgefiltert"-Logik sind fachlich veraltet (nicht Teil der Assertions, nicht anfassen).

- [ ] **Step 5: Commit**

```bash
git add src/verkauf/repository.ts tests/verkauf/repository.test.ts
git commit -m "feat(verkauf): channelSummary/revenueByDay/topProducts/ecomSalesFacts auf <> storniert"
```

---

### Task 4: `'pct'`-Format für die KPI-Kurve

**Files:**
- Modify: `src/components/charts/KpiLineChart.tsx:4,9-11,27`
- Modify: `src/components/KpiTrendRow.tsx:14`

**Interfaces:**
- Consumes: `pct` aus `chart-style` (bereits exportiert: `pct = (n) => '${de1.format(n)} %'`, erwartet den Prozentwert, z. B. `4.2` für 4,2 %).
- Produces: `KpiLineChart` und `KpiTrendItem.format` akzeptieren `'num' | 'eur' | 'pct'`.

- [ ] **Step 1: `KpiLineChart` um `'pct'` erweitern**

In `src/components/charts/KpiLineChart.tsx`:
- Import (Zeile 4) `pct` ergänzen:
```ts
import { BRAND, MUTED, TICK, TOOLTIP_LABEL_STYLE, num, eur, pct } from './chart-style';
```
- Signatur + `fmt` (Zeile 9-11):
```ts
export function KpiLineChart({ title, series, format = 'num' }:
  { title: string; series: SeriesPoint[]; format?: 'num' | 'eur' | 'pct' }) {
  const fmt = format === 'eur' ? eur : format === 'pct' ? pct : num;
```

- [ ] **Step 2: `KpiTrendItem.format` erweitern**

In `src/components/KpiTrendRow.tsx` Zeile 14:
```ts
  format?: 'num' | 'eur' | 'pct';       // Achsen-/Tooltip-Format der Kurve
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler in den beiden Dateien.

- [ ] **Step 4: Commit**

```bash
git add src/components/charts/KpiLineChart.tsx src/components/KpiTrendRow.tsx
git commit -m "feat(charts): pct-Format für KPI-Verlaufskurve"
```

---

### Task 5: Übersicht — Werte auf neuer Basis + Stornoquote-Kachel

**Files:**
- Modify: `src/app/(shell)/verkauf/page.tsx:8,20-34`

**Interfaces:**
- Consumes: `salesTotals` (Task 1: `revenueNet`, `orders`, `avgOrderValueNet`, `openOffers`, `cancelledRevenue`, `stornoQuote`), `salesDailySeries` (Task 2: `cancelledRevenue`), `KpiTrendItem.format: 'pct'` (Task 4), `pct` aus `chart-style`.

- [ ] **Step 1: `pct`-Import ergänzen**

In `src/app/(shell)/verkauf/page.tsx` unter die bestehenden Imports:

```ts
import { pct } from '@/components/charts/chart-style';
```

- [ ] **Step 2: Stornoquote-Serie berechnen + Kachel ergänzen**

Den Block ab Zeile 21 (nach `const bucket = pickBucket(range);`) erweitern und die `items`-Liste ersetzen:

```ts
  const bucket = pickBucket(range);
  const revenueSeries = bucketSum(daily.map((d) => ({ date: d.day, value: d.revenueNet })), bucket);
  const ordersSeries = bucketSum(daily.map((d) => ({ date: d.day, value: d.orders })), bucket);
  const cancelledSeries = bucketSum(daily.map((d) => ({ date: d.day, value: d.cancelledRevenue })), bucket);
  const ordersByDate = new Map(ordersSeries.map((p) => [p.date, p.value]));
  const cancelledByDate = new Map(cancelledSeries.map((p) => [p.date, p.value]));
  const avgSeries = revenueSeries.map((r) => {
    const o = ordersByDate.get(r.date) ?? 0;
    return { date: r.date, value: o > 0 ? r.value / o : 0 };
  });
  const stornoSeries = revenueSeries.map((r) => {
    const c = cancelledByDate.get(r.date) ?? 0;
    const base = r.value + c;
    return { date: r.date, value: base > 0 ? (c / base) * 100 : 0 };
  });

  const items: KpiTrendItem[] = [
    { key: 'umsatz', label: 'Umsatz', value: eur(totals.revenueNet), anno: 'NETTO · OHNE MWST', series: revenueSeries, format: 'eur' },
    { key: 'sales', label: 'Sales', value: String(totals.orders), series: ordersSeries, format: 'num' },
    { key: 'avg', label: 'Ø Warenkorb', value: eur(totals.avgOrderValueNet), anno: 'NETTO · OHNE MWST', series: avgSeries, format: 'eur' },
    { key: 'storno', label: 'Stornoquote', value: pct(totals.stornoQuote * 100), anno: 'ANTEIL AM UMSATZVOLUMEN',
      series: stornoSeries, format: 'pct', hint: `${eur(totals.cancelledRevenue)} storniert` },
    { key: 'angebote', label: 'Offene Angebote', value: String(totals.openOffers) },
  ];
```

> Hinweis zur Spec-Umsetzung: Die „absolute stornierte Summe" wird als dauerhaft sichtbarer `hint` auf der Kachel gezeigt (statt als Custom-Tooltip in der geteilten `KpiLineChart`) — bewusst simpel gehalten, ohne die gemeinsame Chart-Komponente zu verändern. Die Formel steht in der Hilfe (Task 7).

- [ ] **Step 3: Grid für 5 Kacheln prüfen**

Der Default in `KpiTrendRow` ist `lg:grid-cols-4`. Bei 5 Kacheln umbricht die fünfte sauber in die nächste Zeile — akzeptabel und keine Änderung nötig. (Falls eine 5-Spalten-Reihe gewünscht ist, kann `gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-5"` an `<KpiTrendRow>` übergeben werden — optional, nicht Teil dieses Tasks.)

- [ ] **Step 4: Typecheck + Build**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler.

- [ ] **Step 5: Commit**

```bash
git add "src/app/(shell)/verkauf/page.tsx"
git commit -m "feat(verkauf): Übersicht auf neue Umsatzbasis + Stornoquote-Kachel mit Verlauf"
```

---

### Task 6: Kanal-Detailseite — StatTiles neu + Stornoquote-Kennzahl

**Files:**
- Modify: `src/components/KanalSalesBoard.tsx` (Import `eur` + `StatTile`-Reihe)

**Interfaces:**
- Consumes: `SalesTotals` (bereits als Prop `totals` übergeben; enthält nach Task 1 `stornoQuote`, `cancelledRevenue`). Die Kanal-Page (`kanal/[channel]/page.tsx`) ruft `salesTotals(range, channel)` bereits auf — **keine** Page-Änderung nötig.

- [ ] **Step 1: `pct` importieren**

In `src/components/KanalSalesBoard.tsx` den Import erweitern:

```ts
import { eur } from '@/verkauf/format';
import { pct } from '@/components/charts/chart-style';
```

- [ ] **Step 2: Stornoquote-StatTile ergänzen**

Die StatTile-Reihe im `KanalSalesBoard`-Return (aktuell drei Tiles) ersetzen:

```tsx
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Umsatz" value={eur(totals.revenueNet)} anno="NETTO · OHNE MWST" />
        <StatTile label="Belege" value={String(totals.orders)} />
        <StatTile label="Ø Warenkorb" value={eur(totals.avgOrderValueNet)} anno="NETTO · OHNE MWST" />
        <StatTile label="Stornoquote" value={pct(totals.stornoQuote * 100)}
          anno={`${eur(totals.cancelledRevenue)} STORNIERT`} />
      </div>
```

Der bestehende „Umsatzverlauf"-Chart bleibt unverändert (eine Umsatzreihe, jetzt auf neuer Basis durch Task 3). Der `RevenueChart`-Titel `"Umsatzverlauf · netto"` bleibt (netto = ohne MwSt, weiterhin korrekt).

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine neuen Fehler.

- [ ] **Step 4: Commit**

```bash
git add src/components/KanalSalesBoard.tsx
git commit -m "feat(verkauf): Kanal-Detail zeigt Stornoquote-StatTile"
```

---

### Task 7: Hilfe-/Doku-Pflege

**Files:**
- Modify: `src/kpi/help.ts` (Einträge `revenue`, `aov`)
- Modify: `src/lib/help/content.ts` (Verkauf-Seite, Zeilen ~153, 157)
- Test: `tests/lib/help-content.test.ts` (Registry-Test, muss grün bleiben)

**Interfaces:**
- Keine Code-Interfaces — reine Doku. Muss inhaltlich zur neuen Umsatzdefinition passen (CLAUDE.md-Pflicht).

- [ ] **Step 1: `src/kpi/help.ts` — Umsatz/AOV-Wortlaut**

`revenue` und `aov` an die neue Definition anpassen:

```ts
  aov: {
    formula: 'Netto-Umsatz (ohne MwSt) ÷ Käufe — Umsatz = alle Belege außer storniert, inkl. Angebote.',
    source: 'Shop (WooCommerce) → orders/order_lines (nicht mehr GA4).',
  },
  revenue: {
    formula: 'Summe des Netto-Umsatzes (ohne MwSt) aller Belege außer storniert (inkl. Angebote) im Zeitraum.',
    source: 'Shop (WooCommerce) → orders/order_lines (nicht mehr GA4).',
  },
```

- [ ] **Step 2: `src/lib/help/content.ts` — Verkauf-Startseite**

Den Umsatz-Satz (Zeile ~153) und den Aufzählungspunkt (Zeile ~157) ersetzen:

```ts
          { type: 'p', text: 'Die Verkauf-Startseite zeigt für den gewählten Zeitraum (7/30/90 Tage) Umsatz, Anzahl Belege (Sales), durchschnittlichen Warenkorbwert, die Stornoquote und offene Angebote. Alle Beträge sind netto (ohne MwSt).' },
```

und im `list`-Block den bisherigen Umsatz-Punkt ersetzen:

```ts
            'Umsatz zählt alle Belege außer stornierten (inkl. Angebote und Aufträge) und korrigiert sich automatisch, wenn Stornos/Abbrüche nachträglich reinkommen. Die Stornoquote (stornierter Umsatz ÷ platziertes Volumen) ist eine eigene, anklickbare Kennzahl mit Verlauf.',
```

- [ ] **Step 3: Registry-/Doku-Test ausführen**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (jede App hat weiterhin ihre Hilfeseite; nur Textänderungen).

- [ ] **Step 4: Commit**

```bash
git add src/kpi/help.ts src/lib/help/content.ts
git commit -m "docs(verkauf): Hilfe an storno-bereinigte Umsatzdefinition + Stornoquote angepasst"
```

---

### Task 8: Gesamtverifikation + Deploy

**Files:** keine — Verifikation.

- [ ] **Step 1: Volle relevante Testsuite (gegen frische Sibling-DB)**

Run: `npx vitest run tests/verkauf tests/lib/help-content.test.ts`
Expected: PASS. (Die 16 RLS-Fehler in `tests/db/rls.test.ts` auf diesem Host sind bekannt/erwartet und nicht Teil dieses Laufs.)

- [ ] **Step 2: Typecheck gesamt**

Run: `npx tsc --noEmit`
Expected: sauber.

- [ ] **Step 3: Deploy auf den VPS**

Deploy nach Projektregel auf `root@194.164.204.249` (https://budp.lumeapps.de). **Kein** lokaler App-Start.

- [ ] **Step 4: Browser-Verifikation (Claude in Chrome / DevTools)**

- `/verkauf`: Umsatz-Zahl enthält jetzt Angebote (höher als zuvor), fünfte Kachel „Stornoquote" ist sichtbar; Klick auf Umsatz zeigt die Umsatzkurve, Klick auf Stornoquote die Prozentkurve; `hint` zeigt die absolute stornierte Summe.
- `/verkauf/kanal/shop`: Stornoquote-StatTile vorhanden; Umsatzverlauf plausibel.
- `/verkauf/dashboard`: Umsatz/AOV konsistent mit der Übersicht (gleiche Basis).
- Dark-Mode prüfen: Kurven/Kacheln in warmem neutral, Akzent über `--accent`.

- [ ] **Step 5: Abschluss-Commit (falls Verifikations-Fixes)**

```bash
git add -A
git commit -m "fix(verkauf): Nachjustierung aus Browser-Verifikation"
```

---

## Self-Review

**Spec coverage:**
- Umsatzdefinition `<> 'storniert'` inkl. Angebote, ohne MwSt → Task 1/2/3.
- As-of/self-correcting (Live-Status) → Task 1 (Kommentar + Query liest aktuellen Status).
- Retoure zählt mit → durch `<> 'storniert'` automatisch (Task 1); bestehender Retoure-Test bleibt grün.
- Eine Umsatzkurve (kein Brutto/Netto-Split) → Task 5/6 nutzen einlinige `KpiLineChart`/Bar-Chart.
- Stornoquote als eigene KPI + Verlauf (Übersicht) + StatTile (Kanal) → Task 5/6.
- Frontend-Hinweis zur Stornoquote → Task 5 (`hint` + `anno`) + Task 7 (Formel in Hilfe).
- Überall gleiche Basis inkl. Dashboard → Task 3 (`ecomSalesFacts`, `channelSummary`→`marginTotals`).
- Connector-/GA4-Divergenz bewusst ausgelassen → nicht als Task (Spec „gesondert zu klären").
- Doku-Pflicht (CLAUDE.md) → Task 7.
- Retroaktiver Verlauf nach Bestelldatum → `COALESCE(placed_at, created_at)` in allen Serien (Task 2/3).

**Placeholder scan:** Keine TBD/TODO; jeder Code-Step zeigt vollständigen Code oder exakte Ersetzung.

**Type consistency:** `SalesTotals` (Task 1) mit `cancelledRevenue`/`stornoQuote` wird in Task 5/6 gelesen; `SalesDailyPoint.cancelledRevenue` (Task 2) in Task 5 verwendet; `format: 'pct'` (Task 4) in Task 5 genutzt; `REVENUE_STATUS_SQL` (Task 1) in Task 2/3 referenziert. Konsistent.
