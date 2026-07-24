# Email-Marketing-Seite (Verkauf) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine neue Unterseite `/verkauf/email-marketing`, die Anmeldungen, Abmeldungen und Netto-Wachstum aus den bereits gespeicherten `subscribers`-Daten als KPI-Kacheln plus kombiniertem Chart darstellt.

**Architecture:** Reine Aggregationsfunktion (`src/verkauf/email-marketing.ts`) bündelt die vorhandenen `subscribers`-Zeilen (alle Quellen) je Zeit-Bucket und berechnet Netto = Anmeldungen − Abmeldungen. Eine Client-Chart-Komponente (recharts `ComposedChart`) und eine Server-Page verdrahten Daten, Filter und Darstellung. Kein neuer API-Call, keine neue Tabelle, kein Sync-Change.

**Tech Stack:** Next.js App Router (Server Components), TypeScript, Supabase-Client (`loadDataset`), recharts, vitest.

## Global Constraints

- ERP-Design-System ist bindend: Akzentfarbe nur über `--accent`/`var(--brand)`, warme `neutral`-Palette, keine kalten Grau-/Slate-Töne, kein pures Weiß/Schwarz außerhalb `neutral-0`/`neutral-950`. Dark-Mode für alles Neue Pflicht. (`docs/design/design-system.md`, `CLAUDE.md`)
- Chartfarben & Zahlenformate ausschließlich aus `src/components/charts/chart-style.ts` (`BRAND`, `MUTED`, `CATEGORICAL`, `TICK`, `TOOLTIP_LABEL_STYLE`, `num`) — keine hardcodierten Farben.
- Hilfe-Modul (`src/lib/help/content.ts`) bei Funktionsänderung mitpflegen (`CLAUDE.md`).
- Aggregationslogik bleibt DB-frei und rein → per vitest ohne DB testbar (die Verkauf-DB-Suite läuft auf der Dev-DB nicht).
- `subscribers` wird ausschließlich von den E-Mail/CRM-Connectoren (Mailchimp, Klaviyo) befüllt; „alle Quellen zusammen" = alle Zeilen aggregieren, kein Quellenfilter.
- Deployment nur auf dem VPS (`CLAUDE.md`); nie lokal hochfahren. Tests (`npx vitest`) laufen lokal.

---

## File Structure

- `src/verkauf/email-marketing.ts` (neu) — reine Aggregation `aggregateSubscribers(rows, range)`; Typen `EmailMarketingPoint`, `EmailMarketingData`.
- `tests/verkauf/email-marketing.test.ts` (neu) — Unit-Tests der Aggregation.
- `src/components/EmailMarketingChart.tsx` (neu) — Client-`ComposedChart` (Balken Anmeldungen/Abmeldungen + Netto-Linie).
- `src/app/(shell)/verkauf/email-marketing/page.tsx` (neu) — Server-Page: lädt Daten, aggregiert, rendert Kacheln + Chart + Filter.
- `src/components/VerkaufSidebar.tsx` (ändern) — ein `ITEMS`-Eintrag.
- `src/lib/help/content.ts` (ändern) — Hilfe-Abschnitt zur neuen Seite.

---

### Task 1: Aggregationsfunktion `aggregateSubscribers`

**Files:**
- Create: `src/verkauf/email-marketing.ts`
- Test: `tests/verkauf/email-marketing.test.ts`

**Interfaces:**
- Consumes: `Subscriber`, `DateRange` aus `@/lib/types`; `inRange` aus `@/kpi/helpers`; `pickBucket`, `bucketSum` aus `@/lib/series`.
- Produces:
  - `interface EmailMarketingPoint { date: string; signups: number; unsubscribes: number; netto: number }`
  - `interface EmailMarketingData { totals: { signups: number; unsubscribes: number; netto: number }; series: EmailMarketingPoint[] }`
  - `function aggregateSubscribers(rows: Subscriber[], range: DateRange): EmailMarketingData`

- [ ] **Step 1: Write the failing test**

