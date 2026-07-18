# Verfügbarkeit — Warenwert-KPI, Meldebestand 90-Tage, KPI-Fokus — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verfügbarkeit-Übersicht bekommt eine „Warenwert im Lager"-KPI mit Verlauf (statt „Unter Meldebestand"), die „Reichweite < 90 Tage"-KPI verlinkt zur Meldebestand-Seite, deren Logik auf dieselbe 90-Tage-Reichweite umgestellt wird, und der aktive KPI-Zustand wird deutlicher.

**Architecture:** Datenschicht (`src/verfuegbarkeit/history.ts` + `repository.ts`) liefert neue Aggregate; `KpiTrendRow` erhält Link- und Hinweis-Modus + stärkeren Fokus; Bestandsgrößen werden mit neuem `bucketLast` gebündelt (nicht summiert). Die Meldebestand-Liste spiegelt exakt die „kritisch"-Formel des Rollups, sodass KPI-Zahl = Zeilenzahl. Datenschicht + zugehörige UI werden je Task zusammen geändert, damit jeder Commit `tsc`-clean baut.

**Tech Stack:** Next.js App-Router (Server + Client Components), TypeScript, recharts, Tailwind (ERP-Designsystem), Vitest, Postgres (`pg`).

## Global Constraints

- Designsystem (bindend): Akzent nur via `--accent`/`var(--brand)`; nur warme `neutral`-Palette; `.anno` ist die **einzige** erlaubte Uppercase-Stilisierung (Hinweistexte NICHT in `.anno`); **Dark Mode Pflicht** (`dark:`-Varianten).
- Charts nur mit **recharts** + `src/components/charts/chart-style.ts`.
- **Bestandsgrößen** (Gesamtbestand, Warenwert) beim Bündeln mit `bucketLast` (letzter Wert je Periode) — **nicht** `bucketSum`. Flüsse (Umsatz/Sales) bleiben `bucketSum`.
- **Warenwert = EK**: `Σ(quantity_on_hand × COALESCE(purchase_price,0))`; NULL-EK zählt 0; `ekUnvollstaendig`-Hinweis, wenn bestandsführende Varianten ohne EK.
- **Meldebestand-Kriterium = Reichweite < 90 Tage**: `on_hand < Σ verkaufte Menge der letzten 90 Tage` — **identische Aggregation wie `categoryRollup`s „kritisch"** (per-Variante `on_hand` über alle Lager, `sold`-Fenster `CURRENT_DATE - 90`, `status NOT IN ('angebot','storniert')`), damit `listReorderSuggestions().length === Σ anzahlKritisch`. `reorder_point` bleibt im Schema, wird für die Liste aber nicht genutzt.
- `suggestedQty = max(1, units90d − on_hand)`.
- `KpiTrendItem`: `href` und `series` schließen sich gegenseitig aus; `href`-Kachel navigiert (kein Akkordeon).
- Feld `anzahlUnterMeldebestand`/`unterMeldebestand` wird vollständig entfernt (Type, Query, KPI, Rollup-Spalte, Tests).
- DB-Tests laufen auf der Test-DB: `set -a; source .env; set +a; export DATABASE_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/bryx_kosten_test";process.stdout.write(u.toString())')` — dann `npx vitest run <file>`. Reine Tests (series) brauchen das nicht.
- `npx tsc --noEmit` nach jeder .ts/.tsx-Task (vitest typcheckt nicht); **jeder Commit muss tsc-clean sein**.
- Deployment nur auf VPS/bryx-test nach Freigabe (Controller). `git add` nur die gelisteten Pfade.
- Hilfe-Modul (`content.ts`) mitpflegen.

---

## File Structure

**Geändert:**
- `src/lib/series.ts` — `bucketLast` ergänzen.
- `src/components/KpiTrendRow.tsx` — `href`/`hint`/Fokus.
- `src/verfuegbarkeit/history.ts` — `warenwertKpi`, `warenwertSeries`; `categoryRollup`/`dashboardKpis` ohne `unterMeldebestand`.
- `src/verfuegbarkeit/types.ts` — `CategoryRollupRow` (Feld raus), `ReorderSuggestion` (Felder umgestellt).
- `src/app/(shell)/verfuegbarkeit/page.tsx` + `src/components/VerfuegbarkeitDashboard.tsx` — neue KPIs, Rollup-Spalte weg.
- `src/verfuegbarkeit/repository.ts` — `listReorderSuggestions` auf Reichweite<90.
- `src/components/MeldebestandListe.tsx` — neue Spalten.
- `src/lib/help/content.ts` — Doku.
- Tests: `tests/lib/series.test.ts`, `tests/verfuegbarkeit/{category-rollup,dashboard-kpis,repository}.test.ts` anpassen; `tests/verfuegbarkeit/warenwert.test.ts` neu.

