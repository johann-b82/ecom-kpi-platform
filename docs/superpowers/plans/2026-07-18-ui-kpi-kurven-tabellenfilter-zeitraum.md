# UI-Umbau — KPI-Kurven, Tabellenfilter, von-bis-Zeitraum — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klickbare KPI-Kacheln mit aufklappender Verlaufskurve, sortier-/pro-Spalte-filterbare Hauptlisten, ein gemeinsamer Zeitraum-Selektor (Standard + von-bis) auf allen drei Modul-Übersichten, „Neuer Beleg" aus der Sidebar entfernt und die Liste als „Sales" beschriftet.

**Architecture:** Serverseitig vorberechnete Zeitreihen (pro Bucket) werden an eine gemeinsame Client-Komponente `KpiTrendRow` gegeben, die je Reihe genau eine Kurve als Akkordeon aufklappt. Der bestehende `Filters`-Selektor bekommt einen von-bis-Modus (`?start=&end=`); `resolveRange` löst ihn auf. Eine neue Client-`DataTable` (Sort + Pro-Spalte-Filter) wird Standard für vollständig geladene Tabellen; die serverseitig paginierte Belegliste behält serverseitige Filter.

**Tech Stack:** Next.js App-Router (Server + Client Components), TypeScript, recharts, Tailwind (ERP-Designsystem), Vitest, Postgres (`pg`).

## Global Constraints

- Designsystem (bindend): Akzent nur via `--accent`/`var(--brand)`; nur warme `neutral`-Palette (kein gray/slate/zinc/stone, kein pures Weiß/Schwarz außer `neutral-0/950`); Fonts Plus Jakarta Sans + DM Mono; `.anno` ist die **einzige** erlaubte Uppercase-Stilisierung; **Dark Mode Pflicht** (`dark:`-Varianten auf allen neuen Flächen).
- Charts nur mit **recharts** + den Konstanten aus `src/components/charts/chart-style.ts` (`BRAND`, `MUTED`, `TICK`, `TOOLTIP_LABEL_STYLE`, `num`, `eur`).
- Kurven **nur wo echte Historie existiert** (Verfügbarkeit Gesamtbestand, Verkauf Umsatz/Sales/Ø). KPIs ohne Historie bleiben nicht-klickbar, Darstellung unverändert. **Kein** neues Snapshot-/Cron-Backend.
- Rename „Belege"→„Sales" nur **sichtbare Anzeige-Texte**. Routen (`/verkauf/belege`), Komponentennamen, Server-Actions, DB-Felder bleiben unverändert.
- Serverseitig paginierte Listen (Belegliste, 10k+ Zeilen) **niemals** vollständig in den Client laden — deren Filter laufen serverseitig über URL-Parameter.
- Akkordeon: **genau eine** Kurve pro Reihe gleichzeitig offen.
- Modell-Regel: die **Page-Ebene** (`Filters`) besitzt die primäre Zeit-Dimension einer Seite (KPIs/Kurven + primäres Datumsfeld der Liste); **Pro-Spalte-Filter** decken die übrigen Dimensionen ab (keine doppelten Datumsregler auf derselben Seite).
- Hilfe-Modul (`src/lib/help/content.ts`) bei Funktionsänderung mitpflegen (Projektregel).
- Deployment ausschließlich auf der VPS (nie lokal). Tests (`npx vitest`) laufen lokal.

---

## File Structure

**Neu:**
- `src/lib/series.ts` — Bucket-Helfer (`pickBucket`, `bucketSum`) für Zeitreihen-Bündelung.
- `src/lib/data-table.ts` — reine Filter-Prädikate (`matchesText`, `inNumberRange`).
- `src/components/charts/KpiLineChart.tsx` — einlinige recharts-Verlaufskurve.
- `src/components/KpiTrendRow.tsx` — klickbare KPI-Kachelreihe mit Akkordeon-Kurve.
- `src/components/DataTable.tsx` — generische Client-Tabelle (Sort + Pro-Spalte-Filter).
- Tests: `tests/lib/range.test.ts`, `tests/lib/series.test.ts`, `tests/lib/data-table.test.ts`.

**Geändert:**
- `src/lib/range.ts` — `resolveRange` um von-bis (`custom`) erweitern.
- `src/components/Filters.tsx` — von-bis-Modus.
- `src/verkauf/repository.ts` — `salesDailySeries()`; `listOrderRowsPaged()` um `status`/`from`/`to`.
- `src/verfuegbarkeit/history.ts` — `stockTotalSeries()`.
- `src/finanzen/repository.ts` + `src/finanzen/types.ts` — `listOpenItems` um Fälligkeits-Range.
- `src/app/(shell)/verkauf/page.tsx` — Kurven + von-bis.
- `src/app/(shell)/verfuegbarkeit/page.tsx` + `src/components/VerfuegbarkeitDashboard.tsx` — Selektor, Gesamtbestand-Kurve, Rollup→DataTable.
- `src/app/(shell)/finanzen/page.tsx` + `src/components/OffenePostenListe.tsx` — Selektor, Liste→DataTable.
- `src/app/(shell)/verkauf/belege/page.tsx` + `src/components/VerkaufList.tsx` — Server-Filter (Status/Datum) + Rename.
- `src/components/VerkaufSidebar.tsx` — „Neuer Beleg" entfernen.
- `src/lib/help/content.ts` — Doku.

---

## Task 1: Menüpunkt „Neuer Beleg" aus der Verkauf-Sidebar entfernen

**Files:**
- Modify: `src/components/VerkaufSidebar.tsx:5-10`

**Interfaces:**
- Produces: nichts (reine Anzeige-Änderung).

- [ ] **Step 1: Menüeintrag entfernen**

In `src/components/VerkaufSidebar.tsx` das `ITEMS`-Array anpassen — die letzte Zeile streichen:

```tsx
const ITEMS = [
  { href: '/verkauf', label: 'Übersicht' },
  { href: '/verkauf/dashboard', label: 'E-Commerce' },
  { href: '/verkauf/woocommerce', label: 'WooCommerce' },
];
```

Route `/verkauf/neu` und `NeuerBeleg` bleiben unangetastet; der „+ Neuer Beleg"-Button in `VerkaufList` bleibt der UI-Einstieg.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (keine neuen Fehler).

- [ ] **Step 3: Commit**

```bash
git add src/components/VerkaufSidebar.tsx
git commit -m "feat(verkauf): Menüpunkt 'Neuer Beleg' aus Sidebar entfernen"
```

---

## Task 2: Anzeige-Label „Belege" → „Sales"

**Files:**
- Modify: `src/app/(shell)/verkauf/belege/page.tsx:22`
- Modify: `src/components/VerkaufList.tsx:71,79`

**Interfaces:**
- Consumes: nichts. Produces: nichts (nur sichtbare Texte).

