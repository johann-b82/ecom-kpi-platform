# B8 — Zentrale Verbindungen / API-Verwaltung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Alle App-Integrationsverbindungen (`integration_connections`) zentral im Admin-Bereich `/setup` pflegen; die verstreuten Modul-Untermenüs (Kontakte/Katalog) dorthin konsolidieren; Demo-Connectoren für Verkauf/Verfügbarkeit/Finanzen seeden; Statuspille auf warmes Token angleichen.

**Architecture:** Neue `listAllConnections()` liest alle Verbindungen; eine `'use client'`-Sektion `ConnectionsAdmin` (nach App gruppiert) wird in die bestehende, admin-gated `/setup`-Seite gehängt und ruft eine zentrale, `isAdmin`-gated Server-Action. Die per-Modul-Seiten/Sidebar-Einträge/Actions werden entfernt.

**Tech Stack:** Next.js App Router (Server Components + Server Actions), TypeScript, raw `pg`, Vitest (`fileParallelism:false`), Tailwind (warm `neutral` + `--accent`).

## Global Constraints

- **Design-System (bindend):** Accent nur via Token; warme `neutral`-Skala (kein gray/slate/zinc/stone); `.anno` für UPPERCASE-Micro-Labels; `dark:` Pflicht. Statuspille: `verbunden` → `bg-accent/15 text-accent`, `nicht verbunden` → `bg-neutral-100 text-neutral-500 dark:bg-neutral-800` (kein kaltes Grün).
- **Zentral & admin-only:** Verbindungsverwaltung lebt ausschließlich unter `/setup` (bereits `isAdmin`-gated). Die zentrale Action gated auf **`isAdmin`** (nicht `requireAppAccess`).
- **Abgrenzung:** Die bestehende `/setup`-Sektion „Verbindungen" (`CredentialsForm`) ist **Connector-Zugangsdaten/Secrets** — ein anderes Konzept. Die neue Sektion heißt **„App-Verbindungen"** und bleibt davon getrennt (kein Merge der beiden Systeme).
- **Status-Vokabular:** Repo-Wording (`nicht verbunden` / `verbunden (Demo)`) bleibt maßgeblich; Fachspec-Begriffe nicht übernehmen.
- **Env/Test:** `DATABASE_URL` nur in `.env` → DB-Befehle mit `set -a; source .env; set +a`. `psql` fehlt (→ `node -e`/`tsx` + `pg`). Tests: `npx vitest run <file>`. vitest typcheckt NICHT → jede Code-Task endet mit `npx tsc --noEmit`. Bekannt-rot: `tests/db/rls.test.ts` (Host-Caveat). Deploy nur bryx-test, nie Produktion.

---

### Task 1: `listAllConnections()` (alle Apps)

**Files:**
- Modify: `src/lib/integrations.ts` (append)
- Test: `tests/lib/integrations.test.ts` (neu)

**Interfaces:**
- Produces: `listAllConnections(): Promise<Connection[]>` — alle `integration_connections`, sortiert `app, label`.

- [ ] **Step 1: Failing-Test `tests/lib/integrations.test.ts` anlegen**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { listAllConnections } from '@/lib/integrations';

beforeAll(async () => { await seedKontakte(); await seedKatalog(); });
afterAll(async () => { await pool.end(); });