---

## Task 1: `bucketLast`-Helfer (TDD, rein)

**Files:**
- Modify: `src/lib/series.ts`
- Test: `tests/lib/series.test.ts`

**Interfaces:**
- Produces: `bucketLast(points: SeriesPoint[], bucket: 'day'|'week'|'month'): SeriesPoint[]` — pro Bucket der chronologisch **letzte** Wert; Rückgabe-`date` = Bucket-Schlüssel (wie `bucketSum`); chronologisch sortiert.

- [ ] **Step 1: Failing test.** In `tests/lib/series.test.ts` den vorhandenen Import um `bucketLast` erweitern (`import { pickBucket, bucketSum, bucketLast } from '@/lib/series';`) und am Dateiende anhängen:

```ts
describe('bucketLast', () => {
  const pts = [
    { date: '2026-06-01', value: 100 }, // Montag
    { date: '2026-06-03', value: 120 }, // Mittwoch (gleiche Woche) → jüngster der Woche
    { date: '2026-06-08', value: 90 },  // Montag darauf
  ];
  it('day: unverändert', () => {
    expect(bucketLast(pts, 'day')).toEqual(pts);
  });
  it('week: letzter Wert je ISO-Woche (Montag als Schlüssel)', () => {
    expect(bucketLast(pts, 'week')).toEqual([
      { date: '2026-06-01', value: 120 },
      { date: '2026-06-08', value: 90 },
    ]);
  });
  it('month: letzter Wert je Monat (Monatserster als Schlüssel)', () => {
    expect(bucketLast([{ date: '2026-06-10', value: 5 }, { date: '2026-06-30', value: 8 }], 'month')).toEqual([
      { date: '2026-06-01', value: 8 },
    ]);
  });
  it('leere Eingabe → leer', () => {
    expect(bucketLast([], 'week')).toEqual([]);
  });
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx vitest run tests/lib/series.test.ts`
Expected: FAIL (`bucketLast` nicht exportiert).

- [ ] **Step 3: Implementierung** — in `src/lib/series.ts` nach `bucketSum` einfügen:

