# Migrate charts to Recharts (lumeapps style)

**Date:** 2026-07-03
**Status:** Approved (design)

## Problem

ecom-platform renders all charts with `@tremor/react`; lumeapps-platform uses
Recharts. Migrate every chart to Recharts in lumeapps' visual style, keeping each
chart's content and composition (same data, series, chart type). `Card` is the
only non-chart Tremor usage, so the migration lets us remove `@tremor/react`
entirely.

## Scope

Six files import `@tremor/react`:

| File | Tremor charts | → Recharts |
|---|---|---|
| `src/app/phase/[phase]/page.tsx` | `AreaChart` (30-day trend) | Area (brand gradient) |
| `src/components/BpmStockChart.tsx` | `BarChart` (Bestand vs Mindestbestand) | grouped Bar |
| `src/components/BpmPriceHistory.tsx` | `LineChart` ×2 (€, %) | Line ×2 |
| `src/components/BpmMonitoring.tsx` | `LineChart` (own vs competitor) | Line |
| `src/components/BpmAnalyticsCharts.tsx` | `BarChart` ×3 + `DonutChart` | Bar ×3 + Pie(donut) |
| `src/components/KpiCard.tsx` | `Card` only (no chart) | `ChartCard` container |

Out of scope (not charts / not good Recharts fits, keep as-is): the KPI stat
tiles' content, the `brickpm/aktionen` CSS progress bar, badges/chips, SVG icons.
No chart-type (area/bar) toggle (a lumeapps commerce feature, not "style"). No
cross-source or data changes.

## lumeapps chart style (the target look)

- Fixed-height wrapper `div` (e.g. `h-72`) + `ResponsiveContainer width/height 100%`.
- **No `CartesianGrid`.**
- Series colors: primary = `var(--brand)`; secondary = slate `#94a3b8`; a semantic
  accent (amber `#f59e0b` / red `#ef4444`) only where it means a threshold/warning
  (Mindestbestand, competitor-price alert). Area fills = brand→transparent
  `linearGradient`.
- Axes: `tick={{ fontSize: 11 }}`, `YAxis` explicit `width`, axis `label` with
  `style: { fontSize: 11, fill: '#737373', textAnchor: 'middle' }`, `minTickGap`
  for time, `interval={0}` for categorical.
- Tooltip: Recharts default (light) with `formatter`/`labelFormatter` and
  `labelStyle={{ color: '#171717', fontWeight: 600 }}`.
- Bars: `radius={[4,4,0,0]}`, `isAnimationActive={false}`. Lines:
  `type="monotone"`, `strokeWidth 2–2.5`, `dot={false}`, `isAnimationActive={false}`.
- `<Legend/>` for multi-series charts.
- Intl number/percent/currency formatting (`Intl.NumberFormat('de-DE', …)`).

**Dark mode:** lumeapps uses theme-neutral grays (`#737373` labels, light
tooltip) that read on both themes — no `useTheme()` swap. We match that. The
chart lives on the existing card (`bg-white dark:bg-neutral-900`). The live
visual check confirms dark-mode legibility; if `#737373` reads too dim on
`neutral-900`, bump to a slightly lighter neutral that works on both (single
constant in `chart-style.ts`).

## Components

New `src/components/charts/`:

- **`ChartCard.tsx`** — container replacing Tremor `Card`. Matches ecom's current
  card look (`rounded-lg bg-white p-4 ring-1 ring-neutral-200 dark:bg-neutral-900
  dark:ring-neutral-800`, `overflow-visible`). Optional `title` prop rendered as
  the existing `text-sm font-medium text-neutral-700 dark:text-neutral-300`
  heading. `KpiCard` uses it too (keeps its own body markup).
- **`chart-style.ts`** — the lumeapps style, codified once: `BRAND='var(--brand)'`,
  `MUTED='#94a3b8'`, `AXIS_LABEL='#737373'`, `TICK={fontSize:11}`, `TOOLTIP_LABEL`
  style, a `CATEGORICAL` array (brand, slate, amber, emerald, red) for the donut,
  and `de`/`pct`/`eur` Intl formatter helpers. Every chart imports from here so
  they stay consistent and DRY.

Each of the 5 chart components: swap the Tremor chart for the Recharts equivalent
using `chart-style.ts`, keep the component's props/signature and the data it
receives unchanged (so callers/pages don't change).

## Dependencies

`package.json`: add `recharts` (latest 2.x, matching lumeapps' `^2.15`), remove
`@tremor/react`. Confirm no other `@tremor/react` import remains
(`grep -rn "@tremor/react" src`) before removing the dep.

## Testing

Recharts' `ResponsiveContainer` renders empty in jsdom (zero-size). Component
tests (jsdom) mock `ResponsiveContainer` to a fixed-size passthrough, then assert
each migrated chart mounts without throwing and renders its title + expected
series labels/legend. Pure formatter helpers in `chart-style.ts` get direct unit
tests. Existing suite stays green. Typecheck clean.

Live: after deploy, verify each chart renders correctly in the browser on the
VPS in **both light and dark** mode (dashboard `/phase/[phase]` area chart;
BrickPM lager/preis-historie/monitoring/analytics).

## Out of scope

The KPI stat-tile redesign; the aktionen progress bar; a chart-type toggle;
any data/KPI logic changes.