describe('listAllConnections', () => {
  it('liefert Verbindungen mehrerer Apps, sortiert nach app,label', async () => {
    const all = await listAllConnections();
    const apps = new Set(all.map((c) => c.app));
    expect(apps.has('kontakte')).toBe(true);
    expect(apps.has('katalog')).toBe(true);
    const sorted = [...all].sort((a, b) => a.app.localeCompare(b.app) || a.label.localeCompare(b.label));
    expect(all.map((c) => c.id)).toEqual(sorted.map((c) => c.id));
  });
});
```

- [ ] **Step 2: Rot verifizieren**

Run: `set -a; source .env; set +a; npx vitest run tests/lib/integrations.test.ts`
Expected: FAIL — `listAllConnections` nicht exportiert.

- [ ] **Step 3: Funktion an `src/lib/integrations.ts` anhängen**

```ts
export async function listAllConnections(): Promise<Connection[]> {
  const r = await pool.query(
    `SELECT id, app, provider, label, status, last_synced_at::text AS last_synced_at
       FROM integration_connections ORDER BY app, label`);
  return r.rows.map((x) => ({
    id: x.id, app: x.app, provider: x.provider, label: x.label,
    status: x.status, lastSyncedAt: x.last_synced_at,
  }));
}
```

- [ ] **Step 4: Grün verifizieren**

Run: `set -a; source .env; set +a; npx vitest run tests/lib/integrations.test.ts`
Expected: PASS.

- [ ] **Step 5: tsc & commit**

Run: `npx tsc --noEmit`
```bash
git add src/lib/integrations.ts tests/lib/integrations.test.ts
git commit -m "feat(integrations): listAllConnections (alle Apps, sortiert)"
```

---

### Task 2: Zentrale Admin-Action + connection-stub-Test umschreiben

**Files:**
- Create: `src/app/setup/actions.ts`
- Modify: `tests/app/connection-stub.test.ts` (umschreiben auf die zentrale Action)

**Interfaces:**
- Consumes: `simulateConnect` (`@/lib/integrations`), `getUserAccess` (`@/lib/groups`), `createClient` (`@/lib/supabase/server`).
- Produces: `simulateConnectAction(id: string): Promise<void>` — `isAdmin`-gated, revalidiert `/setup`.

- [ ] **Step 1: Test `tests/app/connection-stub.test.ts` auf die zentrale Action umschreiben**

Ersetze den kompletten Dateiinhalt:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) } }),
}));
vi.mock('@/lib/groups', () => ({ getUserAccess: vi.fn() }));
vi.mock('@/lib/integrations', () => ({ simulateConnect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { simulateConnectAction } from '@/app/setup/actions';
import { getUserAccess } from '@/lib/groups';
import { simulateConnect } from '@/lib/integrations';
import { revalidatePath } from 'next/cache';

beforeEach(() => { vi.clearAllMocks(); });

describe('setup simulateConnectAction (admin)', () => {
  it('verbindet + revalidiert /setup für Admin', async () => {
    vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: true });
    await simulateConnectAction('x1');
    expect(simulateConnect).toHaveBeenCalledWith('x1');
    expect(revalidatePath).toHaveBeenCalledWith('/setup');
  });
  it('wirft für Nicht-Admin und verbindet nicht', async () => {
    vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: false });
    await expect(simulateConnectAction('x1')).rejects.toThrow(/Administrator/i);
    expect(simulateConnect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Rot verifizieren**

Run: `npx vitest run tests/app/connection-stub.test.ts`
Expected: FAIL — `@/app/setup/actions` existiert nicht.

- [ ] **Step 3: `src/app/setup/actions.ts` anlegen**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/groups';
import { simulateConnect } from '@/lib/integrations';

export async function simulateConnectAction(id: string): Promise<void> {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
  if (!access.isAdmin) throw new Error('Nur für Administratoren.');
  await simulateConnect(id);
  revalidatePath('/setup');
}
```

- [ ] **Step 4: Grün verifizieren**

Run: `npx vitest run tests/app/connection-stub.test.ts`
Expected: PASS (beide Fälle).

- [ ] **Step 5: tsc & commit**

Run: `npx tsc --noEmit`
```bash
git add src/app/setup/actions.ts tests/app/connection-stub.test.ts
git commit -m "feat(setup): zentrale simulateConnectAction (isAdmin-gated) + Test"
```

---

### Task 3: `ConnectionsAdmin`-Sektion + warme Statuspille + `/setup`-Einbindung

**Files:**
- Create: `src/components/ConnectionsAdmin.tsx`
- Modify: `src/components/ConnectionStubs.tsx` (Statuspille auf warmes Token)
- Modify: `src/app/setup/page.tsx` (Sektion einhängen)

**Interfaces:**
- Consumes: `listAllConnections` (Task 1), `simulateConnectAction` (Task 2), `Connection` (`@/lib/integrations`), `APPS` (`@/lib/apps`), `ConnectionStubs`.

- [ ] **Step 1: Statuspille in `src/components/ConnectionStubs.tsx` auf warmes Token**