```ts
export function bucketLast(points: SeriesPoint[], bucket: Bucket): SeriesPoint[] {
  const acc = new Map<string, { date: string; value: number }>();
  for (const p of points) {
    const k = bucketKey(p.date, bucket);
    const cur = acc.get(k);
    if (!cur || p.date > cur.date) acc.set(k, { date: p.date, value: p.value });
  }
  return [...acc.entries()]
    .map(([key, v]) => ({ date: key, value: v.value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 4: Test grün**

Run: `npx vitest run tests/lib/series.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series.ts tests/lib/series.test.ts
git commit -m "feat(series): bucketLast — letzter Wert je Bucket (fuer Bestandsgroessen)"
```

---

## Task 2: `KpiTrendRow` — Fokus-State, `href`-Link, `hint`

**Files:**
- Modify: `src/components/KpiTrendRow.tsx`

**Interfaces:**
- Produces: `KpiTrendItem` zusätzlich `href?: string` und `hint?: string`. Kachel mit `href` wird ein `next/link`-Link (navigiert, kein Akkordeon). `hint` rendert dezent unter dem Wert. Aktiver Zustand deutlich sichtbar.

- [ ] **Step 1: Komponente ersetzen** — `src/components/KpiTrendRow.tsx` vollständig:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ChartCard } from '@/components/charts/ChartCard';
import { KpiLineChart } from '@/components/charts/KpiLineChart';
import type { SeriesPoint } from '@/verfuegbarkeit/types';

export interface KpiTrendItem {
  key: string;
  label: string;
  value: string;
  anno?: string;
  series?: SeriesPoint[];       // undefined ⇒ Kachel nicht klickbar
  format?: 'num' | 'eur';       // Achsen-/Tooltip-Format der Kurve
  href?: string;                // Kachel navigiert statt Kurve (schließt series aus)
  hint?: string;                // dezenter Zusatztext unter dem Wert
}

export function KpiTrendRow({ items, gridClassName }:
  { items: KpiTrendItem[]; gridClassName?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  const active = items.find((i) => i.key === open && i.series);

  return (
    <div className="space-y-3">
      <div className={gridClassName ?? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4'}>
        {items.map((i) => {
          const clickable = !!i.series;
          const isOpen = open === i.key && clickable;
          const hover = (clickable || i.href) ? 'transition hover:ring-2 hover:ring-accent/40' : '';
          const activeCls = isOpen
            ? 'ring-2 ring-accent ring-offset-2 ring-offset-neutral-0 dark:ring-offset-neutral-950 bg-accent/10 dark:bg-accent/15'
            : '';
          const body = (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{i.label}</p>
              <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{i.value}</p>
              {i.anno && <p className="anno mt-1 text-neutral-500">{i.anno}</p>}
              {i.hint && <p className="mt-1 text-xs text-neutral-500">{i.hint}</p>}
            </>
          );
          return (
            <ChartCard key={i.key} className={`${hover} ${activeCls}`}>
              {i.href ? (
                <Link href={i.href} className="block w-full cursor-pointer text-left">{body}</Link>
              ) : clickable ? (
                <button type="button" aria-expanded={isOpen}
                  onClick={() => setOpen(isOpen ? null : i.key)}
                  className="w-full cursor-pointer text-left">
                  {body}
                </button>
              ) : body}
            </ChartCard>
          );
        })}
      </div>
      {active && (
        <KpiLineChart title={`${active.label} · Verlauf`} series={active.series!} format={active.format ?? 'num'} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (bestehende Nutzer in Verkauf/Finanzen setzen `href`/`hint` nicht — abwärtskompatibel).

- [ ] **Step 3: Commit**

```bash
git add src/components/KpiTrendRow.tsx
git commit -m "feat(kpi): KpiTrendRow — Fokus-State, href-Link-Modus, hint-Text"
```

---

## Task 3: Warenwert-KPI + Verlauf; „Unter Meldebestand" entfernen (Daten + Dashboard)

**Files:**
- Modify: `src/verfuegbarkeit/history.ts`, `src/verfuegbarkeit/types.ts` (`CategoryRollupRow`)
- Modify: `src/app/(shell)/verfuegbarkeit/page.tsx`, `src/components/VerfuegbarkeitDashboard.tsx`
- Test: `tests/verfuegbarkeit/warenwert.test.ts` (neu), `tests/verfuegbarkeit/category-rollup.test.ts`, `tests/verfuegbarkeit/dashboard-kpis.test.ts` (anpassen)

**Interfaces:**
- Consumes: `bucketLast` (Task 1), `KpiTrendItem.href`/`hint` (Task 2), `DataTable`/`Column`.
- Produces: `warenwertKpi(): Promise<{ warenwert: number; ekUnvollstaendig: boolean }>`; `warenwertSeries(range: DateRange): Promise<SeriesPoint[]>`; `dashboardKpis(): Promise<{ gesamtbestand: number; kritisch: number }>`; `CategoryRollupRow = { category; variantCount; gesamtbestand; anzahlKritisch }`.

- [ ] **Step 1: `CategoryRollupRow` anpassen** — `src/verfuegbarkeit/types.ts`:

```ts
export interface CategoryRollupRow {
  category: string; variantCount: number; gesamtbestand: number; anzahlKritisch: number;
}
```

- [ ] **Step 2: `categoryRollup` — Unter-Meldebestand-Zeile entfernen.** In `src/verfuegbarkeit/history.ts` den `categoryRollup`-SELECT auf folgenden Block bringen (die `unter_meldebestand`-FILTER-Zeile streichen) …

```ts
     SELECT COALESCE(p.category, 'Ohne Kategorie') AS category,
            COUNT(*)::int AS variant_count,
            COALESCE(SUM(st.on_hand), 0)::int AS gesamtbestand,
            COUNT(*) FILTER (WHERE COALESCE(sd.units, 0) > 0
                              AND COALESCE(st.on_hand, 0) < sd.units)::int AS kritisch
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN stock st ON st.variant_id = v.id
       LEFT JOIN sold sd ON sd.variant_id = v.id
      GROUP BY COALESCE(p.category, 'Ohne Kategorie')
      ORDER BY category`);
```

… und das Mapping:

```ts
  return r.rows.map((x: {
    category: string; variant_count: number; gesamtbestand: number; kritisch: number;
  }) => ({
    category: x.category, variantCount: Number(x.variant_count),
    gesamtbestand: Number(x.gesamtbestand),
    anzahlKritisch: Number(x.kritisch),
  }));
```

