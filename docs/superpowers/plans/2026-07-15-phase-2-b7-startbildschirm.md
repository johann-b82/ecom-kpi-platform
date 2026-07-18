# B7 — Startbildschirm (Launcher) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Erweitere den Startbildschirm `/` um eine „Überblick"-Sektion mit App-Access-gated Aufmerksamkeits-Kacheln (offene Angebote, Artikel unter Meldebestand, offene/überfällige Posten), die in die Modul-Screens verlinken.

**Architecture:** Reiner Launcher — kein neues Datenmodell, keine neue App. `page.tsx` aggregiert bedingt vorhandene Repository-Reads; eine reine Anzeige-Komponente `StartOverview` rendert die Kacheln; `Launchpad` bekommt einen Slot zwischen Begrüßung und App-Grid.

**Tech Stack:** Next.js App Router (Server Components), TypeScript, raw `pg`, Vitest (`fileParallelism:false`), Tailwind (warm `neutral` + `--accent` + `danger`).

## Global Constraints

- **Design-System (bindend):** Accent nur via `bg-accent`/`text-accent`/`hover:border-accent`; warme `neutral`-Skala (kein gray/slate/zinc/stone, kein reines Weiß/Schwarz außer `neutral-0`/`neutral-950`); `.anno` für UPPERCASE-Micro-Labels; `dark:`-Varianten Pflicht; **`text-danger` für Attention/überfällig** (kein Accent für Warnungen — B5/B6-Entscheid); keine Komponenten-Library (Tailwind-Strings wiederholen).
- **Reiner Launcher:** keine neuen Tabellen, keine neue App, kein neuer Help-Slug. Nur lesen + verlinken.
- **Access-Gating:** eine Kachel nur, wenn `access.apps[<app>]` gesetzt ist. Keine der drei Apps zugänglich → Überblick-Sektion nicht rendern.
- **Env/Test:** `DATABASE_URL` nur in `.env` → DB-Befehle mit `set -a; source .env; set +a` prefixen. `psql` fehlt (→ `node -e`/`tsx` + `pg`). Tests: `npx vitest run <file>` (Alias `@`→`src`). vitest typcheckt NICHT → jede Code-Task endet mit `npx tsc --noEmit`. Bekannt-rot, nicht blockierend: `tests/db/rls.test.ts` (Host-Caveat). Deploy nur bryx-test (`/opt/budp-dev/deploy.sh`), nie Produktion.

---

### Task 1: `countOpenQuotes()` — unbounded Zähler offener Angebote

**Files:**
- Modify: `src/verkauf/repository.ts` (append eine Funktion)
- Test: `tests/verkauf/repository.test.ts` (append ein Test)

**Interfaces:**
- Produces: `countOpenQuotes(): Promise<number>` — Anzahl `sales_orders` mit `status='angebot'` (zeitraum-unabhängig).

- [ ] **Step 1: Failing-Test an `tests/verkauf/repository.test.ts` anhängen**

Die Helfer `MUELLER`, `PL_HANDEL`, `variantId()`, `orderIds`, `createOrder`, `transitionOrderStatus` sind in der Datei bereits im Scope. `countOpenQuotes` zum Import aus `@/verkauf/repository` hinzufügen. Dann anhängen:
```ts
describe('countOpenQuotes', () => {
  it('zählt nur angebot-Belege, nicht überführte', async () => {
    const before = await countOpenQuotes();
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 1, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    expect(o.status).toBe('angebot');
    expect(await countOpenQuotes()).toBe(before + 1);
    await transitionOrderStatus(o.id, 'auftrag');
    expect(await countOpenQuotes()).toBe(before); // nicht mehr angebot
  });
});
```

- [ ] **Step 2: Rot verifizieren**

Run: `set -a; source .env; set +a; npx vitest run tests/verkauf/repository.test.ts`
Expected: FAIL — `countOpenQuotes` nicht exportiert.

- [ ] **Step 3: Funktion an `src/verkauf/repository.ts` anhängen**

```ts
export async function countOpenQuotes(): Promise<number> {
  const r = await pool.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM sales_orders WHERE status = 'angebot'`);
  return r.rows[0].n;
}
```

- [ ] **Step 4: Grün verifizieren**

Run: `set -a; source .env; set +a; npx vitest run tests/verkauf/repository.test.ts`
Expected: PASS (neuer Test + alle bestehenden).

- [ ] **Step 5: tsc & commit**

Run: `npx tsc --noEmit`
```bash
git add src/verkauf/repository.ts tests/verkauf/repository.test.ts
git commit -m "feat(verkauf): countOpenQuotes (unbounded Zähler offener Angebote für Startbildschirm)"
```

---

### Task 2: `StartOverview`-Kacheln + Startbildschirm-Aggregation

**Files:**
- Create: `src/components/StartOverview.tsx`
- Modify: `src/components/Launchpad.tsx` (optionaler `overview`-Slot)
- Modify: `src/app/(shell)/page.tsx` (bedingte Aggregation)

**Interfaces:**
- Consumes: `countOpenQuotes` (Task 1); `listReorderSuggestions` (`@/verfuegbarkeit/repository`), `listOpenItems` (`@/finanzen/repository`), `eur` (`@/finanzen/format`), `access.apps` (`@/lib/groups`).
- Produces: `StartOverview`, `OverviewSignals`.

- [ ] **Step 1: `src/components/StartOverview.tsx` anlegen**

Reine Anzeige (server-render-fähig, kein `'use client'`). „Offene Posten"-Kachel: Hauptwert neutral, nur die „davon … überfällig"-Zeile `danger`. „Unter Meldebestand": Wert `danger` bei > 0.
```tsx
import Link from 'next/link';
import { eur } from '@/finanzen/format';