Ersetze die Status-`<span>`-Klassen (kaltes Grün → Accent/Neutral):
```tsx
              <span className={`rounded-full px-2 py-0.5 text-xs ${connected
                ? 'bg-accent/15 text-accent'
                : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'}`}>{c.status}</span>
```
(Nur diese beiden Klassen-Zweige ändern; Rest der Komponente unverändert.)

- [ ] **Step 2: `src/components/ConnectionsAdmin.tsx` anlegen**

```tsx
'use client';
import type { Connection } from '@/lib/integrations';
import { APPS } from '@/lib/apps';
import { ConnectionStubs } from '@/components/ConnectionStubs';
import { simulateConnectAction } from '@/app/setup/actions';

export function ConnectionsAdmin({ connections }: { connections: Connection[] }) {
  const byApp = new Map<string, Connection[]>();
  for (const c of connections) {
    const arr = byApp.get(c.app);
    if (arr) arr.push(c); else byApp.set(c.app, [c]);
  }
  const label = (app: string) => APPS.find((a) => a.key === app)?.label ?? app;
  const apps = [...byApp.keys()].sort((a, b) => label(a).localeCompare(label(b)));

  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">App-Verbindungen</h2>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Demo-Verbindungen je App an einer zentralen Stelle. „Verbinden (Demo)" setzt den Status ohne echten API-Aufruf.
      </p>
      <div className="space-y-6">
        {apps.map((app) => (
          <div key={app}>
            <p className="anno mb-2 text-neutral-500">{label(app)}</p>
            <ConnectionStubs items={byApp.get(app)!} onConnect={simulateConnectAction} />
          </div>
        ))}
        {connections.length === 0 && <p className="text-sm text-neutral-500">Keine Verbindungen.</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `src/app/setup/page.tsx` — Sektion laden & rendern**

Import ergänzen (oben bei den anderen Imports):
```ts
import { listAllConnections } from '@/lib/integrations';
import { ConnectionsAdmin } from '@/components/ConnectionsAdmin';
```
Vor dem `return` laden (bei den anderen `await`-Ladungen):
```ts
  const connections = await listAllConnections();
```
Im JSX die neue Sektion **nach** dem `CredentialsForm`-`<div>` (der bestehenden „Verbindungen"-Sektion) und **vor** `<SyncForm …>` einfügen:
```tsx
        <ConnectionsAdmin connections={connections} />
```

- [ ] **Step 4: tsc & Vollsuite**

Run: `npx tsc --noEmit`
Run: `set -a; source .env; set +a; npx vitest run` — nur bekannte `tests/db/rls.test.ts`-Fails.

- [ ] **Step 5: Commit**

```bash
git add src/components/ConnectionsAdmin.tsx src/components/ConnectionStubs.tsx src/app/setup/page.tsx
git commit -m "feat(setup): zentrale App-Verbindungen-Sektion + warme Statuspille"
```

---

### Task 4: Konsolidierung — Modul-Untermenüs entfernen

**Files:**
- Delete: `src/app/(shell)/kontakte/einstellungen/verbindungen/page.tsx` (+ leeres `einstellungen/`)
- Delete: `src/app/(shell)/katalog/einstellungen/verbindungen/page.tsx` (+ leeres `einstellungen/`)
- Modify: `src/app/(shell)/kontakte/actions.ts` (`simulateConnectAction` + verwaisten `simulateConnect`-Import entfernen)
- Modify: `src/app/(shell)/katalog/actions.ts` (dito)
- Modify: `src/components/KontakteSidebar.tsx` (Verbindungen-Eintrag entfernen)
- Modify: `src/components/KatalogSidebar.tsx` (Verbindungen-Eintrag entfernen)

**Interfaces:**
- Removes: `@/app/(shell)/kontakte/actions#simulateConnectAction`, `@/app/(shell)/katalog/actions#simulateConnectAction` und die Routen `/{kontakte,katalog}/einstellungen/verbindungen`.

- [ ] **Step 1: Seiten + leere Verzeichnisse löschen**

```bash
git rm src/app/\(shell\)/kontakte/einstellungen/verbindungen/page.tsx
git rm src/app/\(shell\)/katalog/einstellungen/verbindungen/page.tsx
rmdir src/app/\(shell\)/kontakte/einstellungen/verbindungen src/app/\(shell\)/kontakte/einstellungen 2>/dev/null || true
rmdir src/app/\(shell\)/katalog/einstellungen/verbindungen src/app/\(shell\)/katalog/einstellungen 2>/dev/null || true
```

- [ ] **Step 2: `simulateConnectAction` + verwaisten Import aus `src/app/(shell)/kontakte/actions.ts` entfernen**

Entferne diese Funktion:
```ts
export async function simulateConnectAction(id: string): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await simulateConnect(id);
  revalidatePath('/kontakte/einstellungen/verbindungen');
}
```
und die dadurch verwaiste Import-Zeile:
```ts
import { simulateConnect } from '@/lib/integrations';
```
(`requireAppAccess`/`revalidatePath` bleiben — von anderen Actions genutzt.)

- [ ] **Step 3: dasselbe in `src/app/(shell)/katalog/actions.ts`**

Entferne die `simulateConnectAction`-Funktion (gated auf `katalog`, revalidiert `/katalog/einstellungen/verbindungen`) und die verwaiste Zeile `import { simulateConnect } from '@/lib/integrations';`.

- [ ] **Step 4: Sidebar-Einträge entfernen**

In `src/components/KontakteSidebar.tsx` den `ITEMS`-Eintrag `{ slug: 'einstellungen/verbindungen', label: 'Verbindungen' }` entfernen (nur `{ slug: '', label: 'Liste' }` bleibt).
In `src/components/KatalogSidebar.tsx` denselben `{ slug: 'einstellungen/verbindungen', label: 'Verbindungen' }`-Eintrag entfernen.

- [ ] **Step 5: tsc & Vollsuite (keine toten Referenzen)**

Run: `npx tsc --noEmit` (Expected: clean — keine verbleibenden Importe von den entfernten Actions/Seiten.)
Run: `set -a; source .env; set +a; npx vitest run` — nur bekannte `tests/db/rls.test.ts`-Fails. (Der umgeschriebene `connection-stub`-Test in Task 2 referenziert bereits die zentrale Action, nicht die entfernte.)

- [ ] **Step 6: Commit**

```bash
git add -A src/app/\(shell\)/kontakte src/app/\(shell\)/katalog src/components/KontakteSidebar.tsx src/components/KatalogSidebar.tsx
git commit -m "refactor(verbindungen): Modul-Untermenüs entfernt (zentral in /setup konsolidiert)"
```

---

### Task 5: Seed — Demo-Connectoren Verkauf/Verfügbarkeit/Finanzen

**Files:**
- Create: `src/lib/verbindungen-seed.ts`
- Create: `scripts/seed-verbindungen.ts`
- Modify: `package.json` (npm-Script)

**Interfaces:**
- Produces: `seedVerbindungen(): Promise<void>`; npm-Script `seed-verbindungen`.

- [ ] **Step 1: `src/lib/verbindungen-seed.ts` anlegen**

```ts
// Demo-Connectoren (Stubs) für die neuen Module. Kontakte/Katalog seeden ihre
// eigenen Verbindungen weiterhin selbst. Stabile UUIDs 44444444-…
export interface SeedConnection {
  id: string; app: string; provider: string; label: string; status: string;
}

export const CONNECTION_SEED: SeedConnection[] = [
  { id: '44444444-0000-4000-8000-000000000001', app: 'verkauf', provider: 'shopware', label: 'Shopware', status: 'verbunden (Demo)' },
  { id: '44444444-0000-4000-8000-000000000002', app: 'verkauf', provider: 'amazon', label: 'Amazon Marketplace', status: 'nicht verbunden' },
  { id: '44444444-0000-4000-8000-000000000003', app: 'verfuegbarkeit', provider: 'dhl', label: 'DHL Versand', status: 'nicht verbunden' },
  { id: '44444444-0000-4000-8000-000000000004', app: 'verfuegbarkeit', provider: 'edi', label: 'Lieferanten-EDI', status: 'nicht verbunden' },
  { id: '44444444-0000-4000-8000-000000000005', app: 'finanzen', provider: 'datev', label: 'DATEV', status: 'verbunden (Demo)' },
  { id: '44444444-0000-4000-8000-000000000006', app: 'finanzen', provider: 'fints', label: 'Bank (FinTS)', status: 'nicht verbunden' },
];
```

- [ ] **Step 2: `scripts/seed-verbindungen.ts` anlegen**

```ts
import { pool } from '../src/lib/db';
import { CONNECTION_SEED } from '../src/lib/verbindungen-seed';

export async function seedVerbindungen(): Promise<void> {
  for (const c of CONNECTION_SEED) {
    await pool.query(
      `INSERT INTO integration_connections (id, app, provider, label, status)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET app=excluded.app, provider=excluded.provider,
         label=excluded.label, status=excluded.status`,
      [c.id, c.app, c.provider, c.label, c.status]);
  }
  console.log('Verbindungen seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-verbindungen.ts')) {
  seedVerbindungen().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 3: npm-Script in `package.json` registrieren**

Im `scripts`-Block nach `"seed-finanzen": …` einfügen:
```json
    "seed-verbindungen": "tsx scripts/seed-verbindungen.ts",
```

- [ ] **Step 4: Seed zweimal laufen lassen (idempotent)**

Run: `set -a; source .env; set +a; npx tsx scripts/seed-verbindungen.ts && npx tsx scripts/seed-verbindungen.ts`
Expected: `Verbindungen seed applied.` zweimal, keine Duplikate/FK-Fehler. Danach zählt `integration_connections` mit `id LIKE '44444444-%'` genau 6 Zeilen (via `node -e`/`tsx` prüfbar).

- [ ] **Step 5: tsc & commit**

Run: `npx tsc --noEmit`
```bash
git add src/lib/verbindungen-seed.ts scripts/seed-verbindungen.ts package.json
git commit -m "feat(verbindungen): Seed Demo-Connectoren (Verkauf/Verfügbarkeit/Finanzen)"
```

---

### Task 6: Hilfe aktualisieren + Vollsuite

**Files:**
- Modify: `src/lib/help/content.ts` (`verbindungen`-Admin-Seite, „Bedienung"-Sektion)

- [ ] **Step 1: „Bedienung"-Liste der `verbindungen`-Seite aktualisieren**

Ersetze in der `slug: 'verbindungen'`-Seite die `Bedienung`-`list`-`items`:
```ts
          { type: 'list', items: [
            'App-Verbindungen (integration_connections): zentral in Einstellungen (/setup) › App-Verbindungen — nur für Administratoren, alle Apps an einer Stelle. „Verbinden (Demo)" setzt den Status (Stub, kein echter API-Aufruf).',
            'Plattform-Zugangsdaten & Sync: Einstellungen (/setup) › Verbindungen.',
            'Status-Vokabular: „nicht verbunden" bzw. „verbunden (Demo)".',
          ] },
```

- [ ] **Step 2: help-content-Test grün**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (Struktur unverändert gültig).

- [ ] **Step 3: Vollsuite + tsc**

Run: `set -a; source .env; set +a; npx vitest run` — nur bekannte `tests/db/rls.test.ts`-Fails; nichts sonst neu rot.
Run: `npx tsc --noEmit` — clean.

- [ ] **Step 4: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(hilfe): Verbindungen-Adminseite auf zentrale App-Verbindungen aktualisiert"
```

---

## Self-Review (während Authoring)

- **Spec-Abdeckung:** §3.1 `listAllConnections` → Task 1. §3.2 zentrale Sektion + Action → Tasks 2/3. §3.3 Konsolidierung → Task 4. §3.4 Seed → Task 5. §4 warme Pille → Task 3 Step 1. §5 Hilfe → Task 6. §2 Status-Vokabular → Task 6 (Doku). Abgrenzung zur `CredentialsForm`-„Verbindungen" → eigenständige „App-Verbindungen"-Sektion (Task 3).
- **Placeholder-Scan:** kein TBD/TODO; jeder Schritt vollständiger Code/Command.
- **Typkonsistenz:** `Connection`-Typ (id/app/provider/label/status/lastSyncedAt) durchgängig; `simulateConnectAction(id): Promise<void>` matcht `ConnectionStubs`-`onConnect`-Prop; `ConnectionsAdmin`-Gruppierung nutzt `Connection.app` + `APPS`-Labels. `getUserAccess`-Rückgabe (`{ apps, isAdmin }`) wie in der Action verwendet.
- **Fallen:** verwaiste `simulateConnect`-Importe in kontakte/katalog-actions **mit** entfernt (Task 4); `connection-stub`-Test zeigt bereits auf die zentrale Action, bevor die alte entfernt wird (Reihenfolge Task 2 vor Task 4); Seed idempotent (`ON CONFLICT`); Statuspille-Fix wirkt auch auf die (bis Task 4 noch existierenden) Modul-Seiten — unkritisch.