Create `tests/verkauf/email-marketing.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aggregateSubscribers } from '@/verkauf/email-marketing';
import type { Subscriber } from '@/lib/types';

const row = (date: string, signups: number, unsubscribes: number, source = 'mailchimp'): Subscriber =>
  ({ date, source: source as Subscriber['source'], signups, unsubscribes, npsScore: null });

describe('aggregateSubscribers', () => {
  it('summiert Anmeldungen/Abmeldungen und berechnet Netto', () => {
    const rows = [row('2026-07-01', 10, 3), row('2026-07-02', 5, 1)];
    const { totals } = aggregateSubscribers(rows, { start: '2026-07-01', end: '2026-07-31' });
    expect(totals).toEqual({ signups: 15, unsubscribes: 4, netto: 11 });
  });

  it('ignoriert Zeilen außerhalb des Bereichs', () => {
    const rows = [row('2026-06-30', 100, 50), row('2026-07-01', 10, 2)];
    const { totals } = aggregateSubscribers(rows, { start: '2026-07-01', end: '2026-07-31' });
    expect(totals).toEqual({ signups: 10, unsubscribes: 2, netto: 8 });
  });

  it('aggregiert mehrere Quellen in denselben Tag', () => {
    const rows = [row('2026-07-01', 10, 2, 'mailchimp'), row('2026-07-01', 4, 1, 'klaviyo')];
    const { series } = aggregateSubscribers(rows, { start: '2026-07-01', end: '2026-07-05' });
    expect(series).toEqual([{ date: '2026-07-01', signups: 14, unsubscribes: 3, netto: 11 }]);
  });

  it('bucketet lange Zeiträume (>92 Tage) wochenweise auf Montage', () => {
    // 2026-07-01 = Mittwoch, 2026-07-03 = Freitag → gleiche ISO-Woche (Montag 2026-06-29)
    const rows = [row('2026-07-01', 10, 2), row('2026-07-03', 5, 1)];
    const { series } = aggregateSubscribers(rows, { start: '2026-01-01', end: '2026-07-31' });
    expect(series).toEqual([{ date: '2026-06-29', signups: 15, unsubscribes: 3, netto: 12 }]);
  });

  it('nimmt Buckets mit nur Abmeldungen (keine Anmeldungen) mit', () => {
    const rows = [row('2026-07-02', 0, 4)];
    const { series } = aggregateSubscribers(rows, { start: '2026-07-01', end: '2026-07-05' });
    expect(series).toEqual([{ date: '2026-07-02', signups: 0, unsubscribes: 4, netto: -4 }]);
  });

  it('leere Eingabe ⇒ Nullsummen und leere Reihe', () => {
    const { totals, series } = aggregateSubscribers([], { start: '2026-07-01', end: '2026-07-31' });
    expect(totals).toEqual({ signups: 0, unsubscribes: 0, netto: 0 });
    expect(series).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/verkauf/email-marketing.test.ts`
Expected: FAIL — `aggregateSubscribers` kann nicht importiert werden (Modul existiert nicht).

- [ ] **Step 3: Write minimal implementation**

Create `src/verkauf/email-marketing.ts`:

```ts
import type { Subscriber, DateRange } from '@/lib/types';
import { inRange } from '@/kpi/helpers';
import { pickBucket, bucketSum } from '@/lib/series';

export interface EmailMarketingPoint {
  date: string;
  signups: number;
  unsubscribes: number;
  netto: number;
}

export interface EmailMarketingData {
  totals: { signups: number; unsubscribes: number; netto: number };
  series: EmailMarketingPoint[];
}

// Bündelt die vorhandenen subscribers-Zeilen (alle Quellen) je Zeit-Bucket und
// berechnet Netto = Anmeldungen − Abmeldungen. Bewusst DB-frei und rein.
export function aggregateSubscribers(rows: Subscriber[], range: DateRange): EmailMarketingData {
  const inr = rows.filter((r) => inRange(r.date, range));
  const signups = inr.reduce((s, r) => s + r.signups, 0);
  const unsubscribes = inr.reduce((s, r) => s + r.unsubscribes, 0);

  const bucket = pickBucket(range);
  const signupSeries = bucketSum(inr.map((r) => ({ date: r.date, value: r.signups })), bucket);
  const unsubSeries = bucketSum(inr.map((r) => ({ date: r.date, value: r.unsubscribes })), bucket);

  const byDate = new Map<string, EmailMarketingPoint>();
  for (const p of signupSeries) {
    byDate.set(p.date, { date: p.date, signups: p.value, unsubscribes: 0, netto: p.value });
  }
  for (const p of unsubSeries) {
    const cur = byDate.get(p.date) ?? { date: p.date, signups: 0, unsubscribes: 0, netto: 0 };
    cur.unsubscribes = p.value;
    cur.netto = cur.signups - p.value;
    byDate.set(p.date, cur);
  }
  const series = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));

  return { totals: { signups, unsubscribes, netto: signups - unsubscribes }, series };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/verkauf/email-marketing.test.ts`
