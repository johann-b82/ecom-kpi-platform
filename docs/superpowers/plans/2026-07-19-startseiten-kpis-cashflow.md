# Startseiten-KPIs & Cashflow-Chart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Startseite zeigt Umsatzwachstum (periodengleiches MoM) und operativen Cashflow (Einzahlungen) statt „Umsatz akt. Monat" und „Offene Posten"; `/finanzen` bekommt einen Cashflow-Verlaufschart; die `/verkauf`-Kachel „Offene Angebote" entfällt.

**Architecture:** Reine Rechen-/Datums-Helfer in `src/verkauf/growth.ts` (DB-frei, unit-getestet). Zwei neue Aggregat-Funktionen in `src/finanzen/repository.ts` für Einzahlungen (Summe und je-Tag, nur Debitor-Zahlungseingänge). Server-Komponenten (`page.tsx` der Startseite, `/finanzen`, `/verkauf`) verdrahten die Werte und rendern über bestehende Chart-/Kachel-Komponenten.

**Tech Stack:** Next.js App Router (Server Components), TypeScript, PostgreSQL via `pg` pool, Vitest + Testing Library, Recharts (über `KpiLineChart`/`ChartCard`).

## Global Constraints

- Design-Standard verbindlich: Akzent nur via `--accent`, warme `neutral`-Palette, `dark:`-Varianten Pflicht, `anno`-Klasse für UPPERCASE-Mikrolabels. Keine kalten Grautöne, kein hartes Weiß/Schwarz außer `neutral-0`/`neutral-950`.
- Beträge sind netto (ohne MwSt); Cashflow zählt **nur Debitor-zugeordnete** Zahlungen (`open_items.direction='debitor'`), **nicht** `open_item_id IS NULL`.
- Wachstum = periodengleiches MoM: laufender Monat 1.–heute vs. Vormonat 1.–gleicher Tag (auf Monatsende geklemmt). Bei Vorperiode 0 → Anzeige `–`.
- Deployment nur auf dem VPS (`https://budp.lumeapps.de`); lokal **kein** `docker compose up`/`npm run dev`. Tests lokal via `npx vitest`.
- DB-Tests gegen eine frische Schwester-Test-DB fahren (Dev-DB hat Seed-Kollision mit echten WooCommerce-Daten).
- Hilfe-Modul (`src/lib/help/content.ts`) bei Funktionsänderung mitpflegen; der Registry-Test erzwingt eine Modul-Hilfeseite je App.

---

### Task 1: Reine Wachstums- & Datums-Helfer (`src/verkauf/growth.ts`)

**Files:**
- Create: `src/verkauf/growth.ts`
- Test: `tests/verkauf/growth.test.ts`

**Interfaces:**
- Consumes: `DateRange` aus `src/verkauf/types.ts` (`{ start: string; end: string }`, ISO `YYYY-MM-DD`, inklusiv).
- Produces:
  - `revenueGrowth(current: number, previous: number): number | null` — Prozent-Delta; `null` wenn `previous === 0`.
  - `formatGrowth(value: number | null): string` — `–` bei `null`, sonst z. B. `+13,6 %` / `−4,2 %` (eine Nachkommastelle, echtes Minus `−` U+2212, `de-DE`).
  - `monthToDateRanges(today: string): { current: DateRange; previous: DateRange }` — periodengleiches MoM-Fensterpaar.

- [ ] **Step 1: Write the failing test**

