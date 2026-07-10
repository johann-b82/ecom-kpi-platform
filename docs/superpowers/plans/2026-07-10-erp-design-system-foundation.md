# ERP Design System Foundation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt the warm Amber ERP design system as the platform standard and reframe the existing KPI dashboard as the first app inside a Rail + Launchpad + module-sidebar shell.

**Architecture:** Design tokens live as CSS custom properties in `globals.css` and are exposed through a Tailwind theme extension (warm `neutral` palette override + `accent`/status/shadow/radius/fonts). A Next.js route group `(shell)` renders a persistent Rail; `/` becomes the Launchpad, the dashboard moves to `/dashboard`, BrickPM moves under the shell and keeps its module sidebar. White-label keeps working via the existing `--brand` mechanism with `--accent: var(--brand)`.

**Tech Stack:** Next.js 14 (App Router), Tailwind CSS, `next/font/google`, next-themes, Recharts, Supabase, Postgres (`pg`), Vitest + Testing Library (jsdom for `tests/components/**`).

## Global Constraints

- **Accent color:** default `#D97706` (Amber 600); hover `#B45309`. Applied via `--accent: var(--brand)` — never hardcode the accent in components; use `bg-accent`/`text-accent`/`bg-brand`.
- **No cold grays:** the Tailwind `neutral` palette is warm (see Task 1 table). Never introduce `gray-*`/`slate-*` or raw cold hex.
- **No pure white/black:** page bg `neutral-50` (`#fafaf8`), primary text/dark surfaces `neutral-900` (`#1e1c1a`).
- **Fonts:** UI = Plus Jakarta Sans (`font-sans`); Mono/labels = DM Mono (`font-mono`). No Roboto, no Light (300) weight.
- **Copy/casing:** German, sentence case; UPPERCASE only for micro-labels via the `.anno` utility (mono, `letter-spacing: 0.07em`). No emoji.
- **Dark mode stays:** every surface must render in light and warm-dark (`.dark`).
- **White-label preserved:** tenant color/logo/title continue to flow through `getBranding` → `RootLayout` inline `--brand`/`--brand-dark`.
- **Tests:** `npx vitest run` must stay green. DB-backed lib tests need Postgres; component tests run under jsdom. `fileParallelism: false`.

---

### Task 1: Warm token foundation (CSS vars + Tailwind theme)

**Files:**
- Modify: `src/app/globals.css`
- Modify: `tailwind.config.ts`

**Interfaces:**
- Produces: Tailwind utilities `bg-accent`/`text-accent`/`border-accent`, `accent-hover`, warm `neutral-{0,50,100,150,200,300,400,500,600,700,800,900,950}`, `success|danger|warning` (`.subtle`/`DEFAULT`/`.border`), `shadow-card`, `shadow-popover`, `rounded-{xs,sm,md,lg,xl,2xl}`, `font-sans` (→ `var(--font-jakarta)`), `font-mono` (→ `var(--font-dm-mono)`); CSS vars `--accent`, `--accent-hover`; the `.anno` class.

- [ ] **Step 1: Rewrite `src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  color-scheme: light;
  /* White-label brand — overridden at runtime by RootLayout inline style (getBranding). */
  --brand: #D97706;
  --brand-dark: #B45309;
  /* Design-system accent maps onto the white-label brand. */
  --accent: var(--brand);
  --accent-hover: var(--brand-dark);
}
.dark { color-scheme: dark; }
body { @apply bg-neutral-50 text-neutral-900 dark:bg-neutral-950 dark:text-neutral-100; }

/* Micro-labels / table headers / annotations (DM Mono, uppercase, wide). */
.anno {
  font-family: var(--font-dm-mono), ui-monospace, monospace;
  font-size: 9px;
  letter-spacing: 0.07em;
  text-transform: uppercase;
  color: #9a9488;
}

.bpm-focus { box-shadow: inset 3px 0 0 0 var(--brand); background: color-mix(in srgb, var(--brand) 8%, transparent); }
```

