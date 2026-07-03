# KPI card delta: comparison label + diagonal arrow (lumeapps style)

**Date:** 2026-07-04
**Status:** Approved (design)

## Problem

ecom's KPI cards show the delta as `▲ 39,0 %` — direction via a ▲/▼ triangle,
no indication of what the change is measured against. lumeapps shows
`↗ 2,0 % ggü. <period>`: a diagonal arrow, the magnitude, and a muted
comparison-period suffix.

ecom's `computeKpis` always compares the current window to the immediately
preceding equal-length window (`previousRange`) — a rolling previous period, not
a calendar month. lumeapps names a month only in its month-range mode; for a
rolling range it shows `ggü. Vorperiode`. ecom has no range selector, so its
correct, honest label is **`ggü. Vorperiode`** — matching what lumeapps shows for
a rolling range.

## Change

Render the KPI delta line as: `<↗|↘> <magnitude> % ggü. Vorperiode`, where the
arrow + magnitude keep the green/red up/down color and `ggü. Vorperiode` is muted
neutral-500 (lumeapps' exact composition).

- `src/lib/format.ts` — `formatDelta(deltaPct)` returns just the magnitude
  `"2,0 %"` (drop the ▲/▼; direction now comes from the arrow). Still returns
  `null` when `deltaPct` is null. `pf` (de-DE, 1 decimal) unchanged.
- `src/components/TrendArrow.tsx` (new) — the diagonal ↗/↘ SVG (ported from
  lumeapps), `stroke="currentColor"` so it inherits the delta color.
- `src/components/KpiCard.tsx` — replace the single delta `<p>` with:

  ```tsx
  {delta && (
    <div className="mt-1 flex items-center gap-1 text-xs text-neutral-500">
      <span className={`inline-flex items-center gap-0.5 ${up ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-400'}`}>
        <TrendArrow up={up} />{delta}
      </span>
      <span>ggü. Vorperiode</span>
    </div>
  )}
  ```

`up` (already computed as `(kpi.deltaPct ?? 0) >= 0`) drives arrow + color.

## Scope

`ggü. Vorperiode` is a constant — ecom's comparison is always the rolling
previous period, so it is not threaded from the page (YAGNI; add a prop later if
a range selector arrives). No KPI-engine/semantics change. No calendar-month
comparison. `formatValue` and other cards untouched.

## Testing

- `formatDelta`: `formatDelta(2)` → `"2,0 %"`, `formatDelta(-5)` → `"5,0 %"`
  (magnitude only), `formatDelta(null)` → `null`.
- `KpiCard` (jsdom): a kpi with `deltaPct: 2` renders `ggü. Vorperiode`, the
  `2,0 %` magnitude, and an `svg` (arrow); a kpi with `deltaPct: null` renders no
  delta line.
- Full suite green; live check that the delta line reads `↗ … % ggü. Vorperiode`
  with the arrow, on the dashboard/phase cards in both themes.

## Out of scope

A range selector; month/quarter/year comparison modes; changing which period the
delta measures against.