Create `tests/verkauf/growth.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { revenueGrowth, formatGrowth, monthToDateRanges } from '@/verkauf/growth';

describe('revenueGrowth', () => {
  it('positives Wachstum', () => { expect(revenueGrowth(110, 100)).toBeCloseTo(10, 6); });
  it('negatives Wachstum', () => { expect(revenueGrowth(90, 100)).toBeCloseTo(-10, 6); });
  it('Gleichstand ist 0', () => { expect(revenueGrowth(100, 100)).toBe(0); });
  it('Vorperiode 0 ⇒ null (unbestimmt)', () => { expect(revenueGrowth(50, 0)).toBeNull(); });
});

describe('formatGrowth', () => {
  it('null ⇒ Gedankenstrich', () => { expect(formatGrowth(null)).toBe('–'); });
  it('positiv mit Pluszeichen', () => { expect(formatGrowth(13.6)).toBe('+13,6 %'); });
  it('negativ mit echtem Minus', () => { expect(formatGrowth(-4.2)).toBe('−4,2 %'); });
});

describe('monthToDateRanges', () => {
  it('Monatsmitte: gleiche Tagesspanne im Vormonat', () => {
    expect(monthToDateRanges('2026-07-19')).toEqual({
      current: { start: '2026-07-01', end: '2026-07-19' },
      previous: { start: '2026-06-01', end: '2026-06-19' },
    });
  });
  it('klemmt den Tag auf das Vormonatsende (31. März ⇒ 28. Feb)', () => {
    expect(monthToDateRanges('2026-03-31')).toEqual({
      current: { start: '2026-03-01', end: '2026-03-31' },
      previous: { start: '2026-02-01', end: '2026-02-28' },
    });
  });
  it('Jahreswechsel: Januar ⇒ Dezember Vorjahr', () => {
    expect(monthToDateRanges('2026-01-15')).toEqual({
      current: { start: '2026-01-01', end: '2026-01-15' },
      previous: { start: '2025-12-01', end: '2025-12-15' },
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/verkauf/growth.test.ts`
Expected: FAIL — `Failed to resolve import "@/verkauf/growth"`.

- [ ] **Step 3: Write minimal implementation**

Create `src/verkauf/growth.ts`:

```ts
import type { DateRange } from './types';

// null ⇒ unbestimmt (Vorperiode 0). Sonst Prozent-Delta (current vs. previous).
export function revenueGrowth(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}

// Anzeige-Format der Wachstumskachel: Vorzeichen + eine Nachkommastelle + „ %".
// Echtes Minus (−, U+2212) statt Bindestrich; „–" bei unbestimmtem Wachstum.
export function formatGrowth(value: number | null): string {
  if (value === null) return '–';
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  const body = Math.abs(value).toLocaleString('de-DE', {
    minimumFractionDigits: 1, maximumFractionDigits: 1,
  });
  return `${sign}${body} %`;
}

// Periodengleiches MoM: laufender Monat 1.–heute vs. Vormonat 1.–gleicher Tag,
// wobei der Tag auf das Vormonatsende geklemmt wird (31. März ⇒ 28./29. Feb).
export function monthToDateRanges(today: string): { current: DateRange; previous: DateRange } {
  const [y, m, d] = today.split('-').map(Number);
  const iso = (yy: number, mm: number, dd: number) =>
    `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const pm = m === 1 ? 12 : m - 1;
  const py = m === 1 ? y - 1 : y;
  const daysInPrev = new Date(py, pm, 0).getDate(); // Tag 0 des Folgemonats = letzter Tag von pm
  const prevDay = Math.min(d, daysInPrev);
  return {
    current: { start: iso(y, m, 1), end: today },
    previous: { start: iso(py, pm, 1), end: iso(py, pm, prevDay) },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/verkauf/growth.test.ts`
Expected: PASS (10 Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/verkauf/growth.ts tests/verkauf/growth.test.ts
git commit -m "feat(verkauf): reine Helfer für Umsatzwachstum (periodengleiches MoM)"
```

---

### Task 2: Cashflow-Aggregate im Finanzen-Repository

**Files:**
- Modify: `src/finanzen/repository.ts` (neue Exporte am Dateiende; Import `DateRange` ergänzen)
- Test: `tests/finanzen/repository.test.ts` (neuer `describe`-Block; nutzt vorhandenes Seed/Teardown)

**Interfaces:**
- Consumes: `pool` aus `@/lib/db`; `DateRange` aus `@/verkauf/types`; Tabellen `payments` (`open_item_id`, `amount`, `paid_at`) und `open_items` (`id`, `direction`).
- Produces:
  - `cashflowIn(range: DateRange): Promise<number>` — Summe der Debitor-Zahlungseingänge im Zeitraum (brutto).
  - `cashflowInByDay(range: DateRange): Promise<{ day: string; amount: number }[]>` — dieselben Eingänge je Tag (`day` = `YYYY-MM-DD`), aufsteigend.

- [ ] **Step 1: Write the failing test**

In `tests/finanzen/repository.test.ts` den Import um die neuen Funktionen erweitern:

```ts
import {
  listOpenItems, getOpenItem, listContactOptions, listOpenItemOptions, listUnassignedPayments,
  listPurchaseOrderOptions,
  recordPayment, assignPayment, recordUnassignedPayment, createKreditorInvoice, exportBookings,
  cashflowIn, cashflowInByDay,
} from '@/finanzen/repository';
```

Und am Ende der Datei (vor der letzten schließenden Zeile) einen neuen Block einfügen. Der Zeitraum `2020-03` ist bewusst historisch gewählt, damit weder Seed- noch andere Test-Zahlungen (die `now()` verwenden) hineinfallen:

```ts
describe('finanzen repository — cashflow (Einzahlungen)', () => {
  const WINDOW = { start: '2020-03-01', end: '2020-03-31' };

  it('cashflowIn summiert nur Debitor-Eingänge im Zeitraum; Kreditor & nicht zugeordnet zählen nicht', async () => {
    // Debitor-Eingang im Fenster → zählt
    const { openItemId, amount } = await invoicedOrder(3, 10); // 30,00
    await recordPayment(openItemId, { amount, method: 'ueberweisung', reference: 'TEST-cf-deb', paidAt: '2020-03-15' });

    // Kreditor-Zahlung im Fenster → zählt NICHT
    const kredId = await createKreditorInvoice({
      supplierId: MUELLER, amount: 99, dueDate: '2020-04-30', reference: 'TEST-cf-kred',
    });
    kreditorItemIds.push(kredId);
    await recordPayment(kredId, { amount: 99, method: 'ueberweisung', reference: 'TEST-cf-kredpay', paidAt: '2020-03-16' });

    // nicht zugeordnete Zahlung im Fenster → zählt NICHT
    await recordUnassignedPayment({ amount: 77, method: 'ueberweisung', reference: 'TEST-cf-unassigned', paidAt: '2020-03-17' });

    const total = await cashflowIn(WINDOW);
    expect(total).toBeCloseTo(amount, 2); // exakt der Debitor-Eingang, sonst nichts im 2020-03-Fenster
  });

  it('cashflowInByDay bucketet den Debitor-Eingang auf seinen Zahltag', async () => {
    const { openItemId, amount } = await invoicedOrder(2, 12.5); // 25,00
    await recordPayment(openItemId, { amount, method: 'ueberweisung', reference: 'TEST-cf-day', paidAt: '2020-03-20' });

    const rows = await cashflowInByDay(WINDOW);
    const point = rows.find((r) => r.day === '2020-03-20');
    expect(point).toBeDefined();
    expect(point!.amount).toBeGreaterThanOrEqual(amount - 0.001); // ggf. + Debitor-Eingang aus Test 1 an anderem Tag; hier eigener Tag
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/finanzen/repository.test.ts`
Expected: FAIL — `cashflowIn is not a function` / Import nicht auflösbar.

- [ ] **Step 3: Write minimal implementation**

In `src/finanzen/repository.ts` den Typ-Import ergänzen (oben bei den bestehenden Imports):

```ts
import type { DateRange } from '@/verkauf/types';
```

Und am Dateiende anhängen:

```ts
// Operativer Cashflow — Einzahlungen: Zahlungseingänge auf Debitor-Posten.
// Nicht zugeordnete Zahlungen (open_item_id IS NULL) zählen bewusst nicht mit
// (JOIN statt LEFT JOIN); sie fließen erst nach Zuordnung ein.
export async function cashflowIn(range: DateRange): Promise<number> {
  const r = await pool.query<{ total: number }>(
    `SELECT COALESCE(SUM(p.amount), 0)::float8 AS total
       FROM payments p JOIN open_items oi ON oi.id = p.open_item_id
      WHERE oi.direction = 'debitor'
        AND p.paid_at::date BETWEEN $1 AND $2`,
    [range.start, range.end]);
  return Number(r.rows[0].total);
}

export async function cashflowInByDay(range: DateRange): Promise<{ day: string; amount: number }[]> {
  const r = await pool.query(
    `SELECT p.paid_at::date::text AS day, COALESCE(SUM(p.amount), 0)::float8 AS amount
       FROM payments p JOIN open_items oi ON oi.id = p.open_item_id
      WHERE oi.direction = 'debitor'
        AND p.paid_at::date BETWEEN $1 AND $2
      GROUP BY day ORDER BY day`,
    [range.start, range.end]);
  return r.rows.map((x: any) => ({ day: x.day, amount: Number(x.amount) }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/finanzen/repository.test.ts`
Expected: PASS (bestehende + zwei neue Tests grün).

- [ ] **Step 5: Commit**

```bash
git add src/finanzen/repository.ts tests/finanzen/repository.test.ts
git commit -m "feat(finanzen): cashflowIn/cashflowInByDay — Debitor-Einzahlungen aggregieren"
```

---

### Task 3: Startseiten-Kacheln umstellen (Wachstum + Cashflow)

**Files:**
- Modify: `src/components/StartOverview.tsx`
- Modify: `src/app/(shell)/page.tsx`
- Test: `tests/components/start-overview.test.tsx`

**Interfaces:**
- Consumes: `formatGrowth` aus `@/verkauf/growth`; `revenueGrowth`, `monthToDateRanges` aus `@/verkauf/growth`; `salesTotals` aus `@/verkauf/repository`; `cashflowIn` aus `@/finanzen/repository`; `eur` aus `@/finanzen/format`.
- Produces: neues `OverviewSignals`:
  ```ts
  export interface OverviewSignals {
    revenueGrowthPct?: number | null; // undefined ⇒ kein Verkauf-Zugriff; null ⇒ Vorperiode 0
    reichweite90?: number;
    cashflowIn?: number;
  }
  ```

- [ ] **Step 1: Update the component test (failing)**

Ersetze den Inhalt von `tests/components/start-overview.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StartOverview } from '@/components/StartOverview';

afterEach(cleanup);

describe('StartOverview', () => {
  it('zeigt Umsatzwachstum (mit Vorzeichen) statt Umsatz akt. Monat und verlinkt in den Verkauf', () => {
    render(<StartOverview signals={{ revenueGrowthPct: 13.6 }} />);
    expect(screen.getByText('Umsatzwachstum')).toBeTruthy();
    expect(screen.getByText('+13,6 %')).toBeTruthy();
    expect(screen.queryByText('Umsatz akt. Monat')).toBeNull();
    expect(screen.getByRole('link', { name: /Umsatzwachstum/ }).getAttribute('href')).toBe('/verkauf');
  });

  it('zeigt bei Vorperiode 0 einen Gedankenstrich', () => {
    render(<StartOverview signals={{ revenueGrowthPct: null }} />);
    expect(screen.getByText('–')).toBeTruthy();
  });

  it('zeigt operativen Cashflow (Einzahlungen) statt Offene Posten und verlinkt in Finanzen', () => {
    render(<StartOverview signals={{ cashflowIn: 4200 }} />);
    expect(screen.getByText('Operativer Cashflow')).toBeTruthy();
    expect(screen.getByText(/4\.200,00/)).toBeTruthy();
    expect(screen.queryByText('Offene Posten')).toBeNull();
    expect(screen.getByRole('link', { name: /Operativer Cashflow/ }).getAttribute('href')).toBe('/finanzen');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/start-overview.test.tsx`
Expected: FAIL — Text „Umsatzwachstum" / „Operativer Cashflow" nicht gefunden (Komponente rendert noch die alten Kacheln).

- [ ] **Step 3: Rewrite `StartOverview.tsx`**

Ersetze den Inhalt von `src/components/StartOverview.tsx`:

```tsx
import Link from 'next/link';
import { eur } from '@/finanzen/format';
import { formatGrowth } from '@/verkauf/growth';

export interface OverviewSignals {
  revenueGrowthPct?: number | null; // undefined ⇒ kein Verkauf-Zugriff; null ⇒ Vorperiode 0
  reichweite90?: number;
  cashflowIn?: number;
}

export function StartOverview({ signals }: { signals: OverviewSignals }) {
  const tiles: { label: string; value: string; href: string; danger?: boolean; sub?: string }[] = [];
  if (signals.revenueGrowthPct !== undefined)
    tiles.push({
      label: 'Umsatzwachstum', value: formatGrowth(signals.revenueGrowthPct), href: '/verkauf',
      sub: 'MTD VS. VORMONAT',
      danger: signals.revenueGrowthPct !== null && signals.revenueGrowthPct < 0,
    });
  if (signals.reichweite90 !== undefined)
    tiles.push({ label: 'Reichweite < 90 Tage', value: String(signals.reichweite90),
      href: '/verfuegbarkeit/meldebestand', danger: signals.reichweite90 > 0 });
  if (signals.cashflowIn !== undefined)
    tiles.push({ label: 'Operativer Cashflow', value: eur(signals.cashflowIn), href: '/finanzen',
      sub: 'EINZAHLUNGEN · LFD. MONAT' });
  if (tiles.length === 0) return null;

  return (
    <section className="mt-6">
      <p className="anno mb-3">Überblick</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {tiles.map((t) => (
          <Link key={t.href} href={t.href}
            className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-card transition hover:border-accent dark:border-neutral-800 dark:bg-neutral-900">
            <p className="anno text-neutral-500">{t.label}</p>
            <p className={`mt-1 text-2xl font-semibold ${t.danger ? 'text-danger' : 'text-neutral-900 dark:text-neutral-100'}`}>{t.value}</p>
            {t.sub && <p className="anno mt-1 text-neutral-500">{t.sub}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}
```

Hinweis: Die Sub-Zeile ist jetzt ein `anno`-Mikrolabel (UPPERCASE-sanktioniert) statt des alten roten Überfällig-Texts; deshalb `anno text-neutral-500` statt `text-xs text-danger`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/start-overview.test.tsx`
Expected: PASS (3 Tests grün).

- [ ] **Step 5: Verdrahtung in `page.tsx`**

Ersetze `src/app/(shell)/page.tsx`:

```tsx
import { createClient } from '@/lib/supabase/server';
import { getUserAccess, accessibleApps } from '@/lib/groups';
import { Launchpad } from '@/components/Launchpad';
import { StartOverview, type OverviewSignals } from '@/components/StartOverview';
import { salesTotals } from '@/verkauf/repository';
import { revenueGrowth, monthToDateRanges } from '@/verkauf/growth';
import { listReorderSuggestions } from '@/verfuegbarkeit/repository';
import { cashflowIn } from '@/finanzen/repository';

export const dynamic = 'force-dynamic';

export default async function LaunchpadPage() {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };

  const signals: OverviewSignals = {};
  const tasks: Promise<void>[] = [];
  const today = new Date().toISOString().slice(0, 10);
  const { current, previous } = monthToDateRanges(today);
  if (access.apps.verkauf) {
    tasks.push(Promise.all([salesTotals(current), salesTotals(previous)]).then(([cur, prev]) => {
      signals.revenueGrowthPct = revenueGrowth(cur.revenueNet, prev.revenueNet);
    }));
  }
  if (access.apps.verfuegbarkeit) tasks.push(listReorderSuggestions().then((r) => { signals.reichweite90 = r.length; }));
  if (access.apps.finanzen) tasks.push(cashflowIn(current).then((v) => { signals.cashflowIn = v; }));
  await Promise.all(tasks);

  const hasOverview = signals.revenueGrowthPct !== undefined
    || signals.reichweite90 !== undefined || signals.cashflowIn !== undefined;

  return (
    <main className="flex-1 overflow-y-auto pb-[calc(5rem+env(safe-area-inset-bottom))] md:pb-0">
      <Launchpad
        apps={accessibleApps(access)}
        greeting="Willkommen zurück."
        overview={hasOverview ? <StartOverview signals={signals} /> : undefined}
      />
    </main>
  );
}
```

- [ ] **Step 6: Typecheck & Commit**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

```bash
git add src/components/StartOverview.tsx src/app/\(shell\)/page.tsx tests/components/start-overview.test.tsx
git commit -m "feat(start): Kacheln Umsatzwachstum + operativer Cashflow statt Umsatz/Offene Posten"
```

---

### Task 4: Cashflow-Verlaufschart auf `/finanzen`

**Files:**
- Modify: `src/app/(shell)/finanzen/page.tsx`

**Interfaces:**
- Consumes: `cashflowInByDay` aus `@/finanzen/repository`; `bucketSum` aus `@/lib/series`; `ChartCard` aus `@/components/charts/ChartCard`; `KpiLineChart` aus `@/components/charts/KpiLineChart` (Props `{ title, series: {date,value}[], format }`); `listOpenItems`, `resolveRange`, `OffenePostenListe` wie bisher.
- Produces: keine (Seiten-Render).

- [ ] **Step 1: Chart-Sektion ergänzen**

Ersetze `src/app/(shell)/finanzen/page.tsx`:

```tsx
import { listOpenItems, cashflowInByDay } from '@/finanzen/repository';
import { resolveRange } from '@/lib/range';
import { bucketSum } from '@/lib/series';
import { OffenePostenListe } from '@/components/OffenePostenListe';
import { ChartCard } from '@/components/charts/ChartCard';
import { KpiLineChart } from '@/components/charts/KpiLineChart';