export interface OverviewSignals {
  openQuotes?: number;
  belowReorder?: number;
  openItems?: number;
  overdue?: number;
}

export function StartOverview({ signals }: { signals: OverviewSignals }) {
  const tiles: { label: string; value: string; href: string; danger?: boolean; sub?: string }[] = [];
  if (signals.openQuotes !== undefined)
    tiles.push({ label: 'Offene Angebote', value: String(signals.openQuotes), href: '/verkauf/belege' });
  if (signals.belowReorder !== undefined)
    tiles.push({ label: 'Unter Meldebestand', value: String(signals.belowReorder),
      href: '/verfuegbarkeit/meldebestand', danger: signals.belowReorder > 0 });
  if (signals.openItems !== undefined)
    tiles.push({ label: 'Offene Posten', value: eur(signals.openItems), href: '/finanzen',
      sub: (signals.overdue ?? 0) > 0 ? `davon ${eur(signals.overdue!)} überfällig` : undefined });
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
            {t.sub && <p className="mt-1 text-xs text-danger">{t.sub}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: `Launchpad` um optionalen `overview`-Slot erweitern**

In `src/components/Launchpad.tsx` den Import und die Signatur erweitern und den Slot zwischen Begrüßung und „Apps"-Label rendern:
```tsx
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { AppDef } from '@/lib/apps';

export function Launchpad({ apps, greeting, overview }: { apps: AppDef[]; greeting?: string; overview?: ReactNode }) {
  return (
    <div className="mx-auto max-w-6xl p-6">
      {greeting && <h1 className="mb-1 text-3xl font-bold text-neutral-900 dark:text-neutral-100">{greeting}</h1>}
      {overview}
      <p className="anno mb-6 mt-6">Apps — tippen zum Öffnen</p>
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
(Nur `import type { ReactNode }` + `overview`-Prop + `{overview}` + `mt-6` am „Apps"-Label sind neu — das App-Grid bleibt identisch.)

- [ ] **Step 3: `src/app/(shell)/page.tsx` — bedingte Aggregation**

```tsx
import { createClient } from '@/lib/supabase/server';
import { getUserAccess, accessibleApps } from '@/lib/groups';
import { Launchpad } from '@/components/Launchpad';
import { StartOverview, type OverviewSignals } from '@/components/StartOverview';
import { countOpenQuotes } from '@/verkauf/repository';
import { listReorderSuggestions } from '@/verfuegbarkeit/repository';
import { listOpenItems } from '@/finanzen/repository';

export const dynamic = 'force-dynamic';

export default async function LaunchpadPage() {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };

  const signals: OverviewSignals = {};
  const tasks: Promise<void>[] = [];
  if (access.apps.verkauf) tasks.push(countOpenQuotes().then((n) => { signals.openQuotes = n; }));
  if (access.apps.verfuegbarkeit) tasks.push(listReorderSuggestions().then((r) => { signals.belowReorder = r.length; }));
  if (access.apps.finanzen) tasks.push(listOpenItems().then((items) => {
    signals.openItems = items.filter((i) => i.status !== 'bezahlt').reduce((s, i) => s + i.remaining, 0);
    signals.overdue = items.filter((i) => i.overdue).reduce((s, i) => s + i.remaining, 0);
  }));
  await Promise.all(tasks);

  const hasOverview = signals.openQuotes !== undefined || signals.belowReorder !== undefined || signals.openItems !== undefined;

  return (
    <main className="flex-1 overflow-y-auto">
      <Launchpad
        apps={accessibleApps(access)}
        greeting="Willkommen zurück."
        overview={hasOverview ? <StartOverview signals={signals} /> : undefined}
      />
    </main>
  );
}
```

- [ ] **Step 4: tsc + Vollsuite (keine Regression)**

Run: `npx tsc --noEmit`
Run: `set -a; source .env; set +a; npx vitest run` — nur die bekannten `tests/db/rls.test.ts`-Fails; nichts sonst neu rot.

- [ ] **Step 5: Commit**

```bash
git add src/components/StartOverview.tsx src/components/Launchpad.tsx src/app/\(shell\)/page.tsx
git commit -m "feat(startbildschirm): Überblick-Kacheln (offene Angebote/Meldebestand/offene Posten, access-gated)"
```

---

## Self-Review (während Authoring)

- **Spec-Abdeckung:** §3 Kacheln → Tasks 1+2 (Verkauf-Zähler, Verfügbarkeit `.length`, Finanzen-Σ). §4 Architektur (page.tsx bedingt, StartOverview reine Anzeige, Launchpad-Slot) → Task 2. §5 Design-Tokens (danger für überfällig/Meldebestand, `.anno`, dark:) → Task 2. §6 kein Help-Slug → kein Task. §7 Tests (countOpenQuotes) → Task 1; Aggregation browser-verifiziert.
- **Placeholder-Scan:** kein TBD/TODO; jeder Code-Schritt vollständig.
- **Typkonsistenz:** `OverviewSignals`-Felder identisch in `StartOverview` (Consumer) und `page.tsx` (Producer); `countOpenQuotes(): Promise<number>` matcht Aufruf; `listOpenItems()`/`listReorderSuggestions()` Rückgaben (`OpenItemRow[]` mit `status`/`overdue`/`remaining`, `ReorderSuggestion[]`) matchen die Aggregation.
- **Access-Gating:** dieselbe `access.apps`-Quelle wie `accessibleApps` fürs App-Grid; kein Zugriff → keine Kachel; keine der drei → keine Sektion.