Nur die list-/modulbezogenen sichtbaren „Belege"/„Beleg"-Labels werden zu „Sales". Der Aktions-Button **„Neuer Beleg"** (`VerkaufList.tsx:48`) bleibt als Aktionsbeschriftung unverändert (Route/Funktion heißen weiter „Beleg").

- [ ] **Step 1: Überschrift der Belegliste umbenennen**

In `src/app/(shell)/verkauf/belege/page.tsx` die Überschrift ändern:

```tsx
<h2 className="text-xl font-bold tracking-tight">Verkauf · Sales</h2>
```

- [ ] **Step 2: Listentexte in `VerkaufList` umbenennen**

In `src/components/VerkaufList.tsx`:

Leerzeile (Zeile 71):
```tsx
            <tr><td colSpan={6} className="py-6 text-center text-neutral-500">Keine Sales.</td></tr>
```

Fußzeile (Zeile 79) — nur das Wort „Belege" ersetzen:
```tsx
        <span>{total.toLocaleString('de-DE')} Sales · Seite {page.toLocaleString('de-DE')} von {totalPages.toLocaleString('de-DE')}</span>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/(shell)/verkauf/belege/page.tsx src/components/VerkaufList.tsx
git commit -m "feat(verkauf): Belegliste als 'Sales' beschriften"
```

---

## Task 3: `resolveRange` um von-bis-Bereich erweitern (TDD)

**Files:**
- Modify: `src/lib/range.ts`
- Test: `tests/lib/range.test.ts`

**Interfaces:**
- Produces: `resolveRange(param?: string, end: string, custom?: { start?: string; end?: string }): { key: RangeKey | 'custom'; range: DateRange }`. Bei gültigem `custom.start`/`custom.end` (beide `YYYY-MM-DD`, `start <= end`) → `{ key: 'custom', range: { start, end } }`, sonst wie bisher.

- [ ] **Step 1: Failing test**

Erstelle `tests/lib/range.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveRange } from '@/lib/range';

describe('resolveRange', () => {
  const END = '2026-07-18';

  it('nutzt den benutzerdefinierten Bereich, wenn start und end gültig sind', () => {
    const r = resolveRange('30', END, { start: '2026-01-01', end: '2026-03-31' });
    expect(r.key).toBe('custom');
    expect(r.range).toEqual({ start: '2026-01-01', end: '2026-03-31' });
  });

  it('fällt auf days zurück, wenn nur ein Custom-Ende gesetzt ist', () => {
    const r = resolveRange('7', END, { end: '2026-03-31' });
    expect(r.key).toBe('7');
    expect(r.range).toEqual({ start: '2026-07-12', end: END });
  });

  it('ignoriert ungültige (invertierte) Custom-Bereiche', () => {
    const r = resolveRange('30', END, { start: '2026-03-31', end: '2026-01-01' });
    expect(r.key).toBe('30');
  });

  it('ignoriert nicht-ISO Custom-Werte', () => {
    const r = resolveRange('30', END, { start: '01.01.2026', end: '2026-03-31' });
    expect(r.key).toBe('30');
  });

  it('verhält sich ohne custom wie zuvor (Default 30)', () => {
    expect(resolveRange(undefined, END).range).toEqual({ start: '2026-06-19', end: END });
    expect(resolveRange('all', END).range.start).toBe('2000-01-01');
  });
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx vitest run tests/lib/range.test.ts`
Expected: FAIL (Custom-Fälle liefern noch `key: '30'` bzw. TS-Fehler wegen 3. Parameter).

- [ ] **Step 3: Implementierung**

In `src/lib/range.ts` `resolveRange` ersetzen:

```ts
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export function resolveRange(
  param: string | undefined,
  end: string,
  custom?: { start?: string; end?: string },
): { key: RangeKey | 'custom'; range: DateRange } {
  const cs = custom?.start;
  const ce = custom?.end;
  if (cs && ce && ISO.test(cs) && ISO.test(ce) && cs <= ce) {
    return { key: 'custom', range: { start: cs, end: ce } };
  }
  const key = (param && KEYS.includes(param) ? param : '30') as RangeKey;
  const start = key === 'all' ? '2000-01-01' : addDays(end, -(Number(key) - 1));
  return { key, range: { start, end } };
}
```

- [ ] **Step 4: Test grün**

Run: `npx vitest run tests/lib/range.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck (bestehende Aufrufer)**

Run: `npx tsc --noEmit`
Expected: PASS — die Rückgabe-Union `RangeKey | 'custom'` bricht bestehende Aufrufer nicht (sie lesen `range`, nicht `key`).

- [ ] **Step 6: Commit**

```bash
git add src/lib/range.ts tests/lib/range.test.ts
git commit -m "feat(range): resolveRange um benutzerdefinierten von-bis-Bereich erweitern"
```

---

## Task 4: Zeitreihen-Bucket-Helfer (TDD)

**Files:**
- Create: `src/lib/series.ts`
- Test: `tests/lib/series.test.ts`

**Interfaces:**
- Produces:
  - `pickBucket(range: { start: string; end: string }): 'day' | 'week' | 'month'` — ≤92 T → day, ≤400 T → week, sonst month.
  - `bucketSum(points: SeriesPoint[], bucket: 'day'|'week'|'month'): SeriesPoint[]` — summiert Werte je Bucket (Woche = Montag der ISO-Woche, Monat = Monatserster), chronologisch sortiert.
- Consumes: `SeriesPoint` aus `@/verfuegbarkeit/types` (`{ date: string; value: number }`), `daysBetween` aus `@/lib/dates`.

- [ ] **Step 1: Failing test**

Erstelle `tests/lib/series.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { pickBucket, bucketSum } from '@/lib/series';

describe('pickBucket', () => {
  it('wählt day/week/month nach Spannweite', () => {
    expect(pickBucket({ start: '2026-06-01', end: '2026-07-01' })).toBe('day');
    expect(pickBucket({ start: '2026-01-01', end: '2026-06-01' })).toBe('week');
    expect(pickBucket({ start: '2024-01-01', end: '2026-01-01' })).toBe('month');
  });
});

describe('bucketSum', () => {
  const pts = [
    { date: '2026-06-01', value: 2 }, // Montag
    { date: '2026-06-03', value: 3 }, // Mittwoch (gleiche Woche)
    { date: '2026-06-08', value: 5 }, // Montag darauf
  ];

  it('day: unverändert, chronologisch', () => {
    expect(bucketSum(pts, 'day')).toEqual(pts);
  });

  it('week: summiert je Montag der ISO-Woche', () => {
    expect(bucketSum(pts, 'week')).toEqual([
      { date: '2026-06-01', value: 5 },
      { date: '2026-06-08', value: 5 },
    ]);
  });

  it('month: summiert je Monatserster', () => {
    expect(bucketSum([{ date: '2026-06-30', value: 1 }, { date: '2026-07-02', value: 4 }], 'month')).toEqual([
      { date: '2026-06-01', value: 1 },
      { date: '2026-07-01', value: 4 },
    ]);
  });
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx vitest run tests/lib/series.test.ts`
Expected: FAIL (Modul existiert nicht).

- [ ] **Step 3: Implementierung**

Erstelle `src/lib/series.ts`:

```ts
import type { SeriesPoint } from '@/verfuegbarkeit/types';
import { daysBetween } from '@/lib/dates';

export type Bucket = 'day' | 'week' | 'month';

// Bündelung nach Zeitraumlänge: kurze Zeiträume täglich, mittlere wöchentlich,
// lange monatlich — hält die x-Achse lesbar.
export function pickBucket(range: { start: string; end: string }): Bucket {
  const span = daysBetween(range.start, range.end);
  if (span <= 92) return 'day';
  if (span <= 400) return 'week';
  return 'month';
}

function bucketKey(date: string, bucket: Bucket): string {
  if (bucket === 'day') return date;
  if (bucket === 'month') return date.slice(0, 8) + '01';
  const d = new Date(date + 'T00:00:00Z');       // Woche → Montag der ISO-Woche
  const dow = (d.getUTCDay() + 6) % 7;            // Mo=0 … So=6
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

export function bucketSum(points: SeriesPoint[], bucket: Bucket): SeriesPoint[] {
  const acc = new Map<string, number>();
  for (const p of points) {
    const k = bucketKey(p.date, bucket);
    acc.set(k, (acc.get(k) ?? 0) + p.value);
  }
  return [...acc.entries()]
    .map(([date, value]) => ({ date, value }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
```

- [ ] **Step 4: Test grün**

Run: `npx vitest run tests/lib/series.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/series.ts tests/lib/series.test.ts
git commit -m "feat(series): Bucket-Helfer für Zeitreihen (day/week/month)"
```

---

## Task 5: Reine Filter-Prädikate für die DataTable (TDD)

**Files:**
- Create: `src/lib/data-table.ts`
- Test: `tests/lib/data-table.test.ts`

**Interfaces:**
- Produces:
  - `matchesText(cell: string, query: string): boolean` — Teilstring, case-insensitiv (de), leerer Query matcht alles.
  - `inNumberRange(value: number, min?: number, max?: number): boolean` — inklusive Grenzen; undefinierte Grenze = offen.

- [ ] **Step 1: Failing test**

Erstelle `tests/lib/data-table.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { matchesText, inNumberRange } from '@/lib/data-table';

describe('matchesText', () => {
  it('matcht case-insensitiv als Teilstring', () => {
    expect(matchesText('Müller GmbH', 'müller')).toBe(true);
    expect(matchesText('Müller GmbH', 'GMBH')).toBe(true);
    expect(matchesText('Müller GmbH', 'xyz')).toBe(false);
  });
  it('leerer Query matcht alles', () => {
    expect(matchesText('irgendwas', '   ')).toBe(true);
  });
});

describe('inNumberRange', () => {
  it('respektiert inklusive Grenzen', () => {
    expect(inNumberRange(5, 1, 10)).toBe(true);
    expect(inNumberRange(1, 1, 10)).toBe(true);
    expect(inNumberRange(10, 1, 10)).toBe(true);
    expect(inNumberRange(0, 1, 10)).toBe(false);
    expect(inNumberRange(11, 1, 10)).toBe(false);
  });
  it('offene Grenzen', () => {
    expect(inNumberRange(100, 5, undefined)).toBe(true);
    expect(inNumberRange(2, undefined, 5)).toBe(true);
    expect(inNumberRange(2, undefined, undefined)).toBe(true);
  });
});
```

- [ ] **Step 2: Test schlägt fehl**

Run: `npx vitest run tests/lib/data-table.test.ts`
Expected: FAIL (Modul existiert nicht).

- [ ] **Step 3: Implementierung**

Erstelle `src/lib/data-table.ts`:

```ts
// Reine Prädikate für die client-seitige DataTable-Filterung (ohne DOM/React,
// damit testbar). Sortierung nutzt weiterhin compareValues aus lib/client-sort.
export function matchesText(cell: string, query: string): boolean {
  const q = query.trim().toLocaleLowerCase('de');
  if (!q) return true;
  return cell.toLocaleLowerCase('de').includes(q);
}

export function inNumberRange(value: number, min?: number, max?: number): boolean {
  if (min !== undefined && value < min) return false;
  if (max !== undefined && value > max) return false;
  return true;
}
```

- [ ] **Step 4: Test grün**

Run: `npx vitest run tests/lib/data-table.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data-table.ts tests/lib/data-table.test.ts
git commit -m "feat(data-table): reine Filter-Prädikate (Text/Zahlbereich)"
```

---

## Task 6: `KpiLineChart` — einlinige Verlaufskurve

**Files:**
- Create: `src/components/charts/KpiLineChart.tsx`

**Interfaces:**
- Consumes: `SeriesPoint` (`@/verfuegbarkeit/types`), chart-style-Konstanten, `formatDeDate` (`@/lib/dates`).
- Produces: `KpiLineChart({ title: string; series: SeriesPoint[]; format?: 'num' | 'eur' })`.

- [ ] **Step 1: Komponente erstellen**

Erstelle `src/components/charts/KpiLineChart.tsx`:

```tsx
'use client';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ChartCard } from './ChartCard';
import { BRAND, MUTED, TICK, TOOLTIP_LABEL_STYLE, num, eur } from './chart-style';
import { formatDeDate } from '@/lib/dates';
import type { SeriesPoint } from '@/verfuegbarkeit/types';

// Einlinige KPI-Verlaufskurve für die aufklappbaren KPI-Kacheln.
export function KpiLineChart({ title, series, format = 'num' }:
  { title: string; series: SeriesPoint[]; format?: 'num' | 'eur' }) {
  const fmt = format === 'eur' ? eur : num;
  if (series.length === 0) {
    return (
      <ChartCard title={title}>
        <p className="mt-3 text-sm text-neutral-500">Keine Verlaufsdaten im gewählten Zeitraum.</p>
      </ChartCard>
    );
  }
  return (
    <ChartCard title={title}>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={MUTED} strokeOpacity={0.25} vertical={false} />
            <XAxis dataKey="date" tick={TICK} minTickGap={24} tickFormatter={formatDeDate} />
            <YAxis tick={TICK} width={56} tickFormatter={(n) => fmt(Number(n))} />
            <Tooltip formatter={(v) => [fmt(Number(v)), title]} labelFormatter={formatDeDate} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Line dataKey="value" stroke={BRAND} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/KpiLineChart.tsx
git commit -m "feat(charts): KpiLineChart für KPI-Verlaufskurven"
```

---

## Task 7: `KpiTrendRow` — klickbare KPI-Kacheln mit Akkordeon-Kurve

**Files:**
- Create: `src/components/KpiTrendRow.tsx`

**Interfaces:**
- Consumes: `ChartCard`, `KpiLineChart`, `SeriesPoint`.
- Produces:
  - `interface KpiTrendItem { key: string; label: string; value: string; anno?: string; series?: SeriesPoint[]; format?: 'num' | 'eur' }`
  - `KpiTrendRow({ items: KpiTrendItem[]; gridClassName?: string })` — rendert die Kachel-Grid; Kacheln **mit** `series` sind klickbar und klappen darunter (volle Reihenbreite) genau eine Kurve auf.

- [ ] **Step 1: Komponente erstellen**

Erstelle `src/components/KpiTrendRow.tsx`:

```tsx
'use client';
import { useState } from 'react';
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
          const body = (
            <>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{i.label}</p>
              <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{i.value}</p>
              {i.anno && <p className="anno mt-1 text-neutral-500">{i.anno}</p>}
            </>
          );
          return (
            <ChartCard key={i.key}
              className={`${clickable ? 'transition hover:ring-2 hover:ring-accent/40' : ''} ${isOpen ? 'ring-2 ring-accent' : ''}`}>
              {clickable ? (
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
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/KpiTrendRow.tsx
git commit -m "feat(kpi): KpiTrendRow — klickbare Kacheln mit Akkordeon-Kurve"
```

---

## Task 8: `DataTable` — generische Client-Tabelle (Sort + Pro-Spalte-Filter)

**Files:**
- Create: `src/components/DataTable.tsx`

**Interfaces:**
- Consumes: `compareValues` (`@/lib/client-sort`), `matchesText`/`inNumberRange` (`@/lib/data-table`), `Sort` (`@/lib/sort`).
- Produces:
  - `type Column<T> = { key: string; header: string; cell: (row: T) => React.ReactNode; className?: string; sort?: (row: T) => string | number | null | undefined; filter?: { kind: 'text'; value: (row: T) => string } | { kind: 'select'; value: (row: T) => string; options: { value: string; label: string }[] } | { kind: 'number'; value: (row: T) => number } }`
  - `DataTable<T>({ rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; initialSort?: Sort; empty?: string })`

- [ ] **Step 1: Komponente erstellen**

Erstelle `src/components/DataTable.tsx`:

```tsx
'use client';
import { useMemo, useState, type ReactNode } from 'react';
import type { Sort } from '@/lib/sort';
import { compareValues } from '@/lib/client-sort';
import { matchesText, inNumberRange } from '@/lib/data-table';

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  sort?: (row: T) => string | number | null | undefined;
  filter?:
    | { kind: 'text'; value: (row: T) => string }
    | { kind: 'select'; value: (row: T) => string; options: { value: string; label: string }[] }
    | { kind: 'number'; value: (row: T) => number };
};

type FilterVal = { text?: string; select?: string; min?: string; max?: string };

const inputCls =
  'w-full rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 text-xs text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function DataTable<T>({ rows, columns, rowKey, initialSort, empty = 'Keine Einträge.' }:
  { rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string; initialSort?: Sort; empty?: string }) {
  const [sort, setSort] = useState<Sort | null>(initialSort ?? null);
  const [filters, setFilters] = useState<Record<string, FilterVal>>({});
  const hasFilterRow = columns.some((c) => c.filter);

  const setF = (key: string, patch: Partial<FilterVal>) =>
    setFilters((f) => ({ ...f, [key]: { ...f[key], ...patch } }));

  const filtered = useMemo(() => rows.filter((row) =>
    columns.every((c) => {
      const fv = filters[c.key];
      if (!c.filter || !fv) return true;
      if (c.filter.kind === 'text') return matchesText(c.filter.value(row), fv.text ?? '');
      if (c.filter.kind === 'select') return !fv.select || c.filter.value(row) === fv.select;
      const min = fv.min ? Number(fv.min) : undefined;
      const max = fv.max ? Number(fv.max) : undefined;
      return inNumberRange(c.filter.value(row), min, max);
    })), [rows, columns, filters]);

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.col);
    if (!col?.sort) return filtered;
    const factor = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => compareValues(col.sort!(a), col.sort!(b)) * factor);
  }, [filtered, sort, columns]);

  const onSort = (key: string) =>
    setSort((s) => (s && s.col === key && s.dir === 'asc' ? { col: key, dir: 'desc' } : { col: key, dir: 'asc' }));

  return (
    <div className="overflow-x-auto rounded-lg bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-neutral-200 text-left text-neutral-500 dark:border-neutral-800">
            {columns.map((c) => (
              <th key={c.key} className={`px-4 py-2 ${c.className ?? ''}`}>
                {c.sort ? (
                  <button onClick={() => onSort(c.key)}
                    className="anno inline-flex items-center gap-1 hover:text-neutral-700 dark:hover:text-neutral-200">
                    {c.header}
                    <span className="text-[10px] leading-none">
                      {sort?.col === c.key ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                    </span>
                  </button>
                ) : <span className="anno">{c.header}</span>}
              </th>
            ))}
          </tr>
          {hasFilterRow && (
            <tr className="border-b border-neutral-200 dark:border-neutral-800">
              {columns.map((c) => (
                <th key={c.key} className="px-2 py-1 align-top">
                  {c.filter?.kind === 'text' && (
                    <input className={inputCls} placeholder="Filter …"
                      value={filters[c.key]?.text ?? ''} onChange={(e) => setF(c.key, { text: e.target.value })} />
                  )}
                  {c.filter?.kind === 'select' && (
                    <select className={inputCls}
                      value={filters[c.key]?.select ?? ''} onChange={(e) => setF(c.key, { select: e.target.value })}>
                      <option value="">Alle</option>
                      {c.filter.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  )}
                  {c.filter?.kind === 'number' && (
                    <div className="flex gap-1">
                      <input className={inputCls} inputMode="numeric" placeholder="min"
                        value={filters[c.key]?.min ?? ''} onChange={(e) => setF(c.key, { min: e.target.value })} />
                      <input className={inputCls} inputMode="numeric" placeholder="max"
                        value={filters[c.key]?.max ?? ''} onChange={(e) => setF(c.key, { max: e.target.value })} />
                    </div>
                  )}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className="border-b border-neutral-100 last:border-0 dark:border-neutral-800">
              {columns.map((c) => <td key={c.key} className={`px-4 py-2 ${c.className ?? ''}`}>{c.cell(row)}</td>)}
            </tr>
          ))}
          {sorted.length === 0 && (
            <tr><td colSpan={columns.length} className="px-4 py-6 text-center text-neutral-500">{empty}</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/components/DataTable.tsx
git commit -m "feat(data-table): generische DataTable mit Sort + Pro-Spalte-Filter"
```

---

## Task 9: Verkauf-Übersicht — von-bis + KPI-Verlaufskurven

**Files:**
- Modify: `src/verkauf/repository.ts` (neue Funktion `salesDailySeries`)
- Modify: `src/app/(shell)/verkauf/page.tsx`

**Interfaces:**
- Consumes: `resolveRange` (mit `custom`), `pickBucket`/`bucketSum`, `KpiTrendRow`/`KpiTrendItem`.
- Produces: `salesDailySeries(range: DateRange, channel?: OrderChannel): Promise<{ day: string; revenueNet: number; orders: number }[]>`.

- [ ] **Step 1: Repository-Funktion ergänzen**

In `src/verkauf/repository.ts` nach `revenueByDay` (Zeile 342) einfügen:

```ts
export interface SalesDailyPoint { day: string; revenueNet: number; orders: number }

// Übersichts-Kurven: Umsatz UND Belegzahl je Tag (Ø folgt aus revenue/orders).
export async function salesDailySeries(range: DateRange, channel?: OrderChannel): Promise<SalesDailyPoint[]> {
  const r = await pool.query(
    `SELECT COALESCE(o.placed_at, o.created_at)::date::text AS day,
            COALESCE(SUM(l.quantity * l.unit_price), 0)::float8 AS revenue,
            COUNT(DISTINCT o.id)::int AS orders
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id = o.id
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND o.status NOT IN ('angebot','storniert')
        AND ($3::text IS NULL OR o.channel = $3)
      GROUP BY day ORDER BY day`, [range.start, range.end, channel ?? null]);
  return r.rows.map((x: any) => ({ day: x.day, revenueNet: Number(x.revenue), orders: x.orders }));
}
```

- [ ] **Step 2: Übersichtsseite umbauen**

`src/app/(shell)/verkauf/page.tsx` vollständig ersetzen:

```tsx
import { salesTotals, channelSummary, statusFunnel, salesDailySeries } from '@/verkauf/repository';
import { resolveRange } from '@/lib/range';
import { pickBucket, bucketSum } from '@/lib/series';
import { Filters } from '@/components/Filters';
import { KanalVergleich } from '@/components/KanalVergleich';
import { StatusFunnel } from '@/components/StatusFunnel';
import { KpiTrendRow, type KpiTrendItem } from '@/components/KpiTrendRow';
import { eur } from '@/verkauf/format';

export const dynamic = 'force-dynamic';

export default async function VerkaufUebersichtPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end, { start: searchParams.start, end: searchParams.end });
  const [totals, channels, funnel, daily] = await Promise.all([
    salesTotals(range), channelSummary(range), statusFunnel(range), salesDailySeries(range),
  ]);

  const bucket = pickBucket(range);
  const revenueSeries = bucketSum(daily.map((d) => ({ date: d.day, value: d.revenueNet })), bucket);
  const ordersSeries = bucketSum(daily.map((d) => ({ date: d.day, value: d.orders })), bucket);
  const ordersByDate = new Map(ordersSeries.map((p) => [p.date, p.value]));
  const avgSeries = revenueSeries.map((r) => {
    const o = ordersByDate.get(r.date) ?? 0;
    return { date: r.date, value: o > 0 ? r.value / o : 0 };
  });

  const items: KpiTrendItem[] = [
    { key: 'umsatz', label: 'Umsatz', value: eur(totals.revenueNet), anno: 'NETTO · OHNE MWST', series: revenueSeries, format: 'eur' },
    { key: 'sales', label: 'Sales', value: String(totals.orders), series: ordersSeries, format: 'num' },
    { key: 'avg', label: 'Ø Belegwert', value: eur(totals.avgOrderValueNet), anno: 'NETTO · OHNE MWST', series: avgSeries, format: 'eur' },
    { key: 'angebote', label: 'Offene Angebote', value: String(totals.openOffers) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verkauf · Übersicht</h2>
        <Filters range={range} basePath="/verkauf" />
      </div>
      <KpiTrendRow items={items} />
      <KanalVergleich channels={channels} />
      <StatusFunnel funnel={funnel} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 4: Deploy + Browser-Verifikation**

Deploy auf der VPS (nie lokal) und mit Chrome verifizieren (Login siehe Memory `test-accounts-bryx-test`):
- `/verkauf` öffnen → 4 Kacheln; Klick auf „Umsatz" klappt darunter die €-Kurve auf, zweiter Klick schließt, Klick auf „Sales" ersetzt sie (nur eine offen).
- „Offene Angebote" ist nicht klickbar.
- Zeitraum-Chips wechseln den Zeitraum; die Kurve folgt.

Expected: Verhalten wie beschrieben, keine Konsolenfehler.

- [ ] **Step 5: Commit**

```bash
git add src/verkauf/repository.ts src/app/(shell)/verkauf/page.tsx
git commit -m "feat(verkauf): KPI-Verlaufskurven + von-bis auf der Übersicht"
```

---

## Task 10: Verfügbarkeit-Übersicht — Selektor, Gesamtbestand-Kurve, Rollup→DataTable

**Files:**
- Modify: `src/verfuegbarkeit/history.ts` (neue Funktion `stockTotalSeries`)
- Modify: `src/app/(shell)/verfuegbarkeit/page.tsx`
- Modify: `src/components/VerfuegbarkeitDashboard.tsx`

**Interfaces:**
- Consumes: `resolveRange`, `pickBucket`/`bucketSum`, `Filters`, `KpiTrendRow`, `DataTable`.
- Produces: `stockTotalSeries(range: DateRange): Promise<SeriesPoint[]>` (Summe `quantity_on_hand` je `snapshot_date` im Bereich).

- [ ] **Step 1: Repository-Funktion ergänzen**

In `src/verfuegbarkeit/history.ts` (Import um `DateRange` erweitern und Funktion ergänzen). Oben den Typ-Import anpassen:

```ts
import type { SeriesPoint, VariantForecastInput, CategoryRollupRow, CategoryVariantRow } from './types';
import type { DateRange } from '@/lib/types';
```

Dann nach `stockSeries` (Zeile 14) einfügen:

```ts
// Übersichts-Kurve: Gesamtbestand (Summe on_hand) je Snapshot-Tag im Bereich.
export async function stockTotalSeries(range: DateRange): Promise<SeriesPoint[]> {
  const r = await pool.query(
    `SELECT snapshot_date::text AS date, SUM(quantity_on_hand)::int AS value
       FROM stock_snapshots
      WHERE snapshot_date BETWEEN $1 AND $2
      GROUP BY snapshot_date ORDER BY snapshot_date`, [range.start, range.end]);
  return r.rows.map((x: { date: string; value: number }) => ({ date: x.date, value: Number(x.value) }));
}
```

- [ ] **Step 2: Übersichtsseite umbauen**

`src/app/(shell)/verfuegbarkeit/page.tsx` vollständig ersetzen:

```tsx
import { categoryRollup, dashboardKpis, stockTotalSeries } from '@/verfuegbarkeit/history';
import { resolveRange } from '@/lib/range';
import { pickBucket, bucketSum } from '@/lib/series';
import { Filters } from '@/components/Filters';
import { VerfuegbarkeitDashboard } from '@/components/VerfuegbarkeitDashboard';

export const dynamic = 'force-dynamic';

export default async function VerfuegbarkeitUebersichtPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end, { start: searchParams.start, end: searchParams.end });
  const [kpis, rollup, stock] = await Promise.all([dashboardKpis(), categoryRollup(), stockTotalSeries(range)]);
  const stockSeries = bucketSum(stock, pickBucket(range));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Übersicht</h2>
        <Filters range={range} basePath="/verfuegbarkeit" />
      </div>
      <VerfuegbarkeitDashboard kpis={kpis} rollup={rollup} stockSeries={stockSeries} />
    </div>
  );
}
```

- [ ] **Step 3: Dashboard-Komponente umbauen (Kachelreihe + DataTable)**

`src/components/VerfuegbarkeitDashboard.tsx` vollständig ersetzen:

```tsx
'use client';
import Link from 'next/link';
import { num } from '@/components/charts/chart-style';
import { KpiTrendRow, type KpiTrendItem } from '@/components/KpiTrendRow';
import { DataTable, type Column } from '@/components/DataTable';
import type { CategoryRollupRow, SeriesPoint } from '@/verfuegbarkeit/types';

export function VerfuegbarkeitDashboard({ kpis, rollup, stockSeries }: {
  kpis: { gesamtbestand: number; unterMeldebestand: number; kritisch: number };
  rollup: CategoryRollupRow[];
  stockSeries: SeriesPoint[];
}) {
  const items: KpiTrendItem[] = [
    { key: 'gesamt', label: 'Gesamtbestand', value: num(kpis.gesamtbestand), series: stockSeries, format: 'num' },
    { key: 'meldebestand', label: 'Unter Meldebestand', value: num(kpis.unterMeldebestand) },
    { key: 'kritisch', label: 'Reichweite < 90 Tage', value: num(kpis.kritisch) },
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
    { key: 'unterMeldebestand', header: 'Unter Meldebestand', className: 'text-right tabular-nums',
      sort: (r) => r.anzahlUnterMeldebestand, filter: { kind: 'number', value: (r) => r.anzahlUnterMeldebestand },
      cell: (r) => num(r.anzahlUnterMeldebestand) },
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

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Deploy + Browser-Verifikation**

Auf VPS deployen, mit Chrome prüfen:
- `/verfuegbarkeit` → „Gesamtbestand" klickbar → Kurve klappt auf; die anderen beiden Kacheln nicht klickbar.
- Kategorie-Tabelle: Spaltenkopf-Klick sortiert; Text-Filter „Kategorie" und Zahl-Bereich-Filter (min/max) grenzen ein.
- Zeitraum-Chips + von-bis wirken auf die Gesamtbestand-Kurve.

Expected: Verhalten wie beschrieben, keine Konsolenfehler.

- [ ] **Step 6: Commit**

```bash
git add src/verfuegbarkeit/history.ts src/app/(shell)/verfuegbarkeit/page.tsx src/components/VerfuegbarkeitDashboard.tsx
git commit -m "feat(verfuegbarkeit): Zeitraum-Selektor, Gesamtbestand-Kurve, Rollup als DataTable"
```

---

## Task 11: Finanzen-Übersicht — Selektor (Fälligkeits-Range), Liste→DataTable

**Files:**
- Modify: `src/finanzen/types.ts` (`OpenItemFilter` erweitern)
- Modify: `src/finanzen/repository.ts` (`listOpenItems` um Range)
- Modify: `src/app/(shell)/finanzen/page.tsx`
- Modify: `src/components/OffenePostenListe.tsx`

**Interfaces:**
- Consumes: `resolveRange`, `Filters`, `KpiTrendRow`, `DataTable`.
- Produces: `OpenItemFilter { direction?; onlyOpen?; dueFrom?: string; dueTo?: string }`; `listOpenItems` filtert `oi.due_date BETWEEN dueFrom AND dueTo`, wenn gesetzt.

Modell-Regel: Die **Fälligkeit** ist die primäre Zeit-Dimension der Seite → der Page-Selektor filtert danach; die DataTable bekommt **keinen** eigenen Fälligkeits-Filter (Sortierung ja).

- [ ] **Step 1: Filter-Typ erweitern**

In `src/finanzen/types.ts` letzte Zeile ersetzen:

```ts
export interface OpenItemFilter { direction?: OpenItemDirection; onlyOpen?: boolean; dueFrom?: string; dueTo?: string }
```

- [ ] **Step 2: Repository-Filter ergänzen**

In `src/finanzen/repository.ts` in `listOpenItems` die WHERE-Zusammenstellung erweitern (nach der `onlyOpen`-Zeile, vor `const clause`):

```ts
  if (filter.direction) { params.push(filter.direction); where.push(`oi.direction = $${params.length}`); }
  if (filter.onlyOpen) where.push(`oi.status <> 'bezahlt'`);
  if (filter.dueFrom) { params.push(filter.dueFrom); where.push(`oi.due_date >= $${params.length}`); }
  if (filter.dueTo) { params.push(filter.dueTo); where.push(`oi.due_date <= $${params.length}`); }
```

- [ ] **Step 3: Übersichtsseite umbauen**

`src/app/(shell)/finanzen/page.tsx` vollständig ersetzen:

```tsx
import { listOpenItems } from '@/finanzen/repository';
import { resolveRange } from '@/lib/range';
import { OffenePostenListe } from '@/components/OffenePostenListe';

export const dynamic = 'force-dynamic';

export default async function OffenePostenPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end, { start: searchParams.start, end: searchParams.end });
  const items = await listOpenItems({ dueFrom: range.start, dueTo: range.end });
  const sum = (dir: 'debitor' | 'kreditor') =>
    items.filter((i) => i.direction === dir && i.status !== 'bezahlt').reduce((s, i) => s + i.remaining, 0);
  const overdue = items.filter((i) => i.overdue).reduce((s, i) => s + i.remaining, 0);
  return (
    <OffenePostenListe items={items} debitorOpen={sum('debitor')} kreditorOpen={sum('kreditor')}
      overdue={overdue} range={range} />
  );
}
```

- [ ] **Step 4: Liste auf DataTable + Filters umbauen**

`src/components/OffenePostenListe.tsx` vollständig ersetzen:

```tsx
'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { Filters } from '@/components/Filters';
import { KpiTrendRow, type KpiTrendItem } from '@/components/KpiTrendRow';
import { DataTable, type Column } from '@/components/DataTable';
import type { OpenItemRow, OpenItemDirection } from '@/finanzen/types';
import { DIRECTION_LABEL, OI_STATUS_LABEL } from '@/finanzen/labels';
import { eur } from '@/finanzen/format';
import { exportBookingsAction } from '@/app/(shell)/finanzen/actions';

export function OffenePostenListe({ items, debitorOpen, kreditorOpen, overdue, range }:
  { items: OpenItemRow[]; debitorOpen: number; kreditorOpen: number; overdue: number;
    range: { start: string; end: string } }) {
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [pending, start] = useTransition();
  const rows = items.filter((i) => !onlyOpen || i.status !== 'bezahlt');

  const kpis: KpiTrendItem[] = [
    { key: 'debitor', label: 'Offen Debitor', value: eur(debitorOpen), anno: 'NETTO · OHNE MWST' },
    { key: 'kreditor', label: 'Offen Kreditor', value: eur(kreditorOpen), anno: 'NETTO · OHNE MWST' },
    { key: 'overdue', label: 'Davon überfällig', value: eur(overdue), anno: 'NETTO · OHNE MWST' },
  ];

  const statusValue = (i: OpenItemRow) => (i.overdue ? 'ueberfaellig' : i.status);
  const columns: Column<OpenItemRow>[] = [
    { key: 'direction', header: 'Richtung', sort: (i) => DIRECTION_LABEL[i.direction],
      filter: { kind: 'select', value: (i) => i.direction,
        options: (['debitor', 'kreditor'] as OpenItemDirection[]).map((d) => ({ value: d, label: DIRECTION_LABEL[d] })) },
      cell: (i) => DIRECTION_LABEL[i.direction] },
    { key: 'contact', header: 'Kontakt', sort: (i) => i.contactName, filter: { kind: 'text', value: (i) => i.contactName },
      cell: (i) => i.contactName },
    { key: 'reference', header: 'Referenz', sort: (i) => i.reference, filter: { kind: 'text', value: (i) => i.reference ?? '' },
      cell: (i) => <Link href={`/finanzen/${i.id}`} className="text-brand hover:text-brand-dark">{i.reference ?? '—'}</Link> },
    { key: 'amount', header: 'Betrag', className: 'text-right', sort: (i) => i.amount,
      filter: { kind: 'number', value: (i) => i.amount }, cell: (i) => eur(i.amount) },
    { key: 'due', header: 'Fällig', sort: (i) => i.dueDate,
      cell: (i) => <span className={i.overdue ? 'text-danger' : 'text-neutral-500'}>{i.dueDate}</span> },
    { key: 'status', header: 'Status', sort: statusValue,
      filter: { kind: 'select', value: statusValue, options: [
        { value: 'ueberfaellig', label: 'Überfällig' },
        { value: 'offen', label: OI_STATUS_LABEL.offen },
        { value: 'teilweise_bezahlt', label: OI_STATUS_LABEL.teilweise_bezahlt },
        { value: 'bezahlt', label: OI_STATUS_LABEL.bezahlt },
      ] },
      cell: (i) => i.overdue
        ? <span className="rounded bg-danger/15 px-2 py-0.5 font-medium text-danger">Überfällig</span>
        : <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">{OI_STATUS_LABEL[i.status]}</span> },
    { key: 'remaining', header: 'Rest', className: 'text-right', sort: (i) => i.remaining,
      filter: { kind: 'number', value: (i) => i.remaining }, cell: (i) => eur(i.remaining) },
  ];

  const download = () => start(async () => {
    const csv = await exportBookingsAction();
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'buchungen.csv'; a.click();
    URL.revokeObjectURL(url);
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Finanzen · Offene Posten</h2>
        <Filters range={range} basePath="/finanzen" />
      </div>

      <KpiTrendRow items={kpis} gridClassName="grid gap-3 sm:grid-cols-3" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-300">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> nur offen
        </label>
        <div className="flex gap-2">
          <Link href="/finanzen/neu" className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">Lieferantenrechnung</Link>
          <button onClick={download} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Export CSV</button>
        </div>
      </div>

      <DataTable rows={rows} columns={columns} rowKey={(i) => i.id}
        initialSort={{ col: 'due', dir: 'asc' }} empty="Keine offenen Posten." />
    </div>
  );
}
```

Hinweis: `OI_STATUS_LABEL` wird als `Record<OpenItemStatus, string>` vorausgesetzt (bereits importiert). Die frühere `useClientSort`-Nutzung entfällt (durch DataTable ersetzt).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Deploy + Browser-Verifikation**

Auf VPS deployen, mit Chrome prüfen:
- `/finanzen` → Zeitraum-Chips + von-bis grenzen die Liste nach Fälligkeit ein; KPI-Kacheln (ohne Kurve, nicht klickbar) aktualisieren sich.
- Tabelle: Sortierung je Spalte; Select-Filter Richtung/Status; Zahl-Bereich Betrag/Rest; Text Kontakt/Referenz; „nur offen" wirkt.

Expected: Verhalten wie beschrieben, keine Konsolenfehler.

- [ ] **Step 7: Commit**

```bash
git add src/finanzen/types.ts src/finanzen/repository.ts src/app/(shell)/finanzen/page.tsx src/components/OffenePostenListe.tsx
git commit -m "feat(finanzen): Zeitraum-Selektor + offene Posten als DataTable"
```

---

## Task 12: von-bis-Modus im `Filters`-Selektor

**Files:**
- Modify: `src/components/Filters.tsx`

**Interfaces:**
- Consumes: `RANGE_OPTIONS`, `formatDeDate`. Produces: unveränderte Prop-Signatur `Filters({ range?, basePath })`; zusätzlich zwei Datumsfelder, die `?start=&end=` setzen.

Diese Aufgabe kommt nach den Seiten-Umbauten, damit die von-bis-Eingabe sofort auf allen drei bereits angebundenen Übersichten wirkt.

- [ ] **Step 1: `Filters` ersetzen**

`src/components/Filters.tsx` vollständig ersetzen:

```tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { formatDeDate } from '@/lib/dates';
import { RANGE_OPTIONS } from '@/lib/range';

const btn = (active: boolean) =>
  `rounded px-3 py-1 text-sm ${active ? 'bg-brand text-white' : 'bg-neutral-200 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300'}`;
const dateInput =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function Filters({ range, basePath = '/dashboard' }:
  { range?: { start: string; end: string }; basePath?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const hasCustom = !!(params.get('start') && params.get('end'));
  const active = hasCustom ? 'custom' : (params.get('days') ?? '30');
  const [from, setFrom] = useState(params.get('start') ?? range?.start ?? '');
  const [to, setTo] = useState(params.get('end') ?? range?.end ?? '');
  const applyCustom = () => { if (from && to) router.push(`${basePath}?start=${from}&end=${to}`); };

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center gap-2">
        {RANGE_OPTIONS.map((o) => (
          <button key={o.key} onClick={() => router.push(`${basePath}?days=${o.key}`)} className={btn(active === o.key)}>
            {o.label}
          </button>
        ))}
        <span className="mx-1 h-4 w-px bg-neutral-300 dark:bg-neutral-700" />
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateInput} aria-label="Von" />
        <span className="text-neutral-400">–</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateInput} aria-label="Bis" />
        <button onClick={applyCustom} className={btn(active === 'custom')}>Anwenden</button>
      </div>
      {range && (
        <span className="text-xs text-neutral-500 dark:text-neutral-400">
          {formatDeDate(range.start)} – {formatDeDate(range.end)}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Deploy + Browser-Verifikation**

Auf VPS deployen, mit Chrome auf `/verkauf`, `/verfuegbarkeit`, `/finanzen`:
- von-bis eingeben → „Anwenden" → URL `?start=…&end=…`, Kennzahlen/Kurven/Liste folgen dem Bereich, „Anwenden" ist als aktiv markiert.
- Ein Preset-Chip klicken → zurück auf `?days=…`.

Expected: Verhalten wie beschrieben.

- [ ] **Step 4: Commit**

```bash
git add src/components/Filters.tsx
git commit -m "feat(filters): benutzerdefinierter von-bis-Zeitraum"
```

---

## Task 13: Belegliste — serverseitige Status- und Datums-Filter

**Files:**
- Modify: `src/verkauf/repository.ts` (`listOrderRowsPaged`)
- Modify: `src/app/(shell)/verkauf/belege/page.tsx`
- Modify: `src/components/VerkaufList.tsx`

**Interfaces:**
- Consumes: `parseSort`, `ORDER_SORT`. Produces: `listOrderRowsPaged(opts: { channel?; search?; status?: OrderStatus; from?: string; to?: string; sort?; limit?; offset? })` — zusätzliche WHERE-Bedingungen für Status und Beleg-Datum.

Rationale: Die Belegliste ist serverseitig paginiert (10k+ Zeilen) und darf nicht komplett in den Client geladen werden → Pro-Spalte-Filter laufen hier **serverseitig** über URL-Parameter (nicht über die Client-`DataTable`). Das primäre Datumsfeld (Beleg-Datum) trägt die von-bis-Eingrenzung dieser Liste.

- [ ] **Step 1: Repository-Filter erweitern**

In `src/verkauf/repository.ts` `listOrderRowsPaged` ersetzen (ab Zeile 351):

```ts
export async function listOrderRowsPaged(
  opts: { channel?: OrderChannel; search?: string; status?: OrderStatus; from?: string; to?: string;
          sort?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: OrderRow[]; total: number }> {
  const { channel, search, status, from, to, sort, limit = 50, offset = 0 } = opts;
  const s = parseSort(sort, ORDER_SORT.allowed, ORDER_SORT.fallback);
  const orderBy = `${ORDER_SORT_SQL[s.col]} ${s.dir === 'desc' ? 'DESC' : 'ASC'}, o.number DESC`;
  const params = [
    channel ?? null,
    search ? `%${search}%` : null,
    status ?? null,
    from ?? null,
    to ?? null,
  ];
  const where = `WHERE ($1::text IS NULL OR o.channel = $1)
      AND ($2::text IS NULL OR o.number ILIKE $2 OR c.name ILIKE $2)
      AND ($3::text IS NULL OR o.status = $3)
      AND ($4::date IS NULL OR COALESCE(o.placed_at, o.created_at)::date >= $4)
      AND ($5::date IS NULL OR COALESCE(o.placed_at, o.created_at)::date <= $5)`;
  const countRes = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM sales_orders o JOIN contacts c ON c.id = o.contact_id ${where}`, params);
  const r = await pool.query(
    `SELECT o.id, o.number, o.contact_id, c.name AS contact_name, o.channel, o.status,
            o.created_at::text AS created_at, o.placed_at::text AS placed_at,
            COALESCE(array_agg(e.stage ORDER BY e.occurred_at) FILTER (WHERE e.stage IS NOT NULL), '{}') AS stages
       FROM sales_orders o
       JOIN contacts c ON c.id = o.contact_id
       LEFT JOIN sales_order_events e ON e.order_id = o.id
       ${where}
      GROUP BY o.id, c.name
      ORDER BY ${orderBy}
      LIMIT $6 OFFSET $7`, [...params, limit, offset]);
  const rows = r.rows.map((x: any) => ({
    id: x.id, number: x.number, contactId: x.contact_id, contactName: x.contact_name,
    channel: x.channel, status: x.status, createdAt: x.created_at, placedAt: x.placed_at, stages: x.stages,
  }));
  return { rows, total: countRes.rows[0].n };
}
```

- [ ] **Step 2: Belege-Seite: neue Params lesen und durchreichen**

`src/app/(shell)/verkauf/belege/page.tsx` vollständig ersetzen:

```tsx
import { listOrderRowsPaged } from '@/verkauf/repository';
import { VerkaufList } from '@/components/VerkaufList';
import type { OrderChannel, OrderStatus } from '@/verkauf/types';

export const dynamic = 'force-dynamic';

const CHANNELS: OrderChannel[] = ['shop', 'b2b_portal', 'marktplatz', 'telefon', 'manuell'];
const STATUSES: OrderStatus[] = ['angebot', 'auftrag', 'versendet', 'rechnung_gestellt', 'bezahlt', 'retoure', 'storniert'];
const PAGE_SIZE = 50;

export default async function BelegePage({ searchParams }:
  { searchParams: { channel?: string; q?: string; status?: string; from?: string; to?: string; sort?: string; page?: string } }) {
  const channel = CHANNELS.includes(searchParams.channel as OrderChannel)
    ? (searchParams.channel as OrderChannel) : undefined;
  const status = STATUSES.includes(searchParams.status as OrderStatus)
    ? (searchParams.status as OrderStatus) : undefined;
  const search = searchParams.q?.trim() || undefined;
  const from = searchParams.from || undefined;
  const to = searchParams.to || undefined;
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);

  const { rows, total } = await listOrderRowsPaged({
    channel, search, status, from, to, sort: searchParams.sort, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE,
  });

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verkauf · Sales</h2>
      <VerkaufList
        rows={rows} total={total} page={page} pageSize={PAGE_SIZE}
        channel={channel ?? ''} search={search ?? ''}
        status={status ?? ''} from={from ?? ''} to={to ?? ''}
      />
    </div>
  );
}
```

- [ ] **Step 3: `VerkaufList` um Status-Dropdown + Datumsfelder erweitern**

`src/components/VerkaufList.tsx` vollständig ersetzen:

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ORDER_SORT, type OrderRow, type OrderChannel, type OrderStatus } from '@/verkauf/types';
import { SortableTh } from './SortableTh';
import { Spur } from './Spur';

const CHANNELS: (OrderChannel | '')[] = ['', 'shop', 'b2b_portal', 'telefon', 'marktplatz', 'manuell'];
const CH_LABEL: Record<string, string> = {
  '': 'Alle', shop: 'Shop', b2b_portal: 'B2B', telefon: 'Telefon', marktplatz: 'Marktplatz', manuell: 'Manuell',
};
const STATUSES: OrderStatus[] = ['angebot', 'auftrag', 'versendet', 'rechnung_gestellt', 'bezahlt', 'retoure', 'storniert'];

function href(p: { channel: string; search: string; status: string; from: string; to: string; page: number; sort: string }) {
  const q = new URLSearchParams();
  if (p.channel) q.set('channel', p.channel);
  if (p.search) q.set('q', p.search);
  if (p.status) q.set('status', p.status);
  if (p.from) q.set('from', p.from);
  if (p.to) q.set('to', p.to);
  if (p.sort) q.set('sort', p.sort);
  if (p.page > 1) q.set('page', String(p.page));
  const s = q.toString();
  return `/verkauf/belege${s ? `?${s}` : ''}`;
}

export function VerkaufList({ rows, total, page, pageSize, channel, search, status, from, to }:
  { rows: OrderRow[]; total: number; page: number; pageSize: number; channel: OrderChannel | '';
    search: string; status: OrderStatus | ''; from: string; to: string }) {
  const router = useRouter();
  const sort = useSearchParams().get('sort') ?? '';
  const [q, setQ] = useState(search);
  const [f, setF] = useState(from);
  const [t, setT] = useState(to);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const base = { channel, status, from, to, sort };
  const go = (patch: Partial<Parameters<typeof href>[0]>) =>
    router.push(href({ ...base, search, from, to, page: 1, ...patch }));

  const dateInput =
    'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') go({ search: q, from: f, to: t }); }}
          placeholder="Nummer oder Kunde …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100" />
        <select value={status} onChange={(e) => go({ status: e.target.value })}
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100">
          <option value="">Alle Status</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input type="date" value={f} onChange={(e) => setF(e.target.value)} className={dateInput} aria-label="Von" />
        <span className="text-neutral-400">–</span>
        <input type="date" value={t} onChange={(e) => setT(e.target.value)} className={dateInput} aria-label="Bis" />
        <button onClick={() => go({ search: q, from: f, to: t })}
          className="rounded bg-neutral-200 px-3 py-1 text-sm text-neutral-700 hover:bg-neutral-300 dark:bg-neutral-700 dark:text-neutral-200">Filtern</button>
        {CHANNELS.map((c) => (
          <Link key={c} href={href({ ...base, channel: c, search, from, to, page: 1 })}
            className={`rounded px-3 py-1 text-sm ${channel === c
              ? 'bg-accent text-white'
              : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`}>{CH_LABEL[c]}</Link>
        ))}
        <Link href="/verkauf/neu"
          className="ml-auto rounded bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover">Neuer Beleg</Link>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="text-left text-neutral-500">
          <SortableTh col="number" label="Nummer" allowed={ORDER_SORT.allowed} fallback={ORDER_SORT.fallback} className="py-2" />
          <SortableTh col="contact" label="Kunde" allowed={ORDER_SORT.allowed} fallback={ORDER_SORT.fallback} />
          <SortableTh col="channel" label="Kanal" allowed={ORDER_SORT.allowed} fallback={ORDER_SORT.fallback} />
          <SortableTh col="status" label="Status" allowed={ORDER_SORT.allowed} fallback={ORDER_SORT.fallback} />
          <th className="anno">Spur</th>
          <SortableTh col="placed" label="Datum" allowed={ORDER_SORT.allowed} fallback={ORDER_SORT.fallback} />
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2"><Link href={`/verkauf/belege/${r.id}`} className="text-brand hover:text-brand-dark">{r.number}</Link></td>
              <td>{r.contactName}</td>
              <td>{CH_LABEL[r.channel]}</td>
              <td>{r.status}</td>
              <td><Spur stages={r.stages} /></td>
              <td className="text-neutral-500">{(r.placedAt ?? r.createdAt).slice(0, 10)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={6} className="py-6 text-center text-neutral-500">Keine Sales.</td></tr>
          )}
        </tbody>
      </table>
      <div className="flex items-center gap-3 pt-1 text-sm text-neutral-500">
        {page > 1
          ? <Link href={href({ ...base, search, from, to, page: page - 1 })} className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200">← Zurück</Link>
          : <span className="rounded px-3 py-1 text-neutral-400 dark:text-neutral-600">← Zurück</span>}
        <span>{total.toLocaleString('de-DE')} Sales · Seite {page.toLocaleString('de-DE')} von {totalPages.toLocaleString('de-DE')}</span>
        {page < totalPages
          ? <Link href={href({ ...base, search, from, to, page: page + 1 })} className="rounded bg-neutral-100 px-3 py-1 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200">Weiter →</Link>
          : <span className="rounded px-3 py-1 text-neutral-400 dark:text-neutral-600">Weiter →</span>}
      </div>
    </div>
  );
}
```

Hinweis: Der Rename aus Task 2 ist hier bereits eingearbeitet (Fußzeile/Leerzeile „Sales"); der Aktions-Button bleibt „Neuer Beleg".

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Deploy + Browser-Verifikation**

Auf VPS deployen, mit Chrome auf `/verkauf/belege`:
- Status-Dropdown filtert; von-bis grenzt nach Beleg-Datum ein; Kanal-Chips + Textsuche + Spalten-Sortierung wie zuvor; Pagination bleibt konsistent (Filter über Seiten erhalten).

Expected: Verhalten wie beschrieben, keine Konsolenfehler.

- [ ] **Step 6: Commit**

```bash
git add src/verkauf/repository.ts src/app/(shell)/verkauf/belege/page.tsx src/components/VerkaufList.tsx
git commit -m "feat(verkauf): Status- und Datums-Filter für die Belegliste (serverseitig)"
```

---

## Task 14: Hilfe-Doku aktualisieren

**Files:**
- Modify: `src/lib/help/content.ts` (Abschnitte `verkauf`, `verfuegbarkeit`, `finanzen`)

**Interfaces:**
- Consumes: bestehende `DocBlock`-Typen. Produces: nichts (Doku).

- [ ] **Step 1: Verkauf-Hilfe ergänzen**

In `src/lib/help/content.ts`, Abschnitt `slug: 'verkauf'`, den Block „Übersicht & Kanäle (Ebene 1)" (ab Zeile ~153) um den Zeitraum-/Kurven-Hinweis erweitern — den `list`-Block um zwei Punkte ergänzen:

```ts
            'Zeitraum: Standardzeiträume (7/30/90/365/Komplett) plus benutzerdefinierter von-bis-Bereich (zwei Datumsfelder → Anwenden).',
            'KPI-Kacheln Umsatz, Sales und Ø Belegwert sind anklickbar — darunter klappt die jeweilige Verlaufskurve für den gewählten Zeitraum auf (eine gleichzeitig).',
```

Zusätzlich im Block „Wichtige Funktionen" den Beleglisten-Punkt (Zeile ~143) ersetzen:

```ts
            'Sales-Liste (Belege) über alle Kanäle mit Kurz-Spur je Zeile, sortierbar und filterbar nach Kanal, Status, Datum (von-bis) und Freitext.',
```

- [ ] **Step 2: Verfügbarkeit-Hilfe ergänzen**

Abschnitt `slug: 'verfuegbarkeit'`, Block „Bestandsverlauf & Nachliefer-Prognose", den ersten `p`-Text (Zeile ~204) ersetzen:

```ts
          { type: 'p', text: 'Die Übersicht zeigt drei KPIs — Gesamtbestand (anklickbar: Verlaufskurve für den gewählten Zeitraum), Anzahl Artikel unter Meldebestand und Anzahl Artikel mit Reichweite unter 90 Tagen — sowie eine sortier- und filterbare Kategorie-Tabelle mit denselben Kennzahlen je Kategorie. Ein Zeitraum-Selektor (Standard + von-bis) steuert die Kurve.' },
```

- [ ] **Step 3: Finanzen-Hilfe ergänzen**

Abschnitt `slug: 'finanzen'`, Block „Wichtige Funktionen", den `list`-Block um einen Punkt ergänzen:

```ts
            'Offene-Posten-Tabelle sortierbar und pro Spalte filterbar (Richtung, Status, Betrag, Rest, Kontakt, Referenz); ein Zeitraum-Selektor (Standard + von-bis) grenzt nach Fälligkeit ein.',
```

- [ ] **Step 4: Registry-Test**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (jede App hat weiterhin eine Hilfeseite).

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(hilfe): Zeitraum-von-bis, KPI-Kurven, Tabellenfilter dokumentiert"
```

---

## Task 15: Gesamtabnahme

- [ ] **Step 1: Volle Testsuite**

Run: `npx vitest run`
Expected: PASS (bekannte Ausnahme: `tests/db/rls.test.ts` — 16 erwartete Fehler auf diesem Host, siehe Memory `rls-tests-fail-on-supabase`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Deploy auf VPS + End-to-End-Durchlauf mit Chrome**

Alle drei Übersichten und die Belegliste durchklicken: Zeiträume inkl. von-bis, Akkordeon-Kurven (genau eine offen), Spalten-Sortierung + Pro-Spalte-Filter, Belege-Status/Datum-Filter, entfernter Sidebar-Eintrag „Neuer Beleg", „Sales"-Beschriftung. Dark Mode auf jeder Fläche gegenprüfen.

Expected: alles wie spezifiziert, keine Konsolen-/Netzwerkfehler.

---

## Self-Review

**Spec-Abdeckung:**
- Punkt 1 (klickbare KPIs + Kurve, Akkordeon, wo Daten): Tasks 4, 6, 7, 9 (Verkauf), 10 (Verfügbarkeit Gesamtbestand). Finanzen ohne Historie → Kacheln nicht klickbar (Task 11). ✓
- Punkt 2 (Tabellen sortier-/filterbar, Standard für neue): Tasks 5, 8 (DataTable), 10 (Rollup), 11 (Offene Posten), 13 (Belege serverseitig). ✓
- Punkt 3 (Standard + von-bis, alle drei Module): Tasks 3, 12 (Filters), Anbindung in 9/10/11; Belege-von-bis in 13. ✓
- Punkt 4 („Neuer Beleg" aus Menü): Task 1. ✓
- Punkt 5 („Belege"→„Sales", nur Anzeige): Tasks 2, 13. ✓
- Doku (Projektregel): Task 14. ✓

**Placeholder-Scan:** keine TBD/TODO; alle Code-Schritte mit vollständigem Code. ✓

**Typ-Konsistenz:** `KpiTrendItem`/`Column<T>`/`SalesDailyPoint`/`OpenItemFilter` in allen Nutzungen identisch benannt; `resolveRange(param, end, custom)`-Signatur in Tasks 9/10/11 gleich; `bucketSum`/`pickBucket`-Namen einheitlich. ✓

**Scope:** Bewusst außerhalb: Kurven für Verfügbarkeit-KPIs „Unter Meldebestand"/„Reichweite<90" (benötigten rollierende Snapshot-Joins) und alle Finanzen-KPIs (kein Snapshot) — konsistent mit der Spec („wo Daten da sind"). Client-`DataTable` nur für vollständig geladene Tabellen; Belege bleibt serverseitig.