export const dynamic = 'force-dynamic';

export default async function OffenePostenPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  // Offene Posten sind Salden, keine Reporting-Periode: ohne Wahl alle zeigen,
  // damit die Kopf-Kennzahlen den vollen offenen Betrag ausweisen.
  const { range } = resolveRange(searchParams.days ?? 'all', end, { start: searchParams.start, end: searchParams.end });

  // Cashflow-Chart: fixe letzte 12 Monate, monatlich gebucketet — unabhängig
  // vom Salden-Zeitraum der Offene-Posten-Liste.
  const d = new Date(end);
  const cashflowStart = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1)).toISOString().slice(0, 10);
  const [items, cashRaw] = await Promise.all([
    listOpenItems({ dueFrom: range.start, dueTo: range.end }),
    cashflowInByDay({ start: cashflowStart, end }),
  ]);
  const cashflowSeries = bucketSum(cashRaw.map((c) => ({ date: c.day, value: c.amount })), 'month');

  const sum = (dir: 'debitor' | 'kreditor') =>
    items.filter((i) => i.direction === dir && i.status !== 'bezahlt').reduce((s, i) => s + i.remaining, 0);
  const overdue = items.filter((i) => i.overdue).reduce((s, i) => s + i.remaining, 0);
  return (
    <div className="space-y-6">
      <ChartCard title="Operativer Cashflow · Einzahlungen">
        <KpiLineChart title="Einzahlungen (letzte 12 Monate)" series={cashflowSeries} format="eur" />
      </ChartCard>
      <OffenePostenListe items={items} debitorOpen={sum('debitor')} kreditorOpen={sum('kreditor')}
        overdue={overdue} range={range} />
    </div>
  );
}
```

Hinweis: `KpiLineChart` rendert selbst in einer `ChartCard`; die äußere `ChartCard` dient als benannte Sektions-Klammer (Titel oben). Falls das im Deploy doppelt gerahmt wirkt, in Step 3 die äußere `ChartCard` durch ein schlichtes `<section>` mit `anno`-Überschrift ersetzen — Entscheidung erst nach visueller Prüfung.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: Visuelle Prüfung (VPS-Deploy)**

Deploy auf den VPS (`https://budp.lumeapps.de`) gemäß Projekt-Deploy-Flow und `/finanzen` im Browser (Claude in Chrome oder Chrome DevTools) öffnen. Prüfen:
- Chart-Sektion über der Offene-Posten-Liste sichtbar, Achsen als `€` formatiert, Monats-Ticks.
- Kein doppelter Rahmen (sonst äußere `ChartCard` → `<section>` mit `<p className="anno mb-3">` ersetzen).
- Dark-Mode korrekt (warme `neutral`-Töne, kein kaltes Grau).
- Von der Startseite: Klick auf „Operativer Cashflow" landet auf `/finanzen` mit sichtbarem Chart.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(shell\)/finanzen/page.tsx
git commit -m "feat(finanzen): Cashflow-Verlaufschart (Einzahlungen, 12 Monate) über der OP-Liste"
```

---

### Task 5: `/verkauf` — Kachel „Offene Angebote" entfernen

**Files:**
- Modify: `src/app/(shell)/verkauf/page.tsx`

**Interfaces:**
- Consumes/Produces: keine Änderung an Signaturen; nur eine Kachel weniger. `salesTotals`/`totals.openOffers` bleiben unangetastet (an anderer Stelle genutzt).

- [ ] **Step 1: Item entfernen**

In `src/app/(shell)/verkauf/page.tsx` die Zeile aus dem `items`-Array streichen:

```ts
    { key: 'angebote', label: 'Offene Angebote', value: String(totals.openOffers) },
