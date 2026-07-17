# Demo-Ads-Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein admin-gegateter Schalter in `/setup`, der Demo-`ad_spend` (Google/Meta/TikTok) an-/ausschaltet, damit die Ads-Kennzahlen im E-Commerce-Dashboard vor Live-API-Anbindung testbar sind.

**Architecture:** Idempotente `is_demo`-Spalte an `ad_spend` trennt Demo- von echten Daten. Zustand in `app_settings` (`demo_ads_enabled`). Ein Modul `src/lib/demo-ads.ts` schreibt/löscht Demo-Zeilen (via bestehendem `generateSeedData`), eine Server-Action in `/setup` gated auf `isAdmin`, eine UI-Sektion `DemoAdsForm`.

**Tech Stack:** Next.js (App Router, Server Components + Server Actions), TypeScript, `pg` Pool, vitest.

## Global Constraints

- **Deployment:** Nie lokal deployen/starten. Tests (`npx vitest`) laufen lokal. Deploy nur nach Freigabe.
- **Test-DB:** Lokale Dev-DB ist verschmutzt (Seed-Kollision) → DB-Tests gegen die saubere Sibling-DB `bryx_kosten_test`. Vor JEDEM DB-Befehl: `set -a; source .env; set +a`, dann `export DATABASE_URL=$(node -e 'const u=new URL(process.env.DATABASE_URL);u.pathname="/bryx_kosten_test";process.stdout.write(u.toString())')`. Schema-Änderung → dort `npm run migrate` nachziehen.
- **vitest typecheckt NICHT** → jede .ts/.tsx-Task endet mit `npx tsc --noEmit` (clean).
- **`git add` nur die gelisteten Pfade**, nie `git add -A`. `src/kpi/help.ts` hat eine unrelated pending-Änderung — NICHT stagen.
- **Migrationen** idempotent an `db/schema.sql`; `npm run migrate` idempotent.
- **`ad_spend`-PK ist `(date, platform)`.** Demo-Zeilen tragen `is_demo=true`, echte immer `is_demo=false` (Connectoren setzen die Spalte nicht). Ausschalten: `DELETE WHERE is_demo=true` (nie echte Daten). Die 3 Connectoren (`src/connectors/{meta,google,tiktok}/write.ts`) werden NICHT geändert.
- **Scope:** nur `ad_spend`. Kein GA4/`daily_metrics`, keine Connector-Änderung, kein `is_demo`-Filter in den Reads.
- **Design-System:** warme `neutral`-Palette (kein gray/slate/zinc/stone, KEIN Ampel-Grün/Rot), Akzent nur `bg-accent`/`text-accent`, `.anno` einziges Uppercase, `dark:`-Varianten Pflicht.
- **Admin-Muster** (verbatim aus `simulateConnectAction`): `getUser` → `getUserAccess(user.id)` → `if (!access.isAdmin) throw new Error('Nur für Administratoren.')`.

---

### Task 1: `is_demo`-Spalte + Settings-Helfer

**Files:**
- Modify: `db/schema.sql` (ans Ende anhängen)
- Modify: `src/lib/settings.ts` (Helfer ergänzen)
- Test: `tests/lib/settings-demo-ads.test.ts` (create)

