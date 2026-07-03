# KPI Delta Comparison Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render the KPI delta as `↗ 2,0 % ggü. Vorperiode` (diagonal arrow + magnitude + muted comparison label).

**Architecture:** `formatDelta` returns just the magnitude; a new `TrendArrow` SVG gives the ↗/↘ direction; `KpiCard` composes arrow + magnitude (colored) + `ggü. Vorperiode` (muted).

**Tech Stack:** React 18, Tailwind, Vitest + Testing Library (jsdom).

## Global Constraints

- `ggü. Vorperiode` is a constant (ecom always compares to the rolling previous period). No KPI-engine change.
- Arrow + magnitude keep green (`text-emerald-600 dark:text-emerald-500`) / red (`text-red-600 dark:text-red-400`); the suffix is `text-neutral-500`.
- `formatDelta` still returns `null` when `deltaPct` is null; `pf` (de-DE, 1 decimal) unchanged.

---

### Task 1: `formatDelta` returns magnitude only + `TrendArrow`

**Files:**
- Modify: `src/lib/format.ts` (`formatDelta`)
- Create: `src/components/TrendArrow.tsx`
- Test: `tests/lib/format-delta.test.ts`

**Interfaces:**
- Produces: `formatDelta(deltaPct: number | null): string | null` → `"2,0 %"` (magnitude, no arrow) or `null`. `TrendArrow({ up: boolean })` → inline ↗/↘ svg inheriting `currentColor`.

- [ ] **Step 1: Write the failing test** — `tests/lib/format-delta.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { formatDelta } from '@/lib/format';

describe('formatDelta', () => {
  it('gibt den Betrag ohne Pfeil/Vorzeichen zurück', () => {
    expect(formatDelta(2)).toBe('2,0 %');
    expect(formatDelta(-5)).toBe('5,0 %');
  });
  it('gibt null zurück, wenn deltaPct null ist', () => {
    expect(formatDelta(null)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/format-delta.test.ts`
Expected: FAIL — current output is `"▲ 2,0 %"` / `"▼ 5,0 %"`.

- [ ] **Step 3: Implement** — in `src/lib/format.ts` replace the body of `formatDelta`:

```ts
export function formatDelta(deltaPct: number | null): string | null {
  if (deltaPct === null) return null;
  return `${pf.format(Math.abs(deltaPct))} %`;
}
```

Then create `src/components/TrendArrow.tsx`:

```tsx
// Diagonal trend arrow (↗ up / ↘ down). Inherits the parent's text color.
export function TrendArrow({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="inline-block shrink-0">
      {up ? (
        <><line x1="7" y1="17" x2="17" y2="7" /><polyline points="8 7 17 7 17 16" /></>
      ) : (
        <><line x1="7" y1="7" x2="17" y2="17" /><polyline points="17 8 17 17 8 17" /></>
      )}
    </svg>
  );
}
```

- [ ] **Step 4: Run test + typecheck**

Run: `npx vitest run tests/lib/format-delta.test.ts && npx tsc --noEmit && echo tsc-clean`
Expected: PASS, `tsc-clean`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/format.ts src/components/TrendArrow.tsx tests/lib/format-delta.test.ts
git commit -m "feat: formatDelta returns magnitude only; add TrendArrow"
```

---

### Task 2: KpiCard delta line with arrow + `ggü. Vorperiode`

**Files:**
- Modify: `src/components/KpiCard.tsx`
- Test: `tests/components/kpi-card-delta.test.tsx`

**Interfaces:**
- Consumes: `formatDelta`, `TrendArrow` from Task 1.

- [ ] **Step 1: Write the failing test** — `tests/components/kpi-card-delta.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { KpiCard } from '@/components/KpiCard';
import type { Kpi } from '@/kpi/types';

afterEach(cleanup);

const base: Kpi = { key: 'sessions', label: 'Sitzungen', phase: 'see', value: 100, unit: 'number', available: true, deltaPct: null };

describe('KpiCard delta', () => {
  it('zeigt Pfeil + Betrag + „ggü. Vorperiode“ bei vorhandenem delta', () => {
    const { container } = render(<KpiCard kpi={{ ...base, deltaPct: 2 }} />);
    expect(screen.getByText(/ggü\. Vorperiode/)).toBeTruthy();
    expect(screen.getByText('2,0 %')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy(); // TrendArrow
  });
  it('zeigt keine Delta-Zeile, wenn deltaPct null ist', () => {
    render(<KpiCard kpi={base} />);
    expect(screen.queryByText(/ggü\. Vorperiode/)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/kpi-card-delta.test.tsx`
Expected: FAIL — no `ggü. Vorperiode` text yet.

- [ ] **Step 3: Implement** — in `src/components/KpiCard.tsx`:

Add the import near the top:

```tsx
import { TrendArrow } from './TrendArrow';
```

Replace the existing delta block:

```tsx
      {delta && (
        <p className={`mt-1 text-xs ${up ? 'text-emerald-600 dark:text-emerald-500' : 'text-red-600 dark:text-red-400'}`}>{delta}</p>
      )}
```

with:

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

- [ ] **Step 4: Run test + full suite + typecheck**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres bash -c 'npm run migrate && npx vitest run && npx tsc --noEmit && echo tsc-clean'`
Expected: all PASS, `tsc-clean`.

- [ ] **Step 5: Commit**

```bash
git add src/components/KpiCard.tsx tests/components/kpi-card-delta.test.tsx
git commit -m "feat: KPI delta shows arrow + ggü. Vorperiode"
```

---

### Task 3: Deploy + live verify

- [ ] **Step 1:** Merge the PR (needs user authorization) and run `deploy/deploy.sh` on the VPS.
- [ ] **Step 2:** In the browser at `https://budp.lumeapps.de/phase/see`, confirm the KPI tiles read `↗ <n> % ggü. Vorperiode` (arrow + magnitude in green/red, muted suffix) in both themes.