- [ ] **Step 3: `dashboardKpis` anpassen** — `src/verfuegbarkeit/history.ts`:

```ts
export async function dashboardKpis(): Promise<{ gesamtbestand: number; kritisch: number }> {
  const rows = await categoryRollup();
  return rows.reduce((a, r) => ({
    gesamtbestand: a.gesamtbestand + r.gesamtbestand,
    kritisch: a.kritisch + r.anzahlKritisch,
  }), { gesamtbestand: 0, kritisch: 0 });
}
```

- [ ] **Step 4: Warenwert-Funktionen ergänzen** — `src/verfuegbarkeit/history.ts` (z.B. nach `stockTotalSeries`):

```ts
// Lagerwert zu Einkaufskosten: Σ(Menge × EK). NULL-EK zählt 0; ekUnvollstaendig
// meldet, ob bestandsführende Varianten ohne EK existieren (vgl. Verkauf).
export async function warenwertKpi(): Promise<{ warenwert: number; ekUnvollstaendig: boolean }> {
  const r = await pool.query(
    `SELECT COALESCE(SUM(s.quantity_on_hand * COALESCE(v.purchase_price, 0)), 0)::float8 AS warenwert,
            COALESCE(bool_or(v.purchase_price IS NULL) FILTER (WHERE s.quantity_on_hand > 0), false) AS ek_unvollstaendig
       FROM stock_levels s JOIN product_variants v ON v.id = s.variant_id`);
  return { warenwert: Number(r.rows[0].warenwert), ekUnvollstaendig: r.rows[0].ek_unvollstaendig };
}

// Warenwert-Verlauf: aktueller EK × historische Menge je Snapshot-Tag (keine EK-Historie).
export async function warenwertSeries(range: DateRange): Promise<SeriesPoint[]> {
  const r = await pool.query(
    `SELECT s.snapshot_date::text AS date,
            COALESCE(SUM(s.quantity_on_hand * COALESCE(v.purchase_price, 0)), 0)::float8 AS value
       FROM stock_snapshots s JOIN product_variants v ON v.id = s.variant_id
      WHERE s.snapshot_date BETWEEN $1 AND $2
      GROUP BY s.snapshot_date ORDER BY s.snapshot_date`, [range.start, range.end]);
  return r.rows.map((x: { date: string; value: number }) => ({ date: x.date, value: Number(x.value) }));
}
```

(Hinweis: `DateRange` ist in `history.ts` bereits importiert; `pool`, `SeriesPoint` ebenfalls.)

- [ ] **Step 5: `page.tsx` ersetzen** — `src/app/(shell)/verfuegbarkeit/page.tsx`:

```tsx
import { categoryRollup, dashboardKpis, stockTotalSeries, warenwertKpi, warenwertSeries } from '@/verfuegbarkeit/history';
import { resolveRange } from '@/lib/range';
import { pickBucket, bucketLast } from '@/lib/series';
import { Filters } from '@/components/Filters';
import { VerfuegbarkeitDashboard } from '@/components/VerfuegbarkeitDashboard';

export const dynamic = 'force-dynamic';

export default async function VerfuegbarkeitUebersichtPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end, { start: searchParams.start, end: searchParams.end });
  const [kpis, rollup, stock, warenwert, warenwertPts] = await Promise.all([
    dashboardKpis(), categoryRollup(), stockTotalSeries(range), warenwertKpi(), warenwertSeries(range),
  ]);
  const bucket = pickBucket(range);
  const stockSeries = bucketLast(stock, bucket);
  const warenwertSeriesBucketed = bucketLast(warenwertPts, bucket);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Übersicht</h2>
        <Filters range={range} basePath="/verfuegbarkeit" />
      </div>
      <VerfuegbarkeitDashboard
        kpis={kpis} rollup={rollup} stockSeries={stockSeries}
        warenwert={warenwert.warenwert} ekUnvollstaendig={warenwert.ekUnvollstaendig}
        warenwertSeries={warenwertSeriesBucketed}
      />
    </div>
  );
}
```

- [ ] **Step 6: `VerfuegbarkeitDashboard.tsx` ersetzen**:

```tsx
'use client';
import Link from 'next/link';
import { num, eur } from '@/components/charts/chart-style';
import { KpiTrendRow, type KpiTrendItem } from '@/components/KpiTrendRow';
import { DataTable, type Column } from '@/components/DataTable';
import type { CategoryRollupRow, SeriesPoint } from '@/verfuegbarkeit/types';

export function VerfuegbarkeitDashboard({ kpis, rollup, stockSeries, warenwert, ekUnvollstaendig, warenwertSeries }: {
  kpis: { gesamtbestand: number; kritisch: number };
  rollup: CategoryRollupRow[];
  stockSeries: SeriesPoint[];
  warenwert: number;
  ekUnvollstaendig: boolean;
  warenwertSeries: SeriesPoint[];
}) {
  const items: KpiTrendItem[] = [
    { key: 'gesamt', label: 'Gesamtbestand', value: num(kpis.gesamtbestand), series: stockSeries, format: 'num' },
    { key: 'warenwert', label: 'Warenwert im Lager', value: eur(warenwert), series: warenwertSeries, format: 'eur',
      hint: ekUnvollstaendig ? 'EK unvollständig' : undefined },
    { key: 'kritisch', label: 'Reichweite < 90 Tage', value: num(kpis.kritisch), href: '/verfuegbarkeit/meldebestand' },
  ];

  const columns: Column<CategoryRollupRow>[] = [
    { key: 'category', header: 'Kategorie', sort: (r) => r.category, filter: { kind: 'text', value: (r) => r.category },
      cell: (r) => (
        <Link href={`/verfuegbarkeit/kategorie/${encodeURIComponent(r.category)}`}
          className="text-brand hover:text-brand-dark">{r.category}</Link>
      ) },
    { key: 'variantCount', header: 'Artikel', className: 'text-right tabular-nums',
      sort: (r) => r.variantCount, filter: { kind: 'number', value: (r) => r.variantCount },
      cell: (r) => num(r.variantCount) },
    { key: 'gesamtbestand', header: 'Bestand', className: 'text-right tabular-nums',
      sort: (r) => r.gesamtbestand, filter: { kind: 'number', value: (r) => r.gesamtbestand },
      cell: (r) => num(r.gesamtbestand) },
    { key: 'kritisch', header: 'Kritisch (< 90 T)', className: 'text-right tabular-nums',
      sort: (r) => r.anzahlKritisch, filter: { kind: 'number', value: (r) => r.anzahlKritisch },
      cell: (r) => <span className={r.anzahlKritisch > 0 ? 'font-semibold text-brand' : ''}>{num(r.anzahlKritisch)}</span> },
  ];

  return (
    <div className="space-y-6">
      <KpiTrendRow items={items} gridClassName="grid grid-cols-1 gap-4 sm:grid-cols-3" />
      <DataTable rows={rollup} columns={columns} rowKey={(r) => r.category}
        initialSort={{ col: 'category', dir: 'asc' }} empty="Keine Kategorien." />
    </div>
  );
}
```

- [ ] **Step 7: Tests anpassen.**

`tests/verfuegbarkeit/category-rollup.test.ts` — die `anzahlUnterMeldebestand`-Zeile entfernen (Schleife danach):

```ts
    for (const r of rows) {
      expect(typeof r.category).toBe('string');
      expect(r.variantCount).toBeGreaterThan(0);
      expect(r.gesamtbestand).toBeGreaterThanOrEqual(0);
      expect(r.anzahlKritisch).toBeLessThanOrEqual(r.variantCount);
    }
```

`tests/verfuegbarkeit/dashboard-kpis.test.ts` — `unter` aus reduce + Assertion entfernen:

```ts
  it('summiert die Rollup-Zeilen konsistent', async () => {
    const [kpis, rollup] = await Promise.all([dashboardKpis(), categoryRollup()]);
    const sum = rollup.reduce((a, r) => ({
      bestand: a.bestand + r.gesamtbestand,
      kritisch: a.kritisch + r.anzahlKritisch,
    }), { bestand: 0, kritisch: 0 });
    expect(kpis.gesamtbestand).toBe(sum.bestand);
    expect(kpis.kritisch).toBe(sum.kritisch);
  });
```