**Interfaces:**
- Produces: Spalte `ad_spend.is_demo BOOLEAN NOT NULL DEFAULT false`; `getDemoAdsEnabled(): Promise<boolean>`; `setDemoAdsEnabled(enabled: boolean): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/settings-demo-ads.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { getDemoAdsEnabled, setDemoAdsEnabled } from '@/lib/settings';

afterAll(async () => {
  await pool.query(`DELETE FROM app_settings WHERE key = 'demo_ads_enabled'`);
  await pool.end();
});

describe('demo_ads_enabled setting', () => {
  it('default false, roundtrips true/false', async () => {
    await pool.query(`DELETE FROM app_settings WHERE key = 'demo_ads_enabled'`);
    expect(await getDemoAdsEnabled()).toBe(false);
    await setDemoAdsEnabled(true);
    expect(await getDemoAdsEnabled()).toBe(true);
    await setDemoAdsEnabled(false);
    expect(await getDemoAdsEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run (with the Test-DB env from Global Constraints exported):
`npx vitest run tests/lib/settings-demo-ads.test.ts`
Expected: FAIL — `getDemoAdsEnabled is not a function` / import error.

- [ ] **Step 3: Append schema column + apply migration**

Append to `db/schema.sql`:

```sql
-- Demo-Ads-Toggle (Phase 3): trennt Demo-ad_spend von echten Connector-Daten.
ALTER TABLE ad_spend ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;
```

Run: `npm run migrate` (with the Test-DB env exported).
Expected: „Schema applied. RLS policies applied." ohne Fehler.

- [ ] **Step 4: Add settings helpers**

Append to `src/lib/settings.ts`:

```ts
/** Ob Demo-Ads-Daten im Dashboard aktiv sind. Default false. */
export async function getDemoAdsEnabled(): Promise<boolean> {
  try {
    const res = await pool.query("SELECT value FROM app_settings WHERE key = 'demo_ads_enabled'");
    return res.rows[0]?.value === 'true';
  } catch {
    return false;
  }
}

export async function setDemoAdsEnabled(enabled: boolean): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings(key, value, updated_at) VALUES('demo_ads_enabled', $1, now())
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [enabled ? 'true' : 'false'],
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/lib/settings-demo-ads.test.ts`
Expected: PASS. Then `npx tsc --noEmit` → clean.

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql src/lib/settings.ts tests/lib/settings-demo-ads.test.ts
git commit -m "feat(setup): ad_spend.is_demo + demo_ads_enabled Setting"
```

---

### Task 2: `demo-ads.ts` — enable/disable

**Files:**
- Create: `src/lib/demo-ads.ts`
- Test: `tests/lib/demo-ads.test.ts` (create)