- [ ] **Step 2: Rewrite `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: 'var(--brand)', dark: 'var(--brand-dark)' },
        accent: { DEFAULT: 'var(--accent)', hover: 'var(--accent-hover)' },
        // Warm neutral scale — overrides Tailwind's cold gray so existing neutral-* classes warm up.
        neutral: {
          0: '#ffffff',
          50: '#fafaf8',
          100: '#f5f2ec',
          150: '#eceae4',
          200: '#e8e4dc',
          300: '#d8d4cc',
          400: '#c4c0b8',
          500: '#9a9488',
          600: '#6b6560',
          700: '#4a4540',
          800: '#2e2a26',
          900: '#1e1c1a',
          950: '#171513',
        },
        success: { subtle: 'rgba(22,163,74,0.10)', DEFAULT: '#166534', border: 'rgba(22,163,74,0.25)' },
        danger: { subtle: 'rgba(220,38,38,0.08)', DEFAULT: '#dc2626', border: 'rgba(220,38,38,0.25)' },
        warning: { subtle: 'rgba(217,119,6,0.10)', DEFAULT: '#b45309', border: 'rgba(217,119,6,0.25)' },
      },
      fontFamily: {
        sans: ['var(--font-jakarta)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'ui-monospace', 'monospace'],
      },
      borderRadius: { xs: '3px', sm: '4px', md: '6px', lg: '8px', xl: '10px', '2xl': '12px' },
      boxShadow: {
        card: '0 1px 3px rgba(0,0,0,0.06)',
        popover: '0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(217,119,6,0.12)',
      },
    },
  },
  plugins: [],
} satisfies Config;
```

Note: the Tremor content glob is intentionally dropped (Tremor was removed in an earlier commit).

- [ ] **Step 3: Verify the app still compiles and tests pass**

Run: `npx tsc --noEmit && npx vitest run`
Expected: type-check clean; the existing suite passes (no test asserts cold hex values).

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css tailwind.config.ts
git commit -m "feat(design): warm token foundation (palette, accent, radii, shadows, fonts)"
```

---

### Task 2: Switch fonts to Plus Jakarta Sans + DM Mono

**Files:**
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Consumes: Tailwind `font-sans`/`font-mono` from Task 1 (they reference `--font-jakarta` / `--font-dm-mono`).
- Produces: `--font-jakarta` and `--font-dm-mono` CSS vars on `<html>`.

- [ ] **Step 1: Replace the Roboto import and html class in `src/app/layout.tsx`**

Replace the `import { Roboto } ...` line and the `const roboto = ...` line with:

```ts
import { Plus_Jakarta_Sans, DM_Mono } from 'next/font/google';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-jakarta', display: 'swap',
});
const dmMono = DM_Mono({
  subsets: ['latin'], weight: ['400', '500'], variable: '--font-dm-mono', display: 'swap',
});
```

Change the `<html ... className={roboto.variable} ...>` to:

```tsx
<html lang="de" className={`${jakarta.variable} ${dmMono.variable}`} style={brandStyle} suppressHydrationWarning>
```

Leave `<body className="font-sans">` as-is (now resolves to Plus Jakarta Sans).

- [ ] **Step 2: Verify build compiles**

Run: `npx tsc --noEmit`
Expected: clean (no remaining `roboto` reference).

- [ ] **Step 3: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(design): switch UI font to Plus Jakarta Sans + DM Mono"
```

---

### Task 3: Amber as default brand color

**Files:**
- Modify: `src/lib/settings.ts:20` (the `BRANDING_DEFAULTS.color` value)
- Test: `tests/lib/settings.test.ts`

**Interfaces:**
- Produces: `BRANDING_DEFAULTS.color === '#D97706'`.

- [ ] **Step 1: Add a failing test in `tests/lib/settings.test.ts`**

Inside the existing `describe('branding settings ...')` block, add:

