# Recharts Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all `@tremor/react` charts with Recharts in lumeapps' visual style and remove the `@tremor/react` dependency.

**Architecture:** A shared `src/components/charts/` (`chart-style.ts` constants+formatters, `ChartCard` container) codifies the lumeapps look once; the 5 chart components migrate 1:1 in content to Recharts; the server phase-page chart moves into a new `'use client'` wrapper. Tremor `Card` is replaced by `ChartCard`, then `@tremor/react` is dropped.

**Tech Stack:** Next.js 14, React 18, Recharts 2.x, Tailwind, next-themes, Vitest + Testing Library (jsdom).

## Global Constraints

- lumeapps style: no `CartesianGrid`; primary series `var(--brand)`, secondary slate `#94a3b8`, semantic amber/red only for thresholds/alerts; area fills as brand→transparent gradient; axis label `#737373`; `tick={{fontSize:11}}`; light Tooltip with `labelStyle={{color:'#171717',fontWeight:600}}`; bars `radius`+`isAnimationActive={false}`; lines `type="monotone"`, `dot={false}`, `strokeWidth 2–2.5`; `<Legend/>` for multi-series; Intl `de-DE` formatting.
- Every chart wraps in `ResponsiveContainer` inside a fixed-height `div` and imports style from `@/components/charts/chart-style`.
- Recharts is client-only: any host that is a server component needs a `'use client'` wrapper.
- Integration tests use `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres` (disposable `woo-test-pg`); `npm run migrate` first.
- After the last migration, `grep -rn "@tremor/react" src` must return nothing before removing the dep.

---

### Task 1: Shared chart infrastructure

**Files:**
- Create: `src/components/charts/chart-style.ts`
- Create: `src/components/charts/ChartCard.tsx`
- Test: `tests/components/chart-style.test.ts`
- Modify: `package.json` (add `recharts`)

**Interfaces:**
- Produces: from `chart-style.ts` — `BRAND`, `MUTED`, `AXIS_LABEL`, `TICK`, `TOOLTIP_LABEL_STYLE`, `CATEGORICAL: string[]`, `num(n)`, `eur(n)`, `pct(n)`, `axisLabel(value)`. From `ChartCard.tsx` — `ChartCard({title?, className?, children})`.

- [ ] **Step 1: Add recharts** — `npm install recharts@^2.15` (run in the repo root).

- [ ] **Step 2: Write the failing formatter test** — `tests/components/chart-style.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { num, eur, pct, BRAND, CATEGORICAL } from '@/components/charts/chart-style';

describe('chart-style formatters', () => {
  it('formats numbers, euros, percents in de-DE', () => {
    expect(num(1234)).toBe('1.234');
    expect(eur(1234)).toBe('1.234 €');
    expect(pct(12.5)).toBe('12,5 %');
  });
  it('exposes the brand color and a categorical palette', () => {
    expect(BRAND).toBe('var(--brand)');
    expect(CATEGORICAL[0]).toBe('var(--brand)');
    expect(CATEGORICAL.length).toBeGreaterThanOrEqual(5);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/components/chart-style.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/components/charts/chart-style.ts`:**

```ts
// The lumeapps chart look, codified once so every chart stays consistent.
export const BRAND = 'var(--brand)';
export const MUTED = '#94a3b8';       // slate-400 — secondary series
export const AXIS_LABEL = '#737373';  // neutral-500 — reads on light + dark
export const TICK = { fontSize: 11 } as const;
export const TOOLTIP_LABEL_STYLE = { color: '#171717', fontWeight: 600 } as const;
// Distinct slices for the status donut (brand, slate, amber, emerald, red).
export const CATEGORICAL = ['var(--brand)', '#94a3b8', '#f59e0b', '#10b981', '#ef4444'];

const de = new Intl.NumberFormat('de-DE');
const de1 = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });
export const num = (n: number) => de.format(n);
export const eur = (n: number) => `${de.format(n)} €`;
export const pct = (n: number) => `${de1.format(n)} %`;

// Rotated Y-axis caption in the shared muted style.
export function axisLabel(value: string) {
  return { value, angle: -90 as const, position: 'insideLeft' as const,
    style: { fontSize: 11, fill: AXIS_LABEL, textAnchor: 'middle' as const } };
}
```

- [ ] **Step 5: Implement `src/components/charts/ChartCard.tsx`:**