```

Das `items`-Array endet danach mit dem `storno`-Item. `totals.openOffers` bleibt berechnet (kein weiterer Umbau).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (kein ungenutzter Import — `totals` wird weiter für andere Kacheln gelesen).

- [ ] **Step 3: Verkauf-Testsuite (Regression)**

Run: `npx vitest run tests/verkauf`
Expected: PASS (kein Test hing an der „Offene Angebote"-Kachel; falls doch ein Rendering-Test darauf prüft, dort die Assertion entfernen).

- [ ] **Step 4: Commit**

```bash
git add src/app/\(shell\)/verkauf/page.tsx
git commit -m "feat(verkauf): Kachel „Offene Angebote\" aus der Übersicht entfernen"
```

---

### Task 6: Hilfe-Doku pflegen

**Files:**
- Modify: `src/lib/help/content.ts`

**Interfaces:**
- Consumes/Produces: keine; nur Doku-Inhalte. Registry-Test `tests/lib/help-content.test.ts` muss grün bleiben.

- [ ] **Step 1: Finanzen-Hilfeseite ergänzen**

In `src/lib/help/content.ts`, Modul-Seite `slug: 'finanzen'` (~Zeile 218):

- In der `summary` „Offene Posten, …" → „Cashflow-Verlauf (Einzahlungen), offene Posten, Zahlungsabgleich, Zuordnen-Warteschlange und Buchungsexport."
- In der Liste „Wichtige Funktionen" als ersten Punkt aufnehmen:

```ts
            'Operativer Cashflow (Einzahlungen): Verlaufschart der Zahlungseingänge auf Debitor-Posten über die letzten 12 Monate (monatlich). Nicht zugeordnete Zahlungen zählen erst nach Zuordnung mit.',