```ts
it('Default-Akzentfarbe ist Amber #D97706', () => {
  expect(BRANDING_DEFAULTS.color).toBe('#D97706');
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/lib/settings.test.ts`
Expected: FAIL — received `#D9004C`.

- [ ] **Step 3: Change the default in `src/lib/settings.ts`**

In `BRANDING_DEFAULTS`, change `color: '#D9004C',` to `color: '#D97706',`.

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/lib/settings.test.ts`
Expected: PASS (the new test and the existing `toEqual(BRANDING_DEFAULTS)` round-trip test both pass).

- [ ] **Step 5: Commit**

```bash
git add src/lib/settings.ts tests/lib/settings.test.ts
git commit -m "feat(design): default brand color to Amber #D97706"
```

---

### Task 4: App registry + accessibleApps helper

**Files:**
- Modify: `src/lib/apps.ts`
- Modify: `src/lib/groups.ts` (add `accessibleApps`)
- Test: `tests/lib/apps-access.test.ts` (create)

**Interfaces:**
- Produces:
  - `AppDef = { key: AppKey; label: string; abbr: string; href: string }`
  - `APPS: AppDef[]` with `dashboard` (`DB`, `/dashboard`) and `brickpm` (`BP`, `/brickpm`)
  - `accessibleApps(access: UserAccess): AppDef[]` — `dashboard` is always included (baseline app, ungated today); other apps require `access.isAdmin` or a right in `access.apps`.

- [ ] **Step 1: Extend `src/lib/apps.ts`**

Replace the file body with:

```ts
export type AppKey = 'dashboard' | 'brickpm';

export interface AppDef {
  key: AppKey;
  label: string;
  abbr: string; // 2-letter rail icon
  href: string;
}

export const APPS: AppDef[] = [
  { key: 'dashboard', label: 'Dashboard', abbr: 'DB', href: '/dashboard' },
  { key: 'brickpm', label: 'BrickPM', abbr: 'BP', href: '/brickpm' },
];

export const APP_KEYS: AppKey[] = APPS.map((a) => a.key);
```

- [ ] **Step 2: Write the failing test `tests/lib/apps-access.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { accessibleApps } from '@/lib/groups';