- [ ] **Step 8: Warenwert-Test (neu, invariantenbasiert)** — `tests/verfuegbarkeit/warenwert.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';
import { warenwertKpi, warenwertSeries } from '../../src/verfuegbarkeit/history';

afterAll(async () => { await pool.end(); });

describe('warenwertKpi', () => {
  it('entspricht Σ(on_hand × COALESCE(EK,0))', async () => {
    const kpi = await warenwertKpi();
    const ref = await pool.query<{ w: number }>(
      `SELECT COALESCE(SUM(s.quantity_on_hand * COALESCE(v.purchase_price,0)),0)::float8 AS w
         FROM stock_levels s JOIN product_variants v ON v.id = s.variant_id`);
    expect(kpi.warenwert).toBeCloseTo(Number(ref.rows[0].w), 2);
    expect(typeof kpi.ekUnvollstaendig).toBe('boolean');
  });
});

describe('warenwertSeries', () => {
  it('liefert eine sortierte Datum→Wert-Reihe', async () => {
    const series = await warenwertSeries({ start: '2000-01-01', end: '2999-12-31' });
    expect(Array.isArray(series)).toBe(true);
    for (const p of series) {
      expect(typeof p.date).toBe('string');
      expect(typeof p.value).toBe('number');
    }
    const dates = series.map((p) => p.date);
    expect([...dates]).toEqual([...dates].sort());
  });
});
```

- [ ] **Step 9: Tests grün + Typecheck** (Test-DB):

Run:
```bash
set -a; source .env; set +a
export DATABASE_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/bryx_kosten_test";process.stdout.write(u.toString())')
npx vitest run tests/verfuegbarkeit/warenwert.test.ts tests/verfuegbarkeit/category-rollup.test.ts tests/verfuegbarkeit/dashboard-kpis.test.ts
npx tsc --noEmit
```
Expected: alle PASS; **tsc vollständig clean** (Daten + Dashboard in einem Task).

- [ ] **Step 10: Commit**

```bash
git add src/verfuegbarkeit/history.ts src/verfuegbarkeit/types.ts \
  "src/app/(shell)/verfuegbarkeit/page.tsx" src/components/VerfuegbarkeitDashboard.tsx \
  tests/verfuegbarkeit/warenwert.test.ts tests/verfuegbarkeit/category-rollup.test.ts tests/verfuegbarkeit/dashboard-kpis.test.ts
git commit -m "feat(verfuegbarkeit): Warenwert-KPI mit Verlauf; Unter-Meldebestand entfernt; Reichweite<90 verlinkt"
```

---

## Task 4: Meldebestand = Reichweite < 90 Tage (Repository + Liste)

**Files:**
- Modify: `src/verfuegbarkeit/repository.ts` (`listReorderSuggestions`), `src/verfuegbarkeit/types.ts` (`ReorderSuggestion`)
- Modify: `src/components/MeldebestandListe.tsx`
- Test: `tests/verfuegbarkeit/repository.test.ts` (Reorder-Test umschreiben)