```

- [ ] **Step 2: Startseiten-KPIs in der Doku nachziehen (falls beschrieben)**

Prüfen, ob eine Hilfeseite die Startseiten-Kacheln nennt:

Run: `grep -n "Umsatz akt\. Monat\|Offene Posten\|Offene Angebote" src/lib/help/content.ts`

- Für jede Fundstelle, die die **Startseiten-Übersicht** beschreibt: „Umsatz akt. Monat" → „Umsatzwachstum (Monat vs. Vormonat, periodengleich)" und „Offene Posten" (als Startseiten-Kachel) → „Operativer Cashflow (Einzahlungen laufender Monat)".
- Fundstellen, die die **Finanzen-Tabelle** „Offene Posten" meinen, **nicht** ändern (die Ansicht bleibt).
- Falls die `/verkauf`-Hilfeseite „Offene Angebote" als KPI-Kachel nennt: Erwähnung entfernen (die Kachel ist weg; der Status „angebot" bleibt im Funnel).

- [ ] **Step 3: Hilfe-Registry-Test**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (Slugs/Registry unverändert gültig).

- [ ] **Step 4: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(hilfe): Cashflow-Chart + neue Startseiten-KPIs dokumentieren"
```

---

### Task 7: Gesamtabnahme

- [ ] **Step 1: Volle Testsuite**