```tsx
import type { ReactNode } from 'react';

// Card container replacing Tremor's <Card> (same look: rounded, white/neutral-900,
// ring, subtle shadow). Optional title rendered as the standard chart heading.
export function ChartCard({ title, className = '', children }: { title?: string; className?: string; children: ReactNode }) {
  return (
    <div className={`overflow-visible rounded-lg bg-white p-6 shadow-sm ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800 ${className}`}>
      {title && <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">{title}</p>}
      {children}
    </div>
  );
}
```

- [ ] **Step 6: Run tests + typecheck**

Run: `npx vitest run tests/components/chart-style.test.ts && npx tsc --noEmit && echo tsc-clean`
Expected: PASS, `tsc-clean`.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/components/charts/ tests/components/chart-style.test.ts
git commit -m "feat: shared Recharts chart-style + ChartCard; add recharts"
```

---

### Task 2: Phase trend Area chart (new client wrapper)

**Files:**
- Create: `src/components/PhaseTrendChart.tsx`
- Modify: `src/app/phase/[phase]/page.tsx` (replace Tremor `AreaChart`+`Card`, drop the tremor import)
- Test: `tests/components/phase-trend-chart.test.tsx`

**Interfaces:**
- Produces: `PhaseTrendChart({ series: {date:string;value:number}[]; metric: string })`.

- [ ] **Step 1: Write the failing test** — `tests/components/phase-trend-chart.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('recharts', async (orig) => {
  const m = await orig<typeof import('recharts')>();
  return { ...m, ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    <div style={{ width: 800, height: 400 }}>{children}</div> };
});

import { PhaseTrendChart } from '@/components/PhaseTrendChart';

afterEach(cleanup);