**Interfaces:**
- Produces: `ReorderSuggestion = { variantId; sku; productName; onHand: number; units90d: number; reichweiteTage: number | null; defaultSupplierId: string | null; defaultSupplierName: string | null; suggestedQty: number }`. `listReorderSuggestions()` filtert `on_hand < units90d` (spiegelt `categoryRollup` „kritisch"), `suggestedQty = max(1, units90d − on_hand)`.

- [ ] **Step 1: Typ anpassen** — `src/verfuegbarkeit/types.ts`, `ReorderSuggestion` ersetzen:

```ts
export interface ReorderSuggestion {
  variantId: string; sku: string; productName: string;
  onHand: number; units90d: number; reichweiteTage: number | null;
  defaultSupplierId: string | null; defaultSupplierName: string | null; suggestedQty: number;
}
```

- [ ] **Step 2: `listReorderSuggestions` ersetzen** — `src/verfuegbarkeit/repository.ts:148-166`:

```ts
export async function listReorderSuggestions(): Promise<ReorderSuggestion[]> {
  // Kriterium wie categoryRollup „kritisch": on_hand (über alle Lager) < Absatz der
  // letzten 90 Tage. Dadurch gilt: Anzahl Zeilen == Σ anzahlKritisch des Rollups.
  const r = await pool.query(
    `WITH sold AS (
       SELECT l.variant_id, SUM(l.quantity)::int AS units
         FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id
        WHERE COALESCE(o.placed_at, o.created_at)::date >= CURRENT_DATE - 90
          AND o.status NOT IN ('angebot','storniert')
        GROUP BY l.variant_id
     ),
     stock AS (
       SELECT variant_id, SUM(quantity_on_hand)::int AS on_hand FROM stock_levels GROUP BY variant_id
     )
     SELECT v.id AS variant_id, v.sku, p.name AS product_name,
            COALESCE(st.on_hand, 0)::int AS on_hand, sd.units::int AS units_90d,
            p.default_supplier_id, sup.name AS default_supplier_name
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       JOIN sold sd ON sd.variant_id = v.id
       LEFT JOIN stock st ON st.variant_id = v.id
       LEFT JOIN contacts sup ON sup.id = p.default_supplier_id
      WHERE sd.units > 0 AND COALESCE(st.on_hand, 0) < sd.units
      ORDER BY (COALESCE(st.on_hand,0)::float / NULLIF(sd.units,0)) ASC, v.sku`);
  return r.rows.map((x) => {
    const onHand = Number(x.on_hand);
    const units90d = Number(x.units_90d);
    return {
      variantId: x.variant_id, sku: x.sku, productName: x.product_name,
      onHand, units90d,
      reichweiteTage: units90d > 0 ? Math.round((onHand * 90) / units90d) : null,
      defaultSupplierId: x.default_supplier_id, defaultSupplierName: x.default_supplier_name,
      suggestedQty: Math.max(1, units90d - onHand),
    };
  });
}
```

- [ ] **Step 3: `MeldebestandListe.tsx` — Tabelle/Leerzustand ersetzen.** `openForm`/`draft`/`input`-Logik bleibt unverändert (nutzt `s.suggestedQty`). Leerzustand:

```tsx
  if (suggestions.length === 0) {
    return <p className="text-sm text-neutral-500">Kein Artikel mit Reichweite unter 90 Tagen.</p>;
  }
```

Tabelle:
```tsx
  return (
    <table className="w-full text-sm">
      <thead><tr className="anno text-left text-neutral-500">
        <th className="py-2">SKU</th><th>Artikel</th>
        <th className="text-right">Bestand</th>
        <th className="text-right">Absatz 90T</th>
        <th className="text-right">Reichweite</th>
        <th className="text-right">Vorschlag</th>
        <th></th>
      </tr></thead>
      <tbody>
        {suggestions.map((s) => (
          <tr key={s.variantId} className="border-t border-neutral-200 dark:border-neutral-800 align-top">
            <td className="py-2">{s.sku}</td>
            <td>{s.productName}</td>
            <td className="text-right tabular-nums">{s.onHand}</td>
            <td className="text-right tabular-nums text-neutral-500">{s.units90d}</td>
            <td className="text-right">
              <span className="rounded bg-danger/15 px-2 py-0.5 font-medium text-danger tabular-nums">
                {s.reichweiteTage ?? '—'} T
              </span>
            </td>
            <td className="text-right tabular-nums">{s.suggestedQty}</td>
            <td className="text-right">
              {openId === s.variantId ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={input}>
                    {suppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
                  </select>
                  <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={`${input} w-20 text-right`} />
                  <button onClick={() => draft(s)} disabled={pending}
                    className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Entwurf anlegen</button>
                </div>
              ) : (
                <button onClick={() => openForm(s)} disabled={pending}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800 disabled:opacity-50">Nachbestellung entwerfen</button>
              )}
              {openId === s.variantId && error && <p className="mt-1 text-sm text-danger">{error}</p>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
```

- [ ] **Step 4: Reorder-Test umschreiben (invariantenbasiert)** — `tests/verfuegbarkeit/repository.test.ts`. Import ergänzen (bei den bestehenden Imports):

```ts
import { categoryRollup } from '@/verfuegbarkeit/history';
```

Den Test bei `:67-73` ersetzen:

```ts
  it('listReorderSuggestions == kritisch-Zähler; suggestedQty/Reichweite konsistent', async () => {
    const [sugg, rollup] = await Promise.all([listReorderSuggestions(), categoryRollup()]);
    const kritischTotal = rollup.reduce((a, r) => a + r.anzahlKritisch, 0);
    expect(sugg.length).toBe(kritischTotal);            // KPI-Zahl == Zeilenzahl
    for (const s of sugg) {
      expect(s.onHand).toBeLessThan(s.units90d);         // Reichweite < 90 Tage
      expect(s.suggestedQty).toBe(Math.max(1, s.units90d - s.onHand));
      expect(s.reichweiteTage).toBe(Math.round((s.onHand * 90) / s.units90d));
    }
  });
```

- [ ] **Step 5: Test grün + Typecheck** (Test-DB):

Run:
```bash
set -a; source .env; set +a
export DATABASE_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/bryx_kosten_test";process.stdout.write(u.toString())')
npx vitest run tests/verfuegbarkeit/repository.test.ts
npx tsc --noEmit
```
Expected: PASS; tsc vollständig clean.

- [ ] **Step 6: Commit**

```bash
git add src/verfuegbarkeit/repository.ts src/verfuegbarkeit/types.ts src/components/MeldebestandListe.tsx tests/verfuegbarkeit/repository.test.ts
git commit -m "feat(verfuegbarkeit): Meldebestand auf Reichweite<90 (== kritisch) + neue Listen-Spalten"
```

---

## Task 5: Hilfe-Doku

**Files:**
- Modify: `src/lib/help/content.ts` (Abschnitt `slug: 'verfuegbarkeit'`)

- [ ] **Step 1: Bestandsverlauf-Text ersetzen** — im Block „Bestandsverlauf & Nachliefer-Prognose" den ersten `p`-Text (erwähnt aktuell „Anzahl Artikel unter Meldebestand"):