Run: `npx vitest run`
Expected: PASS — ausgenommen die bekannt-erwarteten RLS-Fehler in `tests/db/rls.test.ts` auf diesem Host (kein Regress). Bei DB-Tests die frische Schwester-Test-DB nutzen (Seed-Kollision der Dev-DB).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 3: End-to-End-Sichtprüfung (VPS)**

Auf `https://budp.lumeapps.de` deployen und prüfen:
- Startseite: Kacheln „Umsatzwachstum" (mit Vorzeichen/Farbe) und „Operativer Cashflow" statt der alten; Reichweite unverändert.
- Klick „Umsatzwachstum" → `/verkauf`; Klick „Operativer Cashflow" → `/finanzen` mit Chart.
- `/verkauf`: keine „Offene Angebote"-Kachel mehr; übrige Kacheln unverändert.
- `/finanzen`: Cashflow-Chart über der OP-Liste, Dark-Mode sauber.

---

## Self-Review

**Spec coverage:**
- Umsatzwachstum periodengleiches MoM → Task 1 (Rechnung/Datum) + Task 3 (Verdrahtung/Kachel). ✓
- Operativer Cashflow (Einzahlungen) Kachel + Klick → /finanzen → Task 2 (`cashflowIn`) + Task 3 (Kachel/href) + Task 4 (Chart). ✓
- Cashflow-Chart als Sektion auf /finanzen, 12 Monate monatlich, nur Debitor-zugeordnet → Task 2 + Task 4. ✓
- „Offene Angebote" auf /verkauf entfernen → Task 5. ✓
- Tests (pure + DB) → Task 1, Task 2; Regression Task 5, Task 7. ✓
- Hilfe-Doku → Task 6. ✓
- Nicht-Scope (Netto-Cashflow, konfigurierbarer Zeitraum, Drill-down, unzugeordnete Eingänge) → nirgends implementiert. ✓

**Placeholder scan:** Keine TBD/TODO; alle Code-Schritte mit vollständigem Code; einzige bedingte Stelle (äußere `ChartCard` vs. `<section>` in Task 4) ist eine bewusste, nach visueller Prüfung zu treffende Design-Entscheidung mit klarer Anweisung — kein Platzhalter.

**Type consistency:** `revenueGrowth`, `formatGrowth`, `monthToDateRanges`, `cashflowIn`, `cashflowInByDay`, `OverviewSignals`-Felder (`revenueGrowthPct`/`reichweite90`/`cashflowIn`) durchgängig identisch benannt und verwendet. `DateRange` einheitlich aus `@/verkauf/types`. `KpiLineChart`-Props (`title`, `series:{date,value}[]`, `format`) korrekt bedient (Mapping `day→date`, `amount→value`).