describe('accessibleApps', () => {
  it('admin sees every app', () => {
    const keys = accessibleApps({ apps: {}, isAdmin: true }).map((a) => a.key);
    expect(keys).toEqual(['dashboard', 'brickpm']);
  });

  it('non-admin without rights still sees the dashboard (baseline app)', () => {
    const keys = accessibleApps({ apps: {}, isAdmin: false }).map((a) => a.key);
    expect(keys).toEqual(['dashboard']);
  });

  it('non-admin with brickpm access sees dashboard + brickpm', () => {
    const keys = accessibleApps({ apps: { brickpm: 'view' }, isAdmin: false }).map((a) => a.key);
    expect(keys).toEqual(['dashboard', 'brickpm']);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run tests/lib/apps-access.test.ts`
Expected: FAIL — `accessibleApps` is not exported.

- [ ] **Step 4: Add `accessibleApps` to `src/lib/groups.ts`**

The file already imports `APP_KEYS` from `./apps`. Change that import to also bring in `APPS` and `AppDef`, and append the function near the other exported helpers:

```ts
import { APP_KEYS, APPS, type AppKey, type AppDef } from './apps';

// ... existing code ...

/** Apps to surface in the Rail/Launchpad. Dashboard is always shown (ungated baseline); others gated. */
export function accessibleApps(access: UserAccess): AppDef[] {
  return APPS.filter((a) => a.key === 'dashboard' || access.isAdmin || !!access.apps[a.key]);
}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run tests/lib/apps-access.test.ts`
Expected: PASS (all three cases).

- [ ] **Step 6: Commit**

```bash
git add src/lib/apps.ts src/lib/groups.ts tests/lib/apps-access.test.ts
git commit -m "feat(shell): app registry (abbr/href) + accessibleApps helper"
```

---

### Task 5: AppRail component

**Files:**
- Create: `src/components/AppRail.tsx`
- Test: `tests/components/app-rail.test.tsx` (create)

**Interfaces:**
- Consumes: `AppDef` from `@/lib/apps`.
- Produces: `AppRail({ apps, logo, title }: { apps: AppDef[]; logo: string | null; title: string })` — client component; the active app's link carries `aria-current="page"`.

- [ ] **Step 1: Write the failing test `tests/components/app-rail.test.tsx`**

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

import { AppRail } from '@/components/AppRail';
import { APPS } from '@/lib/apps';

afterEach(cleanup);

it('renders one icon per app with the current app marked active', () => {
  render(<AppRail apps={APPS} logo={null} title="Muster GmbH" />);
  expect(screen.getByText('DB')).toBeTruthy();
  expect(screen.getByText('BP')).toBeTruthy();
  const active = screen.getByRole('link', { name: /Dashboard/i });
  expect(active.getAttribute('aria-current')).toBe('page');
});

it('shows the powered-by lumeapps mark', () => {
  render(<AppRail apps={APPS} logo={null} title="Muster GmbH" />);
  expect(screen.getByText(/lumeapps/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/app-rail.test.tsx`
Expected: FAIL — module `@/components/AppRail` not found.

- [ ] **Step 3: Implement `src/components/AppRail.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppDef } from '@/lib/apps';

export function AppRail({ apps, logo, title }: { apps: AppDef[]; logo: string | null; title: string }) {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');
  const home = pathname === '/';

  return (
    <nav className="flex w-[54px] shrink-0 flex-col items-center gap-1 bg-neutral-900 py-2.5">
      <Link
        href="/"
        aria-label="Launchpad"
        aria-current={home ? 'page' : undefined}
        className={`mb-1 flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg ${
          home ? 'ring-1 ring-accent/40' : ''
        }`}
        style={{ background: 'var(--accent)' }}
      >
        {logo
          ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={logo} alt={title} className="h-full w-full object-contain" />
          : <span className="text-sm font-bold text-white">{title.slice(0, 1).toUpperCase()}</span>}
      </Link>
      <span className="my-1 h-px w-5 bg-white/10" />
      {apps.map((a) => {
        const active = isActive(a.href);
        return (
          <Link
            key={a.key}
            href={a.href}
            aria-label={a.label}
            aria-current={active ? 'page' : undefined}
            className={`flex h-[30px] w-9 items-center justify-center rounded-md font-mono text-[9px] font-semibold ${
              active ? 'bg-accent text-white' : 'text-white/35 hover:bg-white/[0.07] hover:text-white/60'
            }`}
          >
            {a.abbr}
          </Link>
        );
      })}
      <div className="flex-1" />
      <span className="mb-1 font-mono text-[6px] tracking-wide text-white/30">lumeapps</span>
    </nav>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/components/app-rail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppRail.tsx tests/components/app-rail.test.tsx
git commit -m "feat(shell): AppRail navigation component"
```

---

### Task 6: Launchpad component

**Files:**
- Create: `src/components/Launchpad.tsx`
- Test: `tests/components/launchpad.test.tsx` (create)

**Interfaces:**
- Consumes: `AppDef` from `@/lib/apps`.
- Produces: `Launchpad({ apps, greeting }: { apps: AppDef[]; greeting?: string })` — presentational; one tile (link to `app.href`) per app showing `abbr` + `label`.

- [ ] **Step 1: Write the failing test `tests/components/launchpad.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Launchpad } from '@/components/Launchpad';
import { APPS } from '@/lib/apps';

afterEach(cleanup);

it('renders one tile per accessible app linking to its href', () => {
  render(<Launchpad apps={APPS} />);
  const dash = screen.getByRole('link', { name: /Dashboard/i });
  expect(dash.getAttribute('href')).toBe('/dashboard');
  expect(screen.getByRole('link', { name: /BrickPM/i }).getAttribute('href')).toBe('/brickpm');
});

it('renders only the apps it is given', () => {
  render(<Launchpad apps={APPS.filter((a) => a.key === 'dashboard')} />);
  expect(screen.queryByRole('link', { name: /BrickPM/i })).toBeNull();
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/components/launchpad.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/components/Launchpad.tsx`**

```tsx
import Link from 'next/link';
import type { AppDef } from '@/lib/apps';

export function Launchpad({ apps, greeting }: { apps: AppDef[]; greeting?: string }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      {greeting && <h1 className="mb-1 text-3xl font-bold text-neutral-900 dark:text-neutral-100">{greeting}</h1>}
      <p className="anno mb-6">Apps — tippen zum Öffnen</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        {apps.map((a) => (
          <Link
            key={a.key}
            href={a.href}
            aria-label={a.label}
            className="flex flex-col gap-2 rounded-lg border border-neutral-200 bg-neutral-0 p-4 shadow-card transition hover:border-accent dark:border-neutral-800 dark:bg-neutral-900"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent font-mono text-[10px] font-bold text-white">
              {a.abbr}
            </span>
            <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">{a.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx vitest run tests/components/launchpad.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/Launchpad.tsx tests/components/launchpad.test.tsx
git commit -m "feat(shell): Launchpad app-grid component"
```

---

### Task 7: Shell route group — rail + launchpad + dashboard move

**Files:**
- Create: `src/app/(shell)/layout.tsx`
- Create: `src/app/(shell)/page.tsx` (Launchpad route)
- Move: `src/app/page.tsx` → `src/app/(shell)/dashboard/page.tsx`
- Move: `src/app/phase/` → `src/app/(shell)/phase/`
- Modify: `src/app/(shell)/phase/[phase]/page.tsx` (back-link `/` → `/dashboard`)

**Interfaces:**
- Consumes: `AppRail` (Task 5), `Launchpad` (Task 6), `accessibleApps` (Task 4), `getBranding`, `getUserAccess`, `createClient`.

- [ ] **Step 1: Move the dashboard and phase routes (git mv)**

```bash
mkdir -p "src/app/(shell)/dashboard"
git mv src/app/page.tsx "src/app/(shell)/dashboard/page.tsx"
git mv src/app/phase "src/app/(shell)/phase"
```

- [ ] **Step 2: Create the shell layout `src/app/(shell)/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess, accessibleApps } from '@/lib/groups';
import { getBranding } from '@/lib/settings';
import { AppRail } from '@/components/AppRail';

export const dynamic = 'force-dynamic';

export default async function ShellLayout({ children }: { children: ReactNode }) {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
  const { logo, title } = await getBranding();

  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <AppRail apps={accessibleApps(access)} logo={logo} title={title} />
      <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
    </div>
  );
}
```

- [ ] **Step 3: Create the Launchpad route `src/app/(shell)/page.tsx`**

```tsx
import { createClient } from '@/lib/supabase/server';
import { getUserAccess, accessibleApps } from '@/lib/groups';
import { Launchpad } from '@/components/Launchpad';

export const dynamic = 'force-dynamic';

export default async function LaunchpadPage() {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
  return (
    <main className="flex-1 overflow-y-auto">
      <Launchpad apps={accessibleApps(access)} greeting="Willkommen zurück." />
    </main>
  );
}
```

- [ ] **Step 4: Make the dashboard page scroll within the shell**

In `src/app/(shell)/dashboard/page.tsx`, wrap the existing `<main className="mx-auto max-w-7xl p-6">…</main>` so it scrolls inside the shell: change the outer element to
`<main className="flex-1 overflow-y-auto"><div className="mx-auto max-w-7xl p-6">…</div></main>`
(keep the existing header/filters/phases markup inside the inner `div`).

- [ ] **Step 5: Fix the phase back-link**

In `src/app/(shell)/phase/[phase]/page.tsx`, change `<Link href="/" ...>← Zur Übersicht</Link>` to `href="/dashboard"`.

- [ ] **Step 6: Verify routing + type-check + suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; suite green (no test imports the moved `app/page.tsx`).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(shell): route-group shell with rail; launchpad at /, dashboard at /dashboard"
```

---

### Task 8: Move BrickPM under the shell + token restyle its sidebar

**Files:**
- Move: `src/app/brickpm/` → `src/app/(shell)/brickpm/`
- Modify: `src/app/(shell)/brickpm/layout.tsx` (drop its own full-screen shell; fix links)
- Modify: `src/components/BpmIntegrations.tsx`, `src/components/BpmNotifications.tsx` (actions import path)
- Modify: `tests/app/brickpm-actions.test.ts` (actions import path)
- Modify: `src/components/BpmSidebar.tsx` (active state → `bg-accent`)

**Interfaces:**
- Consumes: the shell layout (Task 7) now provides the Rail; BrickPM provides only its module sidebar + header + content.

- [ ] **Step 1: Move the BrickPM route into the shell group**

```bash
git mv src/app/brickpm "src/app/(shell)/brickpm"
```

- [ ] **Step 2: Update the three imports of the actions module**

Replace `@/app/brickpm/actions` with `@/app/(shell)/brickpm/actions` in:
- `src/components/BpmIntegrations.tsx`
- `src/components/BpmNotifications.tsx`
- `tests/app/brickpm-actions.test.ts`

- [ ] **Step 3: Adapt `src/app/(shell)/brickpm/layout.tsx` to live inside the shell**

Change the root wrapper so it fills the shell's content area instead of the full screen, and point the back-link at the dashboard:
- Root `<div className="flex h-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950">` → `<div className="flex flex-1 overflow-hidden">`.
- Back-link `<Link href="/" ...>← Dashboard</Link>` → `href="/dashboard"`.
- Leave the `requireAppAccess('brickpm')` gate and its `redirect('/')` (redirect to the launchpad is correct).

- [ ] **Step 4: Restyle the BrickPM sidebar active state to the accent token**

In `src/components/BpmSidebar.tsx`, change the active class `'bg-brand font-medium text-white'` to `'bg-accent font-medium text-white'`. Leave the rest (already warm via the neutral override).

- [ ] **Step 5: Verify type-check + suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean; `tests/app/brickpm-actions.test.ts` passes with the new import path.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(shell): mount BrickPM under the shell rail; accent sidebar"
```

---

### Task 9: Visual token audit of core components

**Files:**
- Modify (as needed): `src/components/KpiCard.tsx`, `src/components/BrandHeader.tsx`, `src/components/UserMenu.tsx`, `src/components/Filters.tsx`, `src/components/PhaseColumn.tsx`

**Interfaces:** none new — this is alignment only.

- [ ] **Step 1: Find hardcoded non-token colors**

Run: `grep -rnE "#([0-9a-fA-F]{6}|[0-9a-fA-F]{3})|gray-|slate-|zinc-|stone-" src/components src/app | grep -v "var(--"`
Expected: a short list. The KpiCard trend colors (`emerald-*`/`red-*`) are acceptable semantics; leave them. Replace any cold `gray/slate/zinc/stone` utilities with `neutral-*`, and any raw accent-ish hex with `accent`/`brand`.

- [ ] **Step 2: Apply the fixes** surfaced in Step 1 (only cold-gray → warm `neutral-*`, raw brand/accent hex → tokens). Do not restyle beyond that (surgical).

- [ ] **Step 3: Type-check + suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: clean and green.

- [ ] **Step 4: Visual check in the browser (light + dark)**

Drive the running app and confirm the Rail, Launchpad (`/`), Dashboard (`/dashboard`), and BrickPM (`/brickpm`) render correctly, scroll properly, and look right in light and warm-dark. Use Chrome DevTools / Claude-in-Chrome. Fix any layout/scroll issues found (shell flex/overflow), re-running the suite after changes. (Deployment target for this check is decided at verification time per the spec.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(design): align core components to warm tokens"
```

---

### Task 10: Anchor the standard (guidelines + CLAUDE.md + memory)

**Files:**
- Create: `docs/design/design-system.md`
- Modify: `CLAUDE.md`
- Create: `/root/.claude/projects/-root-ecom-platform/memory/erp-design-system-standard.md`
- Modify: `/root/.claude/projects/-root-ecom-platform/memory/MEMORY.md`

**Interfaces:** none.

- [ ] **Step 1: Write `docs/design/design-system.md`** — a compact, binding reference. Include: the token tables (warm neutral scale, accent/status, radii, shadows), font rules (Plus Jakarta Sans / DM Mono, `.anno`), the Rail+Launchpad+module-sidebar shell architecture, white-label (`--accent: var(--brand)`, `getBranding`), the warm-dark dark-mode layer (the documented extension beyond the light-only source), and Do/Don't (no cold gray, no pure white/black, no emoji, tokens over hex, UPPERCASE only via `.anno`). Reference the source design-system files and this repo's spec/plan.

- [ ] **Step 2: Add a "Design-Standard" section to `CLAUDE.md`** pointing at `docs/design/design-system.md` and listing the non-negotiable rules verbatim from Global Constraints (accent via `--accent`, warm `neutral` palette, Plus Jakarta Sans/DM Mono, no cold gray / pure white-black, dark mode required, white-label preserved). Keep it short — the detail lives in the guidelines file.

- [ ] **Step 3: Write the project memory** `erp-design-system-standard.md`:

```markdown
---
name: erp-design-system-standard
description: The warm Amber ERP design system is the binding frontend standard for ecom-platform.
metadata:
  type: project
---

The `ecom-platform` frontend follows the warm Amber **ERP design system** as the
binding standard: warm neutral palette, Amber accent (`#D97706`) via `--accent: var(--brand)`,
Plus Jakarta Sans + DM Mono, Rail + Launchpad + module-sidebar shell, dark mode required.
Source of truth: `docs/design/design-system.md`. Foundation shipped in phase 1
(spec `docs/superpowers/specs/2026-07-10-erp-design-system-foundation-design.md`).
The KPI dashboard is the first app; further ERP apps (CRM, Finanzen, …) and the
Kontextbrücke/Statuspuls features are future phases.

**Why:** The KPI dashboard is being grown into a modular ERP platform; the design
system unifies all apps.
**How to apply:** Use the tokens/utilities from Task 1 (never raw cold hex); new
apps register in `src/lib/apps.ts` and mount under the `(shell)` route group.
```

- [ ] **Step 4: Add the MEMORY.md pointer**

Append to `/root/.claude/projects/-root-ecom-platform/memory/MEMORY.md`:
`- [ERP design system standard](erp-design-system-standard.md) — warm Amber tokens + Rail/Launchpad shell are binding for the frontend`

- [ ] **Step 5: Commit (repo files only; memory lives outside the repo)**

```bash
git add docs/design/design-system.md CLAUDE.md
git commit -m "docs(design): anchor ERP design system as the frontend standard"
```

---

## Self-Review

**Spec coverage:** tokens+Tailwind (T1), fonts (T2), Amber default + white-label (T1 vars + T3), dark-mode warm layer (T1 palette + T10 docs), app-shell/rail/launchpad (T4–T7), BrickPM integration (T8), launchpad "only existing apps" (T4 `accessibleApps` + T6/T7), standard anchoring (T10), testing/verification (per-task + T9 visual). All spec sections map to a task.

**Placeholder scan:** no TBD/TODO; every code step shows real content; the one legitimately open item (shell flex/overflow tuning) is scoped to a browser-verified fix step (T9.4), not a placeholder.

**Type consistency:** `AppDef`/`APPS`/`AppKey` (T4) used identically in T5/T6/T7; `accessibleApps(access: UserAccess): AppDef[]` signature consistent across T4/T7; `AppRail({apps,logo,title})` and `Launchpad({apps,greeting})` props match their call sites in the shell layout/pages.