**Interfaces:**
- Consumes: `getDemoAdsEnabled`/`setDemoAdsEnabled` (Task 1); `generateSeedData(range)` from `@/connectors/seed/generator` (returns `{ adSpend: {date,platform,spend,impressions,clicks,conversions,convValue}[], ... }`); `addDays(date, days)` from `@/lib/dates`; `pool` from `@/lib/db`.
- Produces: `enableDemoAds(endDate?: string): Promise<void>`; `disableDemoAds(): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/demo-ads.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { enableDemoAds, disableDemoAds } from '@/lib/demo-ads';
import { getDemoAdsEnabled } from '@/lib/settings';

// Fenster WEIT in der Vergangenheit: darf das von `npm run seed` befüllte
// Aktuell-180-Tage-ad_spend-Fenster (is_demo=false) nicht überlappen, sonst
// PK-Konflikt (date,platform). So bleibt der Test CI-sicher + nicht-destruktiv.
const END = '2020-06-01';

afterAll(async () => {
  await pool.query(`DELETE FROM ad_spend WHERE is_demo = true`);
  await pool.query(`DELETE FROM ad_spend WHERE platform = 'google_ads' AND date = '2024-01-01'`);
  await pool.query(`DELETE FROM app_settings WHERE key = 'demo_ads_enabled'`);
  await pool.end();
});

describe('demo ads', () => {
  it('enableDemoAds schreibt Demo-Zeilen für alle 3 Plattformen und setzt das Flag', async () => {
    await enableDemoAds(END);
    const r = await pool.query<{ platform: string; n: number }>(
      `SELECT platform, COUNT(*)::int AS n FROM ad_spend WHERE is_demo = true GROUP BY platform`);
    const by = new Map(r.rows.map((x) => [x.platform, x.n]));
    expect(by.get('google_ads')).toBe(180);
    expect(by.get('meta_ads')).toBe(180);
    expect(by.get('tiktok_ads')).toBe(180);
    expect(await getDemoAdsEnabled()).toBe(true);
  });

  it('enableDemoAds ist idempotent (kein PK-Konflikt beim erneuten Einschalten)', async () => {
    await enableDemoAds(END);
    const r = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ad_spend WHERE is_demo = true`);
    expect(r.rows[0].n).toBe(540);
  });

  it('disableDemoAds entfernt NUR Demo-Zeilen und lässt echte Daten stehen', async () => {
    // echte Zeile außerhalb des Demo-Fensters (kein PK-Konflikt)
    await pool.query(
      `INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value, is_demo)
       VALUES ('2024-01-01','google_ads',10,100,2,1,50,false)`);
    await disableDemoAds();
    const demo = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ad_spend WHERE is_demo = true`);
    const real = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ad_spend WHERE date = '2024-01-01' AND platform = 'google_ads'`);
    expect(demo.rows[0].n).toBe(0);
    expect(real.rows[0].n).toBe(1);
    expect(await getDemoAdsEnabled()).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/demo-ads.test.ts`
Expected: FAIL — `Cannot find module '@/lib/demo-ads'`.

- [ ] **Step 3: Implement demo-ads.ts**

Create `src/lib/demo-ads.ts`:

```ts
import { pool } from './db';
import { addDays } from './dates';
import { generateSeedData } from '@/connectors/seed/generator';
import { setDemoAdsEnabled } from './settings';

const PLATFORMS = ['google_ads', 'meta_ads', 'tiktok_ads'];
const CHUNK = 1000;

// Schaltet Demo-ad_spend ein: 180 Tage plausible Werte je Plattform mit is_demo=true.
// Idempotent — vorhandene Demo-Zeilen werden zuerst entfernt (kein PK-Konflikt).
export async function enableDemoAds(endDate: string = new Date().toISOString().slice(0, 10)): Promise<void> {
  const { adSpend } = generateSeedData({ start: addDays(endDate, -179), end: endDate });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of PLATFORMS) {
      await client.query(`DELETE FROM ad_spend WHERE platform = $1 AND is_demo = true`, [p]);
    }
    for (let i = 0; i < adSpend.length; i += CHUNK) {
      const part = adSpend.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const tuples = part.map((a, j) => {
        const b = j * 7;
        values.push(a.date, a.platform, a.spend, a.impressions, a.clicks, a.conversions, a.convValue);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},true)`;
      });
      await client.query(
        `INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value, is_demo)
         VALUES ${tuples.join(',')}`,
        values,
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await setDemoAdsEnabled(true);
}

// Schaltet Demo-ad_spend aus: entfernt ausschließlich Demo-Zeilen. Echte Daten bleiben.
export async function disableDemoAds(): Promise<void> {
  await pool.query(`DELETE FROM ad_spend WHERE is_demo = true`);
  await setDemoAdsEnabled(false);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/lib/demo-ads.test.ts`
Expected: PASS (3 Tests). Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/demo-ads.ts tests/lib/demo-ads.test.ts
git commit -m "feat(setup): enableDemoAds/disableDemoAds"
```

---

### Task 3: Server-Action `toggleDemoAdsAction`

**Files:**
- Modify: `src/app/setup/actions.ts`
- Test: `tests/app/demo-ads-action.test.ts` (create)

**Interfaces:**
- Consumes: `enableDemoAds`/`disableDemoAds` (Task 2); Admin-Muster aus der bestehenden `actions.ts`.
- Produces: `toggleDemoAdsAction(enabled: boolean): Promise<void>`.

- [ ] **Step 1: Write the failing test**

Create `tests/app/demo-ads-action.test.ts` (mocked, kein DB — Muster aus `tests/app/connection-stub.test.ts`):

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) } }),
}));
vi.mock('@/lib/groups', () => ({ getUserAccess: vi.fn() }));
vi.mock('@/lib/demo-ads', () => ({ enableDemoAds: vi.fn(), disableDemoAds: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { toggleDemoAdsAction } from '@/app/setup/actions';
import { getUserAccess } from '@/lib/groups';
import { enableDemoAds, disableDemoAds } from '@/lib/demo-ads';
import { revalidatePath } from 'next/cache';

beforeEach(() => { vi.clearAllMocks(); });

describe('toggleDemoAdsAction (admin)', () => {
  it('Admin: enabled=true ruft enableDemoAds + revalidiert', async () => {
    vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: true });
    await toggleDemoAdsAction(true);
    expect(enableDemoAds).toHaveBeenCalled();
    expect(disableDemoAds).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/setup');
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf/dashboard');
  });
  it('Admin: enabled=false ruft disableDemoAds', async () => {
    vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: true });
    await toggleDemoAdsAction(false);
    expect(disableDemoAds).toHaveBeenCalled();
    expect(enableDemoAds).not.toHaveBeenCalled();
  });
  it('Nicht-Admin: wirft und ruft nichts', async () => {
    vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: false });
    await expect(toggleDemoAdsAction(true)).rejects.toThrow(/Administrator/i);
    expect(enableDemoAds).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/demo-ads-action.test.ts`
Expected: FAIL — `toggleDemoAdsAction` nicht exportiert.

- [ ] **Step 3: Add the action**

In `src/app/setup/actions.ts` den Import ergänzen und die Action anhängen:

```ts
import { enableDemoAds, disableDemoAds } from '@/lib/demo-ads';

export async function toggleDemoAdsAction(enabled: boolean): Promise<void> {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
  if (!access.isAdmin) throw new Error('Nur für Administratoren.');
  if (enabled) await enableDemoAds(); else await disableDemoAds();
  revalidatePath('/setup');
  revalidatePath('/verkauf/dashboard');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/demo-ads-action.test.ts`
Expected: PASS (3 Tests). Then `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add src/app/setup/actions.ts tests/app/demo-ads-action.test.ts
git commit -m "feat(setup): toggleDemoAdsAction (admin-gated)"
```

---

### Task 4: `DemoAdsForm` UI + Setup-Verdrahtung

**Files:**
- Create: `src/components/DemoAdsForm.tsx`
- Modify: `src/app/setup/page.tsx`
- Test: `tests/components/demo-ads-form.test.tsx` (create)

**Interfaces:**
- Consumes: `toggleDemoAdsAction` (Task 3); `getDemoAdsEnabled` (Task 1).
- Produces: `DemoAdsForm({ enabled }: { enabled: boolean })`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/demo-ads-form.test.tsx` (jsdom):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DemoAdsForm } from '@/components/DemoAdsForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/setup/actions', () => ({ toggleDemoAdsAction: vi.fn() }));

describe('DemoAdsForm', () => {
  it('zeigt „aktiv" + Ausschalt-Button, wenn enabled', () => {
    render(<DemoAdsForm enabled={true} />);
    expect(screen.getByText(/aktiv/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /ausschalten/i })).toBeTruthy();
  });
  it('zeigt Einschalt-Button, wenn nicht enabled', () => {
    render(<DemoAdsForm enabled={false} />);
    expect(screen.getByRole('button', { name: /einschalten/i })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/demo-ads-form.test.tsx`
Expected: FAIL — `Cannot find module '@/components/DemoAdsForm'`.

- [ ] **Step 3: Implement DemoAdsForm**

Create `src/components/DemoAdsForm.tsx`:

```tsx
'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toggleDemoAdsAction } from '@/app/setup/actions';

export function DemoAdsForm({ enabled }: { enabled: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const toggle = () => start(async () => {
    await toggleDemoAdsAction(!enabled);
    router.refresh();
  });
  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Demo-Ads-Daten</h2>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Füllt <span className="font-mono">ad_spend</span> mit Demo-Werten für Google/Meta/TikTok (180 Tage), damit die
        Ads-Kennzahlen im E-Commerce-Dashboard vor der Live-Anbindung testbar sind. Kein echter API-Aufruf.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <span className={`anno rounded px-2 py-0.5 text-xs ${enabled
          ? 'bg-accent/15 text-accent' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'}`}>
          {enabled ? 'aktiv' : 'inaktiv'}
        </span>
        <button
          type="button"
          onClick={toggle}
          disabled={pending}
          className="rounded-md border border-accent px-3 py-1.5 text-sm font-medium text-accent transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
        >
          {pending ? '…' : enabled ? 'Demo-Daten ausschalten' : 'Demo-Daten einschalten'}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/components/demo-ads-form.test.tsx`
Expected: PASS (2 Tests).

- [ ] **Step 5: Wire into the setup page**

In `src/app/setup/page.tsx`:
- Import ergänzen: `import { getBranding, getSyncInterval, getDemoAdsEnabled } from '@/lib/settings';` (bestehenden settings-Import erweitern) und `import { DemoAdsForm } from '@/components/DemoAdsForm';`.
- Nach `const connections = await listAllConnections();` (Zeile 33) laden:
  ```ts
  const demoAds = await getDemoAdsEnabled();
  ```
- Im JSX nach `<SyncForm interval={syncInterval} state={syncState} />` (Zeile 60) einfügen:
  ```tsx
  <DemoAdsForm enabled={demoAds} />
  ```

- [ ] **Step 6: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: clean (prüft die Page-Verdrahtung).

- [ ] **Step 7: Commit**

```bash
git add src/components/DemoAdsForm.tsx "src/app/setup/page.tsx" tests/components/demo-ads-form.test.tsx
git commit -m "feat(setup): DemoAdsForm-Sektion + Verdrahtung"
```

---

### Task 5: Doku + Gesamtverifikation

**Files:**
- Modify: `src/lib/help/content.ts`
- Test: `tests/lib/help-content.test.ts` (muss grün bleiben)

**Interfaces:**
- Consumes: bestehende `DocPage`/`DocSection`/`DocBlock`-Formen in `content.ts`.

- [ ] **Step 1: Add a help note**

In `src/lib/help/content.ts` die bestehende Admin-Hilfeseite mit `slug: 'verbindungen'` finden und eine `DocSection` in deren `sections`-Array einfügen (Feldnamen an die reale `DocBlock`-Union angleichen):

```ts
{
  heading: 'Demo-Ads-Daten',
  blocks: [
    { type: 'p', text: 'Unter Einstellungen (/setup) können Administratoren Demo-Ads-Daten für Google/Meta/TikTok an- und ausschalten. Damit lassen sich die Ads-Kennzahlen im E-Commerce-Dashboard (Marketing-Effizienz, MER, ROAS, CPM) testen, bevor die echten Werbekonten verbunden sind.' },
    { type: 'note', text: 'Kein echter API-Aufruf. Ausschalten entfernt nur die Demo-Zeilen; echte Connector-Daten bleiben unberührt.' },
  ],
},
```

- [ ] **Step 2: Run the registry test**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (Slugs/Gruppen unverändert, jede Section ≥1 Block).

- [ ] **Step 3: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(hilfe): Demo-Ads-Daten in der Verbindungen-Adminhilfe"
```

- [ ] **Step 4: Full verification**

Run (mit Test-DB-env exportiert, schema dort schon migriert):
`npx vitest run` — alle grün außer ggf. bekannter Host-Caveats.
`npx tsc --noEmit` — clean. `npm run build` — erfolgreich.

- [ ] **Step 5: Deploy-Checkpoint (nach Freigabe)**

Deploy auf bryx-test via `/opt/budp-dev/deploy.sh` (migrate zieht `is_demo` nach). Danach im Browser: `/setup` → „Demo-Daten einschalten" → `/verkauf/dashboard` prüfen (Marketing-Effizienz/MER/ROAS jetzt mit Werten), dann wieder ausschalten → zurück auf N/A.

---

## Self-Review

**Spec-Coverage:**
- `is_demo`-Spalte → Task 1 ✓
- `demo_ads_enabled` Settings-Helfer → Task 1 ✓
- `enableDemoAds`/`disableDemoAds` (generateSeedData, 180 Tage, is_demo=true, DELETE nur is_demo=true) → Task 2 ✓
- Admin-Server-Action → Task 3 ✓
- `DemoAdsForm` + /setup-Verdrahtung → Task 4 ✓
- Doku → Task 5 ✓
- Kein Connector-Eingriff, nur ad_spend → über alle Tasks eingehalten ✓

**Angleich-Punkt beim Umsetzen (markiert, kein Placeholder):** DocBlock-Feldnamen (`p`/`note`) und der genaue `slug` der Verbindungen-Adminseite (Task 5) an die reale `content.ts`-Struktur angleichen.

**Typ-Konsistenz:** `enableDemoAds(endDate?)`, `disableDemoAds()`, `getDemoAdsEnabled()`, `setDemoAdsEnabled(bool)`, `toggleDemoAdsAction(bool)`, `DemoAdsForm({enabled})` durchgängig konsistent über Tasks 1–4.