Expected: PASS (6 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/verkauf/email-marketing.ts tests/verkauf/email-marketing.test.ts
git commit -m "feat(verkauf): Aggregation fuer Email-Marketing-Kennzahlen"
```

---

### Task 2: Chart-Komponente `EmailMarketingChart`

**Files:**
- Create: `src/components/EmailMarketingChart.tsx`

**Interfaces:**
- Consumes: `EmailMarketingPoint` aus `@/verkauf/email-marketing`; `ChartCard` aus `@/components/charts/ChartCard`; `BRAND`, `MUTED`, `CATEGORICAL`, `TICK`, `TOOLTIP_LABEL_STYLE`, `num` aus `@/components/charts/chart-style`.
- Produces: `function EmailMarketingChart({ series }: { series: EmailMarketingPoint[] })`

- [ ] **Step 1: Write the component**

Create `src/components/EmailMarketingChart.tsx`:

```tsx
'use client';
import { ResponsiveContainer, ComposedChart, Line, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, MUTED, CATEGORICAL, TICK, TOOLTIP_LABEL_STYLE, num } from '@/components/charts/chart-style';
import type { EmailMarketingPoint } from '@/verkauf/email-marketing';

// Anmeldungen (Balken) und Abmeldungen (Balken) auf gemeinsamer Zeitachse,
// Netto als überlagerte Linie. Farben aus den geteilten Chart-Tokens.
export function EmailMarketingChart({ series }: { series: EmailMarketingPoint[] }) {
  if (series.length === 0) {
    return (
      <ChartCard title="Anmeldungen & Abmeldungen">
        <p className="mt-3 text-sm text-neutral-500">
          Noch keine Newsletter-Daten im gewählten Zeitraum.
        </p>
      </ChartCard>
    );
  }
  return (
    <ChartCard title="Anmeldungen & Abmeldungen">
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={MUTED} strokeOpacity={0.25} vertical={false} />
            <XAxis dataKey="date" tick={TICK} minTickGap={24} />
            <YAxis tick={TICK} width={48} tickFormatter={(n) => num(Number(n))} />
            <Tooltip formatter={(v, n) => [num(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend />
            <Bar dataKey="signups" name="Anmeldungen" fill={BRAND} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="unsubscribes" name="Abmeldungen" fill={MUTED} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Line dataKey="netto" name="Netto" stroke={CATEGORICAL[3]} strokeWidth={2} dot={false} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
```

- [ ] **Step 2: Typecheck the component**

Run: `npx tsc --noEmit`
Expected: PASS (keine neuen Typfehler). Falls das Repo kein `tsc`-Script hat, ist `npx tsc --noEmit` dennoch nutzbar; alternativ `npx next lint` bzw. der Build in Task 4.

- [ ] **Step 3: Commit**

```bash
git add src/components/EmailMarketingChart.tsx
git commit -m "feat(verkauf): kombinierter Chart fuer Email-Marketing"
```

---

### Task 3: Seite + Navigation

**Files:**
- Create: `src/app/(shell)/verkauf/email-marketing/page.tsx`
- Modify: `src/components/VerkaufSidebar.tsx:5-9`

**Interfaces:**
- Consumes: `createClient` aus `@/lib/supabase/server`; `loadDataset` aus `@/kpi/repository`; `aggregateSubscribers` aus `@/verkauf/email-marketing`; `resolveRange` aus `@/lib/range`; `Filters` aus `@/components/Filters`; `KpiTrendRow`, `KpiTrendItem` aus `@/components/KpiTrendRow`; `EmailMarketingChart` aus `@/components/EmailMarketingChart`; `num` aus `@/components/charts/chart-style`.

- [ ] **Step 1: Add the sidebar nav item**

In `src/components/VerkaufSidebar.tsx` die `ITEMS`-Liste (Zeilen 5-9) erweitern — neue Zeile nach dem WooCommerce-Eintrag:

```tsx
const ITEMS = [
  { href: '/verkauf', label: 'Übersicht' },
  { href: '/verkauf/dashboard', label: 'E-Commerce' },
  { href: '/verkauf/woocommerce', label: 'WooCommerce' },
  { href: '/verkauf/email-marketing', label: 'Email-Marketing' },
];
```

- [ ] **Step 2: Create the page**

Create `src/app/(shell)/verkauf/email-marketing/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { loadDataset } from '@/kpi/repository';
import { aggregateSubscribers } from '@/verkauf/email-marketing';
import { resolveRange } from '@/lib/range';
import { Filters } from '@/components/Filters';
import { KpiTrendRow, type KpiTrendItem } from '@/components/KpiTrendRow';
import { EmailMarketingChart } from '@/components/EmailMarketingChart';
import { num } from '@/components/charts/chart-style';

export const dynamic = 'force-dynamic';

export default async function EmailMarketingPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end, { start: searchParams.start, end: searchParams.end });

  const supabase = createClient();
  const data = await loadDataset(supabase);
  const { totals, series } = aggregateSubscribers(data.subscribers, range);

  const nettoStr = `${totals.netto >= 0 ? '+' : '−'}${num(Math.abs(totals.netto))}`;
  const items: KpiTrendItem[] = [
    { key: 'signups', label: 'Anmeldungen', value: num(totals.signups) },
    { key: 'unsubscribes', label: 'Abmeldungen', value: num(totals.unsubscribes) },
    { key: 'netto', label: 'Netto', value: nettoStr, anno: 'ANMELDUNGEN − ABMELDUNGEN' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verkauf · Email-Marketing</h2>
        <Filters range={range} basePath="/verkauf/email-marketing" />
      </div>
      <KpiTrendRow items={items} gridClassName="grid gap-3 sm:grid-cols-3" />
      <EmailMarketingChart series={series} />
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (keine neuen Typfehler).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(shell)/verkauf/email-marketing/page.tsx" src/components/VerkaufSidebar.tsx
git commit -m "feat(verkauf): Seite Email-Marketing mit Kacheln und Chart"
```

---

### Task 4: Hilfe-Doku + Verifikation

**Files:**
- Modify: `src/lib/help/content.ts` (Verkauf-Eintrag, `sections`-Array, nach dem Abschnitt „Übersicht & Kanäle (Ebene 1)")

**Interfaces:**
- Consumes: bestehendes Section-Format (`{ heading, blocks: [{ type: 'p'|'list'|'note', ... }] }`).

- [ ] **Step 1: Add the help section**

In `src/lib/help/content.ts`, im `verkauf`-Eintrag (`slug: 'verkauf'`) in das `sections`-Array direkt **nach** dem Objekt mit `heading: 'Übersicht & Kanäle (Ebene 1)'` folgendes Section-Objekt einfügen:

```ts
      {
        heading: 'Email-Marketing',
        blocks: [
          { type: 'p', text: 'Unter Verkauf → Email-Marketing werden die Newsletter-Kennzahlen aus den angebundenen E-Mail/CRM-Systemen (Mailchimp, Klaviyo) für den gewählten Zeitraum dargestellt: Anmeldungen, Abmeldungen und Netto (Anmeldungen − Abmeldungen).' },
          { type: 'list', items: [
            'Drei KPI-Kacheln zeigen die Summen über den Zeitraum.',
            'Der kombinierte Verlauf zeigt Anmeldungen und Abmeldungen als Balken sowie das Netto-Wachstum als Linie; die Zeitachse bündelt je nach Zeitraum täglich, wöchentlich oder monatlich.',
            'Die Zahlen stammen aus den bereits synchronisierten Abonnenten-Daten (keine zusätzliche Abfrage); Öffnungs-/Klickraten je Kampagne sind hier bewusst nicht enthalten.',
          ] },
        ],
      },
```

- [ ] **Step 2: Run the help-content registry test**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (Registry weiterhin konsistent; Email-Marketing ist Unterseite von `verkauf`, keine neue App).

- [ ] **Step 3: Run the full suite for affected areas**

Run: `npx vitest run tests/verkauf/email-marketing.test.ts tests/lib/help-content.test.ts`
Expected: PASS.

- [ ] **Step 4: Production build (validates page + imports)**

Run: `npx next build`
Expected: Build erfolgreich; `/verkauf/email-marketing` erscheint in der Routenliste. (Kein lokales Hochfahren — nur Build zur Verifikation; Deployment/Live-Check erfolgt auf dem VPS.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(verkauf): Hilfe-Abschnitt Email-Marketing"
```

---

## Verifikation (End-to-End, nach allen Tasks)

- `npx vitest run tests/verkauf/email-marketing.test.ts tests/lib/help-content.test.ts` → grün.
- `npx next build` → erfolgreich, Route `/verkauf/email-marketing` vorhanden.
- Deployment und visueller Check (Kacheln, Chart, Dark-Mode, Filter-Presets) auf dem VPS (`https://budp.lumeapps.de`), gemäß `CLAUDE.md` — nicht lokal.

## Self-Review (durchgeführt)

- **Spec-Abdeckung:** Route/Nav (Task 3), Datenfluss + Aggregation (Task 1), Kacheln + kombinierter Chart (Task 2/3), Tests (Task 1), Doku (Task 4) — alle Spec-Abschnitte abgedeckt.
- **Platzhalter:** keine — jeder Code-Schritt zeigt vollständigen Code, jeder Befehl eine erwartete Ausgabe.
- **Typkonsistenz:** `EmailMarketingPoint`/`EmailMarketingData`/`aggregateSubscribers` in Task 1 definiert, in Task 2 (`series`) und Task 3 (`totals`, `series`) konsistent verwendet; `KpiTrendItem`-Felder (`key,label,value,anno`) stimmen mit `src/components/KpiTrendRow.tsx` überein; `Filters`-Props (`range`, `basePath`) verifiziert; `createClient()` ist synchron (verifiziert).