```ts
          { type: 'p', text: 'Die Übersicht zeigt drei KPIs — Gesamtbestand (anklickbar: Verlaufskurve für den gewählten Zeitraum), Warenwert im Lager (Bestand × Einkaufspreis, ebenfalls mit Verlauf) und Anzahl Artikel mit Reichweite unter 90 Tagen (ein Klick führt zum Meldebestand) — sowie eine sortier- und filterbare Kategorie-Tabelle. Ein Zeitraum-Selektor (Standard + von-bis) steuert die Kurven.' },
```

- [ ] **Step 2: Meldebestand-Funktionstext ersetzen** — im Block „Wichtige Funktionen" den Meldebestand-Listenpunkt (erwähnt aktuell „alle Artikel unter Meldebestand"):

```ts
            'Meldebestand: alle Artikel mit Reichweite unter 90 Tagen (Bestand kleiner als der Absatz der letzten 90 Tage) — „Nachbestellung entwerfen" legt eine Bestellung im Status Entwurf beim (vorbelegten) Lieferanten an; die Vorschlagsmenge deckt den 90-Tage-Bedarf.',
```

- [ ] **Step 3: Registry-Test + Typecheck**

Run: `npx vitest run tests/lib/help-content.test.ts && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(hilfe): Warenwert-KPI + Meldebestand-Reichweite dokumentiert"
```

---

## Task 6: Gesamtabnahme

- [ ] **Step 1: Volle Suite (Test-DB) + Typecheck + Build**

Run:
```bash
set -a; source .env; set +a
export DATABASE_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/bryx_kosten_test";process.stdout.write(u.toString())')
npx vitest run
npx tsc --noEmit
npm run build
```
Expected: alle Tests grün, tsc clean, Build OK.

- [ ] **Step 2: Deploy auf bryx-test + Browser-Verifikation** (Controller, nach Freigabe): Fokus-Ring deutlich sichtbar; Warenwert-Kachel + €-Kurve + „EK unvollständig"-Hinweis; Klick „Reichweite < 90 Tage" navigiert zu `/verfuegbarkeit/meldebestand`; Meldebestand-Liste zeigt Bestand/Absatz90/Reichweite/Vorschlag; Rollup-Tabelle ohne „Unter Meldebestand"-Spalte; Konsole clean; Dark Mode.

---

## Self-Review

**Spec-Abdeckung:**
- Punkt 1 (Fokus deutlicher): Task 2. ✓
- Punkt 2 (Warenwert-KPI + Verlauf, EK, Hinweis; Unter-Meldebestand-KPI weg; bucketLast-Fix): Tasks 1, 3. ✓
- Punkt 3 (Klick Reichweite → Meldebestand; Meldebestand = Reichweite<90; suggestedQty; Listen-Spalten; Rollup-Spalte weg): Tasks 2 (href), 3 (Rollup-Spalte + Link), 4. ✓
- Doku: Task 5. ✓

**Placeholder-Scan:** kein TBD/TODO; vollständiger Code in allen Schritten. ✓

**Typ-Konsistenz:** `CategoryRollupRow` (ohne `anzahlUnterMeldebestand`) + `dashboardKpis` `{gesamtbestand;kritisch}` + `warenwertKpi`/`warenwertSeries` in Task 3 definiert und genutzt (gleicher Task → kein tsc-Bruch). `ReorderSuggestion` (onHand/units90d/reichweiteTage) + `MeldebestandListe` in Task 4 (gleicher Task). `KpiTrendItem.href`/`hint` (Task 2) → Task 3. `bucketLast` (Task 1) → Task 3. ✓

**Jeder Commit tsc-clean:** Datenschicht-Änderungen sind mit ihren UI-Konsumenten im selben Task gebündelt (Task 3: history/types + page/dashboard; Task 4: repository/types + MeldebestandListe). ✓