describe('PhaseTrendChart', () => {
  it('rendert Titel + Area ohne Fehler', () => {
    const series = [{ date: '2026-05-01', value: 10 }, { date: '2026-05-02', value: 12 }];
    const { container } = render(<PhaseTrendChart series={series} metric="Sitzungen" />);
    expect(screen.getByText(/Verlauf: Sitzungen \(30 Tage\)/)).toBeTruthy();
    expect(container.querySelector('.recharts-area')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/phase-trend-chart.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/components/PhaseTrendChart.tsx`:**

```tsx
'use client';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, TICK, num } from '@/components/charts/chart-style';

const dm = (d: string) => d.slice(8) + '.' + d.slice(5, 7); // dd.mm

export function PhaseTrendChart({ series, metric }: { series: { date: string; value: number }[]; metric: string }) {
  return (
    <ChartCard title={`Verlauf: ${metric} (30 Tage)`} className="mt-6">
      <div className="mt-2 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="phaseArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={BRAND} stopOpacity={0.35} />
                <stop offset="100%" stopColor={BRAND} stopOpacity={0.03} />
              </linearGradient>
            </defs>
            <XAxis dataKey="date" tick={TICK} minTickGap={24} tickFormatter={dm} />
            <YAxis tick={TICK} width={48} tickFormatter={(n) => num(Number(n))} />
            <Tooltip formatter={(v) => [num(Number(v)), metric]} labelFormatter={(l) => String(l)} />
            <Area type="monotone" dataKey="value" stroke={BRAND} strokeWidth={2} fill="url(#phaseArea)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
```

- [ ] **Step 4: Update the page** — in `src/app/phase/[phase]/page.tsx`: remove `import { AreaChart, Card } from '@tremor/react';`, add `import { PhaseTrendChart } from '@/components/PhaseTrendChart';`, and replace the whole `<Card …><AreaChart …/></Card>` block with:

```tsx
        <PhaseTrendChart series={series} metric={meta.leadMetric} />
```

- [ ] **Step 5: Run test + typecheck**

Run: `npx vitest run tests/components/phase-trend-chart.test.tsx && npx tsc --noEmit && echo tsc-clean`
Expected: PASS, `tsc-clean`.

- [ ] **Step 6: Commit**

```bash
git add src/components/PhaseTrendChart.tsx 'src/app/phase/[phase]/page.tsx' tests/components/phase-trend-chart.test.tsx
git commit -m "feat: migrate phase trend chart to Recharts"
```

---

### Task 3: BpmStockChart (grouped Bar)

**Files:**
- Modify: `src/components/BpmStockChart.tsx`
- Test: `tests/components/bpm-stock-chart.test.tsx`

- [ ] **Step 1: Write the failing test** — `tests/components/bpm-stock-chart.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
vi.mock('recharts', async (orig) => {
  const m = await orig<typeof import('recharts')>();
  return { ...m, ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    <div style={{ width: 800, height: 400 }}>{children}</div> };
});
import { BpmStockChart } from '@/components/BpmStockChart';
afterEach(cleanup);

it('rendert Bestand vs. Mindestbestand als Balken', () => {
  const data = [{ name: 'A', Bestand: 10, Mindestbestand: 5 }, { name: 'B', Bestand: 3, Mindestbestand: 6 }];
  const { container } = render(<BpmStockChart data={data} />);
  expect(screen.getByText(/Bestand vs\. Mindestbestand/)).toBeTruthy();
  expect(container.querySelectorAll('.recharts-bar').length).toBe(2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/components/bpm-stock-chart.test.tsx`
Expected: FAIL (still Tremor; no `.recharts-bar`).

- [ ] **Step 3: Implement** — replace `src/components/BpmStockChart.tsx`:

```tsx
'use client';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, MUTED, TICK, TOOLTIP_LABEL_STYLE, num } from '@/components/charts/chart-style';

export function BpmStockChart({ data }: { data: { name: string; Bestand: number; Mindestbestand: number }[] }) {
  return (
    <ChartCard title="Bestand vs. Mindestbestand">
      <div className="mt-3 h-72">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" tick={TICK} interval={0} />
            <YAxis tick={TICK} width={48} tickFormatter={(n) => num(Number(n))} />
            <Tooltip formatter={(v, n) => [num(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Legend />
            <Bar dataKey="Bestand" fill={BRAND} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="Mindestbestand" fill={MUTED} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}
```

- [ ] **Step 4: Run test + typecheck** — `npx vitest run tests/components/bpm-stock-chart.test.tsx && npx tsc --noEmit && echo tsc-clean` → PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/BpmStockChart.tsx tests/components/bpm-stock-chart.test.tsx
git commit -m "feat: migrate BpmStockChart to Recharts"
```

---

### Task 4: BpmPriceHistory (two Line charts)

**Files:**
- Modify: `src/components/BpmPriceHistory.tsx` (charts only; keep the product `<select>` and `rows` logic)
- Test: `tests/components/bpm-price-history.test.tsx`

- [ ] **Step 1: Write the failing test** — `tests/components/bpm-price-history.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
vi.mock('recharts', async (orig) => {
  const m = await orig<typeof import('recharts')>();
  return { ...m, ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    <div style={{ width: 800, height: 400 }}>{children}</div> };
});
import { BpmPriceHistory } from '@/components/BpmPriceHistory';
afterEach(cleanup);

it('rendert Preis/Kosten- und Marge-Charts', () => {
  const products = [{ id: 'p1', name: 'Prod 1' } as any];
  const history = [{ productId: 'p1', date: '2026-05-01', price: 100, cost: 60 },
                   { productId: 'p1', date: '2026-05-02', price: 110, cost: 60 }];
  const { container } = render(<BpmPriceHistory products={products} history={history as any} />);
  expect(screen.getByText(/Preis & Kosten/)).toBeTruthy();
  expect(screen.getByText(/Marge-Verlauf/)).toBeTruthy();
  expect(container.querySelectorAll('.recharts-line').length).toBe(3); // Preis + Kosten + Marge
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/components/bpm-price-history.test.tsx` → FAIL.

- [ ] **Step 3: Implement** — replace only the imports and the `<div className="grid gap-4 lg:grid-cols-2"> … </div>` block in `src/components/BpmPriceHistory.tsx`. New imports:

```tsx
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, MUTED, TICK, TOOLTIP_LABEL_STYLE, eur, pct } from '@/components/charts/chart-style';
```

(Remove `import { LineChart, Card } from '@tremor/react';`.) Replace the grid block with:

```tsx
      <div className="grid gap-4 lg:grid-cols-2">
        <ChartCard title="Preis & Kosten (€)" className="bg-white dark:bg-neutral-900">
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={TICK} minTickGap={24} />
                <YAxis tick={TICK} width={64} tickFormatter={(n) => eur(Number(n))} />
                <Tooltip formatter={(v, n) => [eur(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Legend />
                <Line type="monotone" dataKey="Preis (€)" stroke={BRAND} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Kosten (€)" stroke={MUTED} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
        <ChartCard title="Marge-Verlauf (%)" className="bg-white dark:bg-neutral-900">
          <div className="mt-3 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={TICK} minTickGap={24} />
                <YAxis tick={TICK} width={48} tickFormatter={(n) => pct(Number(n))} />
                <Tooltip formatter={(v) => [pct(Number(v)), 'Marge']} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Line type="monotone" dataKey="Marge (%)" stroke={BRAND} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
      </div>
```

- [ ] **Step 4: Run test + typecheck** — `npx vitest run tests/components/bpm-price-history.test.tsx && npx tsc --noEmit && echo tsc-clean` → PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/BpmPriceHistory.tsx tests/components/bpm-price-history.test.tsx
git commit -m "feat: migrate BpmPriceHistory to Recharts"
```

---

### Task 5: BpmMonitoring (Line, own vs competitor)

**Files:**
- Modify: `src/components/BpmMonitoring.tsx` (chart only; keep the alert list + select + `rows`)
- Test: `tests/components/bpm-monitoring.test.tsx`

- [ ] **Step 1: Write the failing test** — `tests/components/bpm-monitoring.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
vi.mock('recharts', async (orig) => {
  const m = await orig<typeof import('recharts')>();
  return { ...m, ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    <div style={{ width: 800, height: 400 }}>{children}</div> };
});
import { BpmMonitoring } from '@/components/BpmMonitoring';
afterEach(cleanup);

it('rendert Preisverlauf eigener vs. Wettbewerb', () => {
  const points = [
    { productId: 'p1', competitor: 'X', date: '2026-05-01', ownPrice: 10, compPrice: 12 },
    { productId: 'p1', competitor: 'X', date: '2026-05-02', ownPrice: 11, compPrice: 12 },
  ];
  const { container } = render(<BpmMonitoring points={points as any} alerts={[]} />);
  expect(screen.getByText(/Preisverlauf: eigener vs\. Wettbewerb/)).toBeTruthy();
  expect(container.querySelectorAll('.recharts-line').length).toBe(2);
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/components/bpm-monitoring.test.tsx` → FAIL.

- [ ] **Step 3: Implement** — in `src/components/BpmMonitoring.tsx` remove `import { LineChart, Card } from '@tremor/react';`, add:

```tsx
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend } from 'recharts';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, MUTED, TICK, TOOLTIP_LABEL_STYLE, eur as eurStyle } from '@/components/charts/chart-style';
```

(Note: the file already imports `eur` from `@/brickpm/format` for the alert list — alias the chart one as `eurStyle` to avoid the clash.) Replace the `<Card …><p…/>… <LineChart …/></Card>` block with:

```tsx
        <ChartCard title="Preisverlauf: eigener vs. Wettbewerb" className="bg-white dark:bg-neutral-900">
          <div className="mt-3 h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={TICK} minTickGap={24} />
                <YAxis tick={TICK} width={64} tickFormatter={(n) => eurStyle(Number(n))} />
                <Tooltip formatter={(v, n) => [eurStyle(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
                <Legend />
                <Line type="monotone" dataKey="Eigener Preis" stroke={BRAND} strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Wettbewerb" stroke={MUTED} strokeWidth={2} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>
```

- [ ] **Step 4: Run test + typecheck** — `npx vitest run tests/components/bpm-monitoring.test.tsx && npx tsc --noEmit && echo tsc-clean` → PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/BpmMonitoring.tsx tests/components/bpm-monitoring.test.tsx
git commit -m "feat: migrate BpmMonitoring to Recharts"
```

---

### Task 6: BpmAnalyticsCharts (3 Bar + 1 Donut)

**Files:**
- Modify: `src/components/BpmAnalyticsCharts.tsx`
- Test: `tests/components/bpm-analytics-charts.test.tsx`

- [ ] **Step 1: Write the failing test** — `tests/components/bpm-analytics-charts.test.tsx`:

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
vi.mock('recharts', async (orig) => {
  const m = await orig<typeof import('recharts')>();
  return { ...m, ResponsiveContainer: ({ children }: { children: React.ReactNode }) =>
    <div style={{ width: 800, height: 400 }}>{children}</div> };
});
import { BpmAnalyticsCharts } from '@/components/BpmAnalyticsCharts';
afterEach(cleanup);

it('rendert 3 Balken-Charts + 1 Donut', () => {
  const nv = [{ name: 'A', value: 10 }, { name: 'B', value: 20 }];
  const { container } = render(<BpmAnalyticsCharts revenue={nv} marge={nv} sell={nv} status={nv} />);
  expect(screen.getByText(/Produkt-Status/)).toBeTruthy();
  expect(container.querySelectorAll('.recharts-bar').length).toBe(3);
  expect(container.querySelector('.recharts-pie')).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run tests/components/bpm-analytics-charts.test.tsx` → FAIL.

- [ ] **Step 3: Implement** — replace `src/components/BpmAnalyticsCharts.tsx`:

```tsx
'use client';
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, Tooltip } from 'recharts';
import type { NamedValue } from '@/brickpm/analytics';
import { ChartCard } from '@/components/charts/ChartCard';
import { BRAND, CATEGORICAL, TICK, TOOLTIP_LABEL_STYLE, eur, pct, num } from '@/components/charts/chart-style';

function BarCard({ title, data, yWidth, fmt }: { title: string; data: NamedValue[]; yWidth: number; fmt: (n: number) => string }) {
  return (
    <ChartCard title={title}>
      <div className="mt-3 h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <XAxis dataKey="name" tick={TICK} interval={0} />
            <YAxis tick={TICK} width={yWidth} tickFormatter={(n) => fmt(Number(n))} />
            <Tooltip formatter={(v) => [fmt(Number(v)), title]} labelStyle={TOOLTIP_LABEL_STYLE} />
            <Bar dataKey="value" fill={BRAND} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function BpmAnalyticsCharts({
  revenue, marge, sell, status,
}: { revenue: NamedValue[]; marge: NamedValue[]; sell: NamedValue[]; status: NamedValue[] }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <BarCard title="Aktions-Zielumsatz nach Kategorie" data={revenue} yWidth={72} fmt={eur} />
      <BarCard title="Ø Marge nach Serie" data={marge} yWidth={56} fmt={pct} />
      <BarCard title="Sell-through je Aktion" data={sell} yWidth={56} fmt={pct} />
      <ChartCard title="Produkt-Status">
        <div className="mt-3 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={status} dataKey="value" nameKey="name" innerRadius="55%" outerRadius="80%" isAnimationActive={false}>
                {status.map((_, i) => <Cell key={i} fill={CATEGORICAL[i % CATEGORICAL.length]} />)}
              </Pie>
              <Tooltip formatter={(v, n) => [num(Number(v)), n as string]} labelStyle={TOOLTIP_LABEL_STYLE} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </ChartCard>
    </div>
  );
}
```

- [ ] **Step 4: Run test + typecheck** — `npx vitest run tests/components/bpm-analytics-charts.test.tsx && npx tsc --noEmit && echo tsc-clean` → PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add src/components/BpmAnalyticsCharts.tsx tests/components/bpm-analytics-charts.test.tsx
git commit -m "feat: migrate BpmAnalyticsCharts (bars + donut) to Recharts"
```

---

### Task 7: KpiCard → ChartCard, remove @tremor/react

**Files:**
- Modify: `src/components/KpiCard.tsx`
- Modify: `package.json` (remove `@tremor/react`)

- [ ] **Step 1: Swap the container** — in `src/components/KpiCard.tsx`, replace `import { Card } from '@tremor/react';` with `import { ChartCard } from '@/components/charts/ChartCard';`, change the opening `<Card className="overflow-visible bg-white ring-1 ring-neutral-200 dark:bg-neutral-900 dark:ring-neutral-800">` to `<ChartCard>` and the closing `</Card>` to `</ChartCard>`. (ChartCard already provides those classes.)

- [ ] **Step 2: Verify no Tremor imports remain**

Run: `grep -rn "@tremor/react" src && echo FOUND || echo NONE`
Expected: `NONE`.

- [ ] **Step 3: Remove the dependency** — `npm uninstall @tremor/react`.

- [ ] **Step 4: Full suite + typecheck + build**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres bash -c 'npm run migrate && npx vitest run && npx tsc --noEmit && npm run build'`
Expected: all tests PASS, `tsc` clean, `next build` succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/KpiCard.tsx package.json package-lock.json
git commit -m "refactor: KpiCard uses ChartCard; drop @tremor/react"
```

---

### Task 8: Deploy + live visual verification

- [ ] **Step 1: Merge the PR to `main`** (needs user authorization) and run `deploy/deploy.sh` on the VPS.
- [ ] **Step 2:** In the browser against `https://budp.lumeapps.de`, verify each chart renders in **light and dark**: `/phase/see` (area trend), `/brickpm/lager` (stock bars), `/brickpm/preis-historie` (2 line charts), `/brickpm/monitoring` (line), `/brickpm/analytics` (3 bars + donut). Confirm brand-colored series, readable axes/tooltips in dark mode, and no layout breakage.
- [ ] **Step 3:** If `#737373` axis labels read too dim on dark cards, lighten `AXIS_LABEL` in `chart-style.ts` to a value that works on both (e.g. `#8a8a8a`), re-run tests, and redeploy.

---

## Notes

- Recharts `fill="var(--brand)"` / `stroke="var(--brand)"` resolves in modern browsers (lumeapps ships this). Series colors are theme-neutral; only the brand var changes with the app's brand setting.
- The `.recharts-area` / `.recharts-bar` / `.recharts-line` / `.recharts-pie` class assertions work because the tests mock `ResponsiveContainer` to a fixed size so Recharts actually draws.
