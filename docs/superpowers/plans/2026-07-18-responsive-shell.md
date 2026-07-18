# Responsive Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die bestehende ERP-Shell an drei Breakpoints responsive machen — Rail → Bottom-Tab-Bar auf Mobile, Per-App-Sidebar → Overlay-Drawer (Tablet) / Fullscreen-Sheet (Mobile), Modulname im Top-Bar als Trigger.

**Architecture:** Ein schlanker Client-Context (`ShellNav`) im `(shell)/layout.tsx` überbrückt den Trigger im Top-Bar und die tief in den App-Layouts liegenden Sidebars. Die Sidebar-Chrome (Breite/Border/Position) wandert in einen gemeinsamen `ModuleSidebar`-Wrapper, der per CSS an allen drei Breakpoints das richtige Layout rendert (kein Portal, eine DOM-Instanz). Rail und Bottom-Tab-Bar sind zwei per Breakpoint umgeschaltete Varianten derselben App-Registry.

**Tech Stack:** Next.js App Router (Server + Client Components), React Context, Tailwind (Standard-Breakpoints `md`=768px, `lg`=1024px), Vitest + @testing-library/react (jsdom für `tests/components/**`).

## Global Constraints

- **Design-System (bindend):** Akzent nur via `text-accent`/`bg-accent` (→ `var(--brand)`), nie ein hartkodierter Akzent. Warme `neutral`-Palette, kein cold gray/slate/zinc. Dark-Mode für alles Neue (`dark:`-Varianten). Referenz: `docs/design/design-system.md`.
- **Breakpoints:** Nur Tailwind-Standard `md` (768px) und `lg` (1024px). Keine Custom-Breakpoints.
- **Touch (Regel 5):** Ab `<lg` alle interaktiven Elemente min. 44px Höhe (`min-h-11` = 44px, `min-h-14` = 56px).
- **Bottom-Tab-Bar (Regel 1):** Max. 5 Icons = erste 4 zugängliche Apps (Registry-Reihenfolge) + „Mehr". Aktive App immer sichtbar & amber. „Mehr" öffnet Launchpad (`/`).
- **Sidebar-Breite (Regel 2):** Ab Tablet abwärts volle Breite als Overlay/Sheet, nie gequetscht. Desktop-Breiten unverändert: Rail 64px (`w-16`), Sidebar 224px (`w-56`).
- **Nicht im Scope:** Statuspuls & Kontextbrücke (existieren nicht) werden nicht gebaut.
- **Deployment:** Kein lokaler App-Start. `npx vitest` läuft lokal; die laufende App wird auf dem VPS (`root@194.164.204.249`, https://budp.lumeapps.de) verifiziert.
- **Spec:** `docs/superpowers/specs/2026-07-18-responsive-shell-design.md`.

---

### Task 1: Pure Helper — aktive App + Tab-Bar-Auswahl

Zwei reine Funktionen, die die gesamte nicht-visuelle Logik tragen. Kein React, voll unit-testbar.

**Files:**
- Create: `src/lib/shell-nav.ts`
- Test: `tests/lib/shell-nav.test.ts`

**Interfaces:**
- Consumes: `APPS`, `AppDef`, `AppKey` aus `src/lib/apps.ts`.
- Produces:
  - `activeApp(pathname: string): AppDef | null` — die App, deren `href` den Pfad matcht (exakt oder als Präfix mit `/`).
  - `selectTabApps(apps: AppDef[], activeKey: AppKey | null): { tabs: AppDef[]; showMore: boolean }` — erste 4 Apps; ist `activeKey` gesetzt und nicht unter den ersten 4, ersetzt die aktive App den 4. Slot. `showMore` true, sobald mehr als 4 Apps vorhanden sind.

- [ ] **Step 1: Write the failing test**

```ts
// tests/lib/shell-nav.test.ts
import { describe, it, expect } from 'vitest';
import { activeApp, selectTabApps } from '@/lib/shell-nav';
import { APPS, type AppDef } from '@/lib/apps';

describe('activeApp', () => {
  it('matcht exakten App-Pfad', () => {
    expect(activeApp('/verkauf')?.key).toBe('verkauf');
  });
  it('matcht Unterpfad als Präfix', () => {
    expect(activeApp('/verkauf/belege/42')?.key).toBe('verkauf');
  });
  it('liefert null auf dem Launchpad', () => {
    expect(activeApp('/')).toBeNull();
  });
  it('matcht nicht auf Teil-Segment-Kollision', () => {
    // '/verkaufxy' darf nicht als '/verkauf' zählen
    expect(activeApp('/verkaufxy')).toBeNull();
  });
});

describe('selectTabApps', () => {
  const apps = APPS; // 7 Apps
  it('zeigt die ersten 4 + showMore bei >4 Apps', () => {
    const { tabs, showMore } = selectTabApps(apps, null);
    expect(tabs.map((a) => a.key)).toEqual(['verfuegbarkeit', 'verkauf', 'finanzen', 'katalog']);
    expect(showMore).toBe(true);
  });
  it('ersetzt Slot 4 durch die aktive App, wenn sie nicht unter den ersten 4 ist', () => {
    const { tabs } = selectTabApps(apps, 'brickpm');
    expect(tabs.map((a) => a.key)).toEqual(['verfuegbarkeit', 'verkauf', 'finanzen', 'brickpm']);
  });
  it('lässt die ersten 4 unverändert, wenn die aktive App schon dabei ist', () => {
    const { tabs } = selectTabApps(apps, 'verkauf');
    expect(tabs.map((a) => a.key)).toEqual(['verfuegbarkeit', 'verkauf', 'finanzen', 'katalog']);
  });
  it('zeigt alle Apps ohne showMore bei <=4 Apps', () => {
    const four = apps.slice(0, 4) as AppDef[];
    const { tabs, showMore } = selectTabApps(four, 'brickpm');
    expect(tabs).toHaveLength(4);
    expect(showMore).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/shell-nav.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/shell-nav"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/shell-nav.ts
import { APPS, type AppDef, type AppKey } from './apps';

export function activeApp(pathname: string): AppDef | null {
  return APPS.find((a) => pathname === a.href || pathname.startsWith(a.href + '/')) ?? null;
}

export function selectTabApps(
  apps: AppDef[],
  activeKey: AppKey | null,
): { tabs: AppDef[]; showMore: boolean } {
  if (apps.length <= 4) return { tabs: apps, showMore: false };
  let tabs = apps.slice(0, 4);
  if (activeKey && !tabs.some((a) => a.key === activeKey)) {
    const active = apps.find((a) => a.key === activeKey);
    if (active) tabs = [...apps.slice(0, 3), active];
  }
  return { tabs, showMore: true };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/shell-nav.test.ts`
Expected: PASS (alle 8 Cases grün).

- [ ] **Step 5: Commit**

```bash
git add src/lib/shell-nav.ts tests/lib/shell-nav.test.ts
git commit -m "feat(shell): reine Helper für aktive App + Tab-Bar-Auswahl"
```

---

### Task 2: ShellNav-Context + Provider

Client-Context, der den Öffnen-Zustand des Sidebar-Drawers/-Sheets hält und bei Routenwechsel schließt. Trigger (`ModuleBar`) und Sidebar (`ModuleSidebar`) konsumieren ihn beide.

**Files:**
- Create: `src/components/ShellNav.tsx`
- Test: `tests/components/shell-nav.test.tsx`

**Interfaces:**
- Consumes: `usePathname` aus `next/navigation`.
- Produces:
  - `ShellNavProvider({ children }: { children: ReactNode })` — Context-Provider.
  - `useShellNav(): { open: boolean; toggle: () => void; close: () => void }` — wirft außerhalb des Providers.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/shell-nav.test.tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/verkauf' }));

import { ShellNavProvider, useShellNav } from '@/components/ShellNav';

afterEach(cleanup);

function Probe() {
  const { open, toggle, close } = useShellNav();
  return (
    <div>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
      <button onClick={toggle}>toggle</button>
      <button onClick={close}>close</button>
    </div>
  );
}

describe('ShellNav', () => {
  it('startet geschlossen und toggelt', () => {
    render(<ShellNavProvider><Probe /></ShellNavProvider>);
    expect(screen.getByTestId('state').textContent).toBe('closed');
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('state').textContent).toBe('open');
    fireEvent.click(screen.getByText('close'));
    expect(screen.getByTestId('state').textContent).toBe('closed');
  });

  it('useShellNav wirft außerhalb des Providers', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/ShellNavProvider/);
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/shell-nav.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/ShellNav"`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/ShellNav.tsx
'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';

type ShellNav = { open: boolean; toggle: () => void; close: () => void };
const Ctx = createContext<ShellNav | null>(null);

export function ShellNavProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Bei Navigation (Link-Auswahl) Drawer/Sheet schließen.
  useEffect(() => { setOpen(false); }, [pathname]);
  const toggle = useCallback(() => setOpen((o) => !o), []);
  const close = useCallback(() => setOpen(false), []);
  return <Ctx.Provider value={{ open, toggle, close }}>{children}</Ctx.Provider>;
}

export function useShellNav(): ShellNav {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useShellNav must be used within a ShellNavProvider');
  return ctx;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/shell-nav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/ShellNav.tsx tests/components/shell-nav.test.tsx
git commit -m "feat(shell): ShellNav-Context für Sidebar-Drawer/-Sheet-Zustand"
```

---

### Task 3: Bottom-Tab-Bar + Rail-Umschaltung

Neue Bottom-Tab-Bar (`<md` sichtbar), Rail wird `<md` versteckt. Nutzt die Helper aus Task 1.

**Files:**
- Create: `src/components/BottomTabBar.tsx`
- Modify: `src/components/AppRail.tsx:31` (nav-Klasse `flex` → `hidden md:flex`)
- Modify: `src/app/(shell)/layout.tsx` (BottomTabBar mounten)
- Test: `tests/components/bottom-tab-bar.test.tsx`

**Interfaces:**
- Consumes: `activeApp`, `selectTabApps` aus `src/lib/shell-nav.ts`; `AppDef` aus `src/lib/apps.ts`; `usePathname`.
- Produces: `BottomTabBar({ apps }: { apps: AppDef[] })`.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/components/bottom-tab-bar.test.tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

let path = '/brickpm';
vi.mock('next/navigation', () => ({ usePathname: () => path }));

import { BottomTabBar } from '@/components/BottomTabBar';
import { APPS } from '@/lib/apps';

afterEach(cleanup);

describe('BottomTabBar', () => {
  it('zeigt erste 4 Apps + „Mehr" und markiert die aktive App amber', () => {
    path = '/brickpm'; // brickpm ist nicht unter den ersten 4 → ersetzt Slot 4
    render(<BottomTabBar apps={APPS} />);
    expect(screen.getByRole('link', { name: /Verfügbarkeit/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /BrickPM/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Mehr/i })).toBeTruthy();
    // Katalog (ursprünglicher Slot 4) ist verdrängt
    expect(screen.queryByRole('link', { name: /Katalog/i })).toBeNull();
    const active = screen.getByRole('link', { name: /BrickPM/i });
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(active.className).toContain('text-accent');
  });

  it('markiert „Mehr" auf dem Launchpad', () => {
    path = '/';
    render(<BottomTabBar apps={APPS} />);
    const more = screen.getByRole('link', { name: /Mehr/i });
    expect(more.getAttribute('aria-current')).toBe('page');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/bottom-tab-bar.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/BottomTabBar"`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/components/BottomTabBar.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { AppDef } from '@/lib/apps';
import { activeApp, selectTabApps } from '@/lib/shell-nav';

export function BottomTabBar({ apps }: { apps: AppDef[] }) {
  const pathname = usePathname();
  const active = activeApp(pathname);
  const { tabs, showMore } = selectTabApps(apps, active?.key ?? null);
  const onLaunchpad = pathname === '/';

  const cell =
    'flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 font-mono text-[0.6rem]';

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-neutral-800 bg-neutral-900 pb-[env(safe-area-inset-bottom)] md:hidden">
      {tabs.map((a) => {
        const isActive = active?.key === a.key;
        return (
          <Link
            key={a.key}
            href={a.href}
            aria-label={a.label}
            aria-current={isActive ? 'page' : undefined}
            className={`${cell} ${isActive ? 'text-accent' : 'text-white/50'}`}
          >
            <span className="text-sm font-semibold">{a.abbr}</span>
            <span>{a.label}</span>
          </Link>
        );
      })}
      {showMore && (
        <Link
          href="/"
          aria-label="Mehr"
          aria-current={onLaunchpad ? 'page' : undefined}
          className={`${cell} ${onLaunchpad ? 'text-accent' : 'text-white/50'}`}
        >
          <span className="text-sm font-semibold">•••</span>
          <span>Mehr</span>
        </Link>
      )}
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/bottom-tab-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Rail `<md` verstecken**

In `src/components/AppRail.tsx` die nav-Klasse (Zeile 31) ändern:

```tsx
// vorher:
<nav className="flex w-16 shrink-0 flex-col items-center gap-1.5 bg-neutral-900 py-3">
// nachher:
<nav className="hidden w-16 shrink-0 flex-col items-center gap-1.5 bg-neutral-900 py-3 md:flex">
```

- [ ] **Step 6: BottomTabBar im Shell-Layout mounten**

In `src/app/(shell)/layout.tsx`: `BottomTabBar` importieren und am Ende des äußeren Containers rendern (fix positioniert, daher Position im Baum unkritisch — ans Ende der äußeren `<div>` setzen).

```tsx
import { BottomTabBar } from '@/components/BottomTabBar';
// ...
  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <AppRail apps={accessibleApps(access)} logo={logo} title={title} />
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* header + content unverändert */}
        {/* ... */}
      </div>
      <BottomTabBar apps={accessibleApps(access)} />
    </div>
  );
```

- [ ] **Step 7: Bestehende Rail-Tests + Suite grün**

Run: `npx vitest run tests/components/app-rail.test.tsx tests/components/bottom-tab-bar.test.tsx`
Expected: PASS (app-rail.test.tsx prüft Text/aria, nicht die `flex`-Klasse → bleibt grün).

- [ ] **Step 8: Commit**

```bash
git add src/components/BottomTabBar.tsx src/components/AppRail.tsx "src/app/(shell)/layout.tsx" tests/components/bottom-tab-bar.test.tsx
git commit -m "feat(shell): Bottom-Tab-Bar auf Mobile, Rail ab md"
```

---

### Task 4: ModuleBar-Trigger + ModuleSidebar-Wrapper (Drawer/Sheet)

Der Kern: Sidebar-Chrome wandert aus den 7 Sidebar-Komponenten in einen gemeinsamen `ModuleSidebar`-Wrapper, der an allen drei Breakpoints das richtige Layout rendert. `ModuleBar` zeigt `<lg` den Modulnamen als Trigger. `ShellNavProvider` wird im Shell-Layout montiert.

**Files:**
- Create: `src/components/ModuleBar.tsx`
- Create: `src/components/ModuleSidebar.tsx`
- Modify: `src/app/(shell)/layout.tsx` (ShellNavProvider umschließt Content-Spalte, ModuleBar im Header)
- Modify: die 7 Sidebar-Komponenten (nav-Chrome-Klasse) — `VerkaufSidebar`, `VerfuegbarkeitSidebar`, `FinanzenSidebar`, `KontakteSidebar`, `KatalogSidebar`, `BpmSidebar`, `help/HilfeSidebar`
- Modify: die 7 App-Layouts (Sidebar in `<ModuleSidebar>` hüllen, `<main>`-Bottom-Padding)
- Test: `tests/components/module-bar.test.tsx`

**Interfaces:**
- Consumes: `useShellNav` aus `src/components/ShellNav.tsx`; `activeApp` aus `src/lib/shell-nav.ts`; `usePathname`.
- Produces:
  - `ModuleBar()` — rendert `<lg` einen Button mit dem aktiven Modulnamen, der `toggle()` aufruft; `null` auf dem Launchpad.
  - `ModuleSidebar({ children }: { children: ReactNode })` — positioniert `children` inline (`≥lg`) bzw. als Drawer/Sheet (`<lg`).

- [ ] **Step 1: Write the failing test (ModuleBar)**

```tsx
// tests/components/module-bar.test.tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

let path = '/verkauf';
vi.mock('next/navigation', () => ({ usePathname: () => path }));

const toggle = vi.fn();
vi.mock('@/components/ShellNav', () => ({ useShellNav: () => ({ open: false, toggle, close: vi.fn() }) }));

import { ModuleBar } from '@/components/ModuleBar';

afterEach(() => { cleanup(); toggle.mockClear(); });

describe('ModuleBar', () => {
  it('zeigt den aktiven Modulnamen und toggelt bei Klick', () => {
    path = '/verkauf/belege/1';
    render(<ModuleBar />);
    const btn = screen.getByRole('button', { name: /Verkauf/i });
    expect(btn.className).toContain('lg:hidden'); // nur unter lg als Trigger
    fireEvent.click(btn);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('rendert nichts auf dem Launchpad', () => {
    path = '/';
    const { container } = render(<ModuleBar />);
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/module-bar.test.tsx`
Expected: FAIL — `Failed to resolve import "@/components/ModuleBar"`.

- [ ] **Step 3: ModuleBar implementieren**

```tsx
// src/components/ModuleBar.tsx
'use client';
import { usePathname } from 'next/navigation';
import { activeApp } from '@/lib/shell-nav';
import { useShellNav } from '@/components/ShellNav';

export function ModuleBar() {
  const pathname = usePathname();
  const { toggle } = useShellNav();
  const app = activeApp(pathname);
  if (!app) return null;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`${app.label}-Menü`}
      className="flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-semibold text-neutral-900 hover:bg-neutral-100 dark:text-neutral-100 dark:hover:bg-neutral-800 lg:hidden"
    >
      {app.label}
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/module-bar.test.tsx`
Expected: PASS.

- [ ] **Step 5: ModuleSidebar-Wrapper implementieren**

Der Wrapper trägt die gesamte Chrome: `≥lg` inline (statische 224px-Spalte mit rechtem Border), `md–lg` Drawer von links neben der Rail, `<md` Sheet von unten (fullscreen unter dem Top-Bar). Eine DOM-Instanz, per CSS-`transform` ein-/ausgeblendet.

```tsx
// src/components/ModuleSidebar.tsx
'use client';
import type { ReactNode } from 'react';
import { useShellNav } from '@/components/ShellNav';

export function ModuleSidebar({ children }: { children: ReactNode }) {
  const { open, close } = useShellNav();
  return (
    <>
      {/* Backdrop: nur <lg, nur wenn offen */}
      <div
        onClick={close}
        aria-hidden="true"
        className={`fixed inset-0 z-30 bg-black/40 transition-opacity lg:hidden ${
          open ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
      />
      {/* Panel */}
      <aside
        className={[
          // <md: Fullscreen-Sheet von unten (top-14 = unter dem Top-Bar)
          'fixed inset-x-0 top-14 bottom-0 z-40 shrink-0 overflow-hidden bg-white shadow-xl transition-transform dark:bg-neutral-900',
          open ? 'translate-y-0' : 'translate-y-full',
          // md–lg: Drawer von links, neben der Rail (left-16 = 64px)
          'md:left-16 md:right-auto md:top-14 md:bottom-0 md:w-72',
          open ? 'md:translate-x-0 md:translate-y-0' : 'md:-translate-x-full md:translate-y-0',
          // ≥lg: statische Spalte, 224px, rechter Border, kein Transform/Shadow
          'lg:static lg:z-auto lg:w-56 lg:translate-x-0 lg:translate-y-0 lg:border-r lg:border-neutral-200 lg:shadow-none dark:lg:border-neutral-800',
        ].join(' ')}
      >
        {children}
      </aside>
    </>
  );
}
```

- [ ] **Step 6: Sidebar-Chrome in die 7 Sidebars-`nav` zentralisieren**

In allen 7 Sidebar-Komponenten die identische äußere `nav`-Klasse ersetzen. Die Breite/Border/`shrink-0` gehört jetzt dem Wrapper; die `nav` füllt nur noch ihren Container.

Betroffene Dateien und Zeilen:
- `src/components/VerkaufSidebar.tsx:14`
- `src/components/VerfuegbarkeitSidebar.tsx:15`
- `src/components/FinanzenSidebar.tsx:14`
- `src/components/KontakteSidebar.tsx:12`
- `src/components/KatalogSidebar.tsx:12`
- `src/components/BpmSidebar.tsx:35`
- `src/components/help/HilfeSidebar.tsx:16`

Jeweils exakt ersetzen:

```tsx
// vorher (identisch in allen 7):
<nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
// nachher:
<nav className="h-full w-full overflow-y-auto bg-white p-3 dark:bg-neutral-900">
```

- [ ] **Step 7: Die 7 App-Layouts auf `<ModuleSidebar>` umstellen + `<main>`-Padding**

In jedem App-Layout die Sidebar in `<ModuleSidebar>` hüllen und dem `<main>` Bottom-Padding für die Tab-Bar geben. Beispiel `src/app/(shell)/verkauf/layout.tsx`:

```tsx
import { ModuleSidebar } from '@/components/ModuleSidebar';
// ...
  return (
    <div className="flex flex-1 overflow-hidden">
      <ModuleSidebar><VerkaufSidebar /></ModuleSidebar>
      <main className="flex-1 overflow-y-auto p-6 pb-20 md:pb-6">{children}</main>
    </div>
  );
```

Identisch anwenden auf:
- `src/app/(shell)/verfuegbarkeit/layout.tsx` → `<ModuleSidebar><VerfuegbarkeitSidebar /></ModuleSidebar>`
- `src/app/(shell)/finanzen/layout.tsx` → `<ModuleSidebar><FinanzenSidebar /></ModuleSidebar>`
- `src/app/(shell)/katalog/layout.tsx` → `<ModuleSidebar><KatalogSidebar /></ModuleSidebar>`
- `src/app/(shell)/kontakte/layout.tsx` → `<ModuleSidebar><KontakteSidebar /></ModuleSidebar>`
- `src/app/(shell)/brickpm/layout.tsx` → `<ModuleSidebar><BpmSidebar /></ModuleSidebar>`
- `src/app/(shell)/hilfe/layout.tsx` → `<ModuleSidebar><HilfeSidebar isAdmin={access.isAdmin} /></ModuleSidebar>`

Jeweils den `<main ...>` um `pb-20 md:pb-6` ergänzen (bestehendes `p-6` bleibt).

- [ ] **Step 8: ShellNavProvider + ModuleBar im Shell-Layout montieren**

In `src/app/(shell)/layout.tsx`: die Content-Spalte in `<ShellNavProvider>` hüllen (umfasst Header + children, damit ModuleBar und ModuleSidebar denselben Context sehen) und `ModuleBar` links neben dem Logo im Header platzieren. Der Header wird von `justify-between` auf eine Zwei-Gruppen-Struktur umgestellt.

```tsx
import { ShellNavProvider } from '@/components/ShellNav';
import { ModuleBar } from '@/components/ModuleBar';
// ...
  return (
    <div className="flex h-screen overflow-hidden bg-neutral-50 dark:bg-neutral-950">
      <AppRail apps={accessibleApps(access)} logo={logo} title={title} />
      <ShellNavProvider>
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="flex shrink-0 items-center justify-between border-b border-neutral-200 bg-white px-6 py-2.5 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center gap-2">
              <Link href="/" aria-label={title} className="flex items-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logo || '/bryx-logo.svg'} alt={title} className="h-7 w-auto" />
              </Link>
              <ModuleBar />
            </div>
            <UserMenu email={user?.email} canBrickPM={!!access.apps.brickpm} isAdmin={access.isAdmin} />
          </header>
          <div className="flex flex-1 flex-col overflow-hidden">{children}</div>
        </div>
      </ShellNavProvider>
      <BottomTabBar apps={accessibleApps(access)} />
    </div>
  );
```

- [ ] **Step 9: Volle Suite grün + Build**

Run: `npx vitest run`
Expected: PASS (nur die bekannten RLS-Fails aus `tests/db/rls.test.ts` bleiben — siehe Projekt-Memory, kein Regress).

Run: `npx next build`
Expected: Kompiliert ohne Typ-/Lint-Fehler.

- [ ] **Step 10: Commit**

```bash
git add src/components/ModuleBar.tsx src/components/ModuleSidebar.tsx \
  src/components/VerkaufSidebar.tsx src/components/VerfuegbarkeitSidebar.tsx \
  src/components/FinanzenSidebar.tsx src/components/KontakteSidebar.tsx \
  src/components/KatalogSidebar.tsx src/components/BpmSidebar.tsx \
  src/components/help/HilfeSidebar.tsx \
  "src/app/(shell)/layout.tsx" \
  "src/app/(shell)/verkauf/layout.tsx" "src/app/(shell)/verfuegbarkeit/layout.tsx" \
  "src/app/(shell)/finanzen/layout.tsx" "src/app/(shell)/katalog/layout.tsx" \
  "src/app/(shell)/kontakte/layout.tsx" "src/app/(shell)/brickpm/layout.tsx" \
  "src/app/(shell)/hilfe/layout.tsx" \
  tests/components/module-bar.test.tsx
git commit -m "feat(shell): Modulname-Trigger + Sidebar als Drawer/Sheet ab Tablet"
```

---

### Task 5: Touch-Targets, Launchpad-Padding, Tabellen-Sweep + Browser-Verifikation

Regel 5 abschließen (44px-Touch-Targets an Sidebar-Links), Launchpad-Scrollfläche um die Tab-Bar padden, sicherstellen dass keine rohe Tabelle Spalten versteckt, und alles im Browser auf dem VPS über die drei Breakpoints verifizieren.

**Files:**
- Modify: die 7 Sidebar-Komponenten (Link-Klasse: `min-h-11` + `flex items-center` auf `<lg`)
- Modify: `src/app/(shell)/page.tsx:32` (Launchpad-`<main>` Bottom-Padding)
- (Ggf.) Modify: Komponenten mit roher `<table>` ohne Scroll-Wrapper — nur falls der Sweep welche findet.

**Interfaces:** keine neuen.

- [ ] **Step 1: Sidebar-Links auf 44px Touch-Höhe**

In den 7 Sidebar-Komponenten die Listen-Link-Klasse um `min-h-11 md:min-h-0` und `flex items-center` ergänzen, damit Links `<md` mindestens 44px hoch sind, ohne die Desktop-Optik zu verändern. Beispiel `VerkaufSidebar.tsx` (aktuell `block rounded-md px-3 py-1.5 text-sm ...`):

```tsx
// vorher:
className={`block rounded-md px-3 py-1.5 text-sm ${active
// nachher:
className={`flex min-h-11 items-center rounded-md px-3 py-1.5 text-sm md:min-h-0 ${active
```

Dasselbe Muster (`block` → `flex min-h-11 items-center ... md:min-h-0`) auf die Link-/Item-Klassen der übrigen Sidebars anwenden. Zuerst prüfen, welche Klasse jede Sidebar für ihre Navigationslinks nutzt:

Run: `grep -n "rounded-md px-3 py-1.5\|block rounded" src/components/*Sidebar.tsx src/components/help/HilfeSidebar.tsx`

Für jeden Treffer `block` durch `flex min-h-11 items-center` ersetzen und `md:min-h-0` anhängen. Enthält eine Sidebar Untergruppen-Überschriften statt Links, diese unangetastet lassen.

- [ ] **Step 2: Launchpad-Scrollfläche padden**

In `src/app/(shell)/page.tsx` (Zeile 32) dem Launchpad-`<main>` Bottom-Padding geben:

```tsx
// vorher:
<main className="flex-1 overflow-y-auto">
// nachher:
<main className="flex-1 overflow-y-auto pb-20 md:pb-0">
```

- [ ] **Step 3: Rohe Tabellen ohne Scroll-Wrapper aufspüren**

Run: `grep -rn "<table" src/components src/app | grep -v "overflow-x"`

Erwartung: idealerweise leer (Tabellen laufen über `DataTable`, die bereits `overflow-x-auto` hat). Für jeden Treffer, dessen umschließendes Element kein `overflow-x-auto` hat: die Tabelle in `<div className="overflow-x-auto">…</div>` hüllen. Findet der Sweep nichts, ist dieser Step ein No-op (dokumentieren: „keine rohen Tabellen gefunden").

- [ ] **Step 4: Volle Suite grün**

Run: `npx vitest run`
Expected: PASS (bekannte RLS-Fails ausgenommen).

- [ ] **Step 5: Commit**

```bash
git add src/components/*Sidebar.tsx src/components/help/HilfeSidebar.tsx "src/app/(shell)/page.tsx"
git commit -m "feat(shell): 44px-Touch-Targets, Launchpad-Padding, Tabellen-Scroll"
```

- [ ] **Step 6: Auf den VPS deployen**

Gemäß Projektvorgabe läuft die App nur auf dem VPS. Branch pushen und dort deployen/bauen (bestehender Deploy-Weg des Projekts). Kein lokaler App-Start.

- [ ] **Step 7: Browser-Verifikation über alle Breakpoints**

Mit Claude in Chrome bzw. Chrome DevTools gegen die deployte VPS-URL, je Breakpoint (Fenstergrößen 1280 / 900 / 390 px):

- **≥lg (1280):** Rail + Sidebar + Content nebeneinander wie bisher; kein Modulname im Top-Bar; keine Tab-Bar.
- **md–lg (900):** Rail sichtbar; kein Sidebar inline; Modulname im Top-Bar sichtbar → Tap öffnet Drawer von links (neben der Rail, volle Panel-Breite); Link-Auswahl und Backdrop-Tap schließen; keine Tab-Bar.
- **<md (390):** Rail weg, Bottom-Tab-Bar mit 4 Apps + „Mehr"; aktive App amber; „Mehr" → Launchpad; Modulname im Top-Bar → Tap öffnet Fullscreen-Sheet von unten; Link/Backdrop schließt; letzte Inhaltszeile wird nicht von der Tab-Bar verdeckt; Sidebar-Links ≥44px; eine Tabelle (z. B. `/finanzen` offene Posten) scrollt horizontal statt Spalten zu verstecken.
- **Dark-Mode** auf `<md` einmal gegenprüfen (Drawer/Sheet/Tab-Bar in warmen `neutral`-Tönen, Akzent amber).

Gefundene Abweichungen (z. B. `top-14`-Offset passt nicht exakt zur Header-Höhe, `left-16` deckt Rail nicht sauber) inline nachziehen und erneut verifizieren.

- [ ] **Step 8: Abschluss-Commit (falls Feinjustierung nötig)**

```bash
git add -A
git commit -m "fix(shell): Offsets/Feinschliff responsive Shell nach Browser-Verifikation"
```

---

## Self-Review

**Spec coverage:**
- Desktop ≥1024px (Rail+Sidebar+Content) → Task 4 (`lg:`-inline) + Verifikation Task 5.
- Tablet 768–1023 (Rail bleibt, Sidebar→Drawer, Trigger Modulname) → Task 3 (Rail `md:flex`) + Task 4 (`md:`-Drawer, ModuleBar).
- Mobile <768 (Rail→Tab-Bar, Sidebar→Sheet) → Task 3 (BottomTabBar) + Task 4 (`<md`-Sheet).
- Regel 1 (max 5 Icons, 4+Mehr, amber, Launchpad) → Task 1 (`selectTabApps`) + Task 3.
- Regel 2 (nie schmaler, volle Breite Overlay/Sheet) → Task 4 (Chrome im Wrapper, `w-full` nav, `md:w-72`/fullscreen).
- Regel 3 (Long-Press Kontextbrücke) → bewusst außer Scope (Feature existiert nicht) — im Spec notiert.
- Regel 4 (Statuspuls immer sichtbar) → bewusst außer Scope (Feature existiert nicht) — im Spec notiert.
- Regel 5 (Tabellen h-scroll, 44px Targets) → Task 5.

**Placeholder scan:** Kein TBD/TODO; alle Code-Steps enthalten vollständigen Code; Step 3 (Task 5) ist bedingt (nur bei Treffern) und explizit als möglicher No-op dokumentiert.

**Type consistency:** `activeApp`/`selectTabApps` (Task 1) werden in Task 3 (`BottomTabBar`) und Task 4 (`ModuleBar`) mit denselben Signaturen konsumiert. `useShellNav` liefert `{ open, toggle, close }` (Task 2) — exakt so genutzt in `ModuleBar` (`toggle`) und `ModuleSidebar` (`open`, `close`). `ModuleSidebar`/`ModuleBar` Props stimmen mit den Layout-Aufrufen in Task 4 überein.
