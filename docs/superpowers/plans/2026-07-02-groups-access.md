# Suite Groups & Access Control (BrickPM Phase 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a groups-based authorization layer to budp so users can be granted per-app access (`dashboard`, `brickpm`) with a right (`view`/`edit`), managed in Einstellungen — without locking out the live app.

**Architecture:** Three RLS-protected tables (`groups`, `group_members`, `group_app_access`) reachable only via the privileged `pg` pool. A server-side access layer (`getUserAccess` aggregates a user's groups into effective per-app rights + an admin flag; `requireAppAccess` guards routes/actions). An admin-only *Gruppen* section in Einstellungen drives an admin-gated `/api/groups` route. Backward compatibility via a seeded `Alle Nutzer` admin group, a backfill script, auto-adding new users, and a grandfather rule (member of no group ⇒ full admin).

**Tech Stack:** Next.js 14 App Router, TypeScript, `pg` (privileged server writes), Supabase Auth admin API (`@/lib/users`), Vitest.

## Global Constraints

- `groups`, `group_members`, `group_app_access` reachable ONLY via the privileged `pg` pool (`@/lib/db`); RLS enabled, NO `anon`/`authenticated` policy — same posture as `connector_credentials`.
- `schema.sql` must apply on plain Postgres in CI: **no FK to `auth.users`**; `user_id` is a bare `uuid`. `gen_random_uuid()` is core in Postgres 16 (no extension needed).
- Migration SQL idempotent (`CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`).
- App keys: `'dashboard' | 'brickpm'`. Rights: `'view' | 'edit'` (`edit` implies `view`).
- Grandfather: a user with no group memberships gets full admin access.
- The existing KPI dashboard is NOT gated this phase. Only the admin-only Gruppen UI (and future `/brickpm`) consult the guard.
- German UI copy; reuse budp's existing form styling (`UsersForm`/`CredentialsForm` patterns, brand buttons).
- Conventional commits; commit after each task.

---

### Task 1: Groups tables + RLS + default-group seed

**Files:**
- Modify: `db/schema.sql` (append after `app_settings`)
- Modify: `db/rls.sql` (append to the no-public-policy block)
- Modify: `tests/db/rls.test.ts` (add cases)

**Interfaces:**
- Produces: tables `groups(id uuid pk, name text unique, is_admin bool, created_at)`, `group_members(group_id, user_id, pk(group_id,user_id))`, `group_app_access(group_id, app, permission, pk(group_id,app))`; a seeded admin group `Alle Nutzer` with `edit` on `dashboard`+`brickpm`.

- [ ] **Step 1: Add failing RLS cases** to `tests/db/rls.test.ts` inside the `describe('RLS on KPI tables', …)` block:

```ts
  for (const t of ['groups', 'group_members', 'group_app_access']) {
    it(`authenticated is denied on ${t}`, async () => {
      const c = await pool.connect();
      try {
        await c.query('SET ROLE authenticated');
        await expect(c.query(`SELECT count(*) FROM ${t}`)).rejects.toThrow(/permission denied/i);
      } finally {
        await c.query('RESET ROLE');
        c.release();
      }
    });
  }
```

- [ ] **Step 2: Run — expect fail** (`relation "groups" does not exist`)

Run: `npm test -- tests/db/rls.test.ts`
Expected: FAIL.

- [ ] **Step 3: Append tables + seed to `db/schema.sql`**

```sql
CREATE TABLE IF NOT EXISTS groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_app_access (
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  app        TEXT NOT NULL,
  permission TEXT NOT NULL CHECK (permission IN ('view','edit')),
  PRIMARY KEY (group_id, app)
);

INSERT INTO groups (name, is_admin) VALUES ('Alle Nutzer', true)
  ON CONFLICT (name) DO NOTHING;
INSERT INTO group_app_access (group_id, app, permission)
  SELECT g.id, a.app, 'edit' FROM groups g, (VALUES ('dashboard'),('brickpm')) AS a(app)
  WHERE g.name = 'Alle Nutzer'
  ON CONFLICT (group_id, app) DO NOTHING;
```

- [ ] **Step 4: Enable RLS in `db/rls.sql`** (add next to `connector_credentials`/`oauth_connections`):

```sql
ALTER TABLE groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_app_access ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 5: Migrate + run — expect pass**

Run: `npm run migrate && npm test -- tests/db/rls.test.ts`
Expected: PASS (permission denied on all three).

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql db/rls.sql tests/db/rls.test.ts
git commit -m "feat: groups/group_members/group_app_access tables with RLS + default admin group"
```

---

### Task 2: App registry + access layer (`getUserAccess`, `requireAppAccess`)

**Files:**
- Create: `src/lib/apps.ts`
- Create: `src/lib/groups.ts`
- Create: `tests/lib/groups.test.ts`

**Interfaces:**
- Consumes: `pool` (`@/lib/db`), `createClient` (`@/lib/supabase/server`).
- Produces:
  - `apps.ts`: `type AppKey = 'dashboard' | 'brickpm'`; `interface AppDef { key: AppKey; label: string }`; `const APPS: AppDef[]`; `const APP_KEYS: AppKey[]`.
  - `groups.ts`: `type Right = 'view' | 'edit'`; `interface UserAccess { apps: Partial<Record<AppKey, Right>>; isAdmin: boolean }`; `getUserAccess(userId: string): Promise<UserAccess>`; `requireAppAccess(app: AppKey, right?: Right): Promise<void>`.

- [ ] **Step 1: Write `src/lib/apps.ts`**

```ts
export type AppKey = 'dashboard' | 'brickpm';

export interface AppDef {
  key: AppKey;
  label: string;
}

export const APPS: AppDef[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'brickpm', label: 'BrickPM' },
];

export const APP_KEYS: AppKey[] = APPS.map((a) => a.key);
```

- [ ] **Step 2: Write the failing test `tests/lib/groups.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/db', () => ({ pool: { query: vi.fn() } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));

import { getUserAccess, requireAppAccess } from '@/lib/groups';
import { pool } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';

const q = () => vi.mocked(pool.query);
beforeEach(() => { q().mockReset(); });

describe('getUserAccess', () => {
  it('grants full admin when the user is in no group (grandfather)', async () => {
    q().mockResolvedValue({ rows: [] } as never);
    const a = await getUserAccess('u1');
    expect(a.isAdmin).toBe(true);
    expect(a.apps).toEqual({ dashboard: 'edit', brickpm: 'edit' });
  });

  it('aggregates the strongest right per app and admin from any admin group', async () => {
    q().mockResolvedValue({ rows: [
      { is_admin: false, app: 'dashboard', permission: 'view' },
      { is_admin: true,  app: 'brickpm',   permission: 'view' },
      { is_admin: false, app: 'brickpm',   permission: 'edit' },
    ] } as never);
    const a = await getUserAccess('u1');
    expect(a.isAdmin).toBe(true);
    expect(a.apps).toEqual({ dashboard: 'view', brickpm: 'edit' });
  });

  it('a member of a limited non-admin group gets only that access', async () => {
    q().mockResolvedValue({ rows: [
      { is_admin: false, app: 'brickpm', permission: 'view' },
    ] } as never);
    const a = await getUserAccess('u1');
    expect(a.isAdmin).toBe(false);
    expect(a.apps).toEqual({ brickpm: 'view' });
  });
});

describe('requireAppAccess', () => {
  function mockUser(id: string | null) {
    vi.mocked(createClient).mockReturnValue({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } } as never);
  }

  it('passes when the user has the required right (edit satisfies view)', async () => {
    mockUser('u1');
    q().mockResolvedValue({ rows: [{ is_admin: false, app: 'brickpm', permission: 'edit' }] } as never);
    await expect(requireAppAccess('brickpm', 'view')).resolves.toBeUndefined();
  });

  it('throws when the user lacks edit', async () => {
    mockUser('u1');
    q().mockResolvedValue({ rows: [{ is_admin: false, app: 'brickpm', permission: 'view' }] } as never);
    await expect(requireAppAccess('brickpm', 'edit')).rejects.toThrow(/Kein Zugriff/i);
  });

  it('throws when unauthenticated', async () => {
    mockUser(null);
    await expect(requireAppAccess('brickpm')).rejects.toThrow(/nicht angemeldet|not authenticated/i);
  });
});
```

- [ ] **Step 3: Run — expect fail** (`@/lib/groups` missing)

Run: `npm test -- tests/lib/groups.test.ts`
Expected: FAIL.

- [ ] **Step 4: Write `src/lib/groups.ts` (access layer)**

```ts
import { pool } from '@/lib/db';
import { createClient } from '@/lib/supabase/server';
import { APP_KEYS, type AppKey } from './apps';

export type Right = 'view' | 'edit';

export interface UserAccess {
  apps: Partial<Record<AppKey, Right>>;
  isAdmin: boolean;
}

function fullAdmin(): UserAccess {
  const apps: Partial<Record<AppKey, Right>> = {};
  for (const k of APP_KEYS) apps[k] = 'edit';
  return { apps, isAdmin: true };
}

interface AccessRow { is_admin: boolean; app: AppKey | null; permission: Right | null }

export async function getUserAccess(userId: string): Promise<UserAccess> {
  const res = await pool.query<AccessRow>(
    `SELECT g.is_admin, a.app, a.permission
       FROM group_members m
       JOIN groups g ON g.id = m.group_id
       LEFT JOIN group_app_access a ON a.group_id = g.id
      WHERE m.user_id = $1`,
    [userId],
  );
  if (res.rows.length === 0) return fullAdmin(); // grandfather: no memberships → full admin

  const apps: Partial<Record<AppKey, Right>> = {};
  let isAdmin = false;
  for (const row of res.rows) {
    if (row.is_admin) isAdmin = true;
    if (row.app && row.permission) {
      // edit beats view
      if (apps[row.app] !== 'edit') apps[row.app] = row.permission;
    }
  }
  return { apps, isAdmin };
}

export async function requireAppAccess(app: AppKey, right: Right = 'view'): Promise<void> {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) throw new Error('Nicht angemeldet.');
  const access = await getUserAccess(user.id);
  const have = access.apps[app];
  if (!have || (right === 'edit' && have !== 'edit')) {
    throw new Error(`Kein Zugriff auf ${app}.`);
  }
}
```

- [ ] **Step 5: Run — expect pass**

Run: `npm test -- tests/lib/groups.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/apps.ts src/lib/groups.ts tests/lib/groups.test.ts
git commit -m "feat: app registry + group access layer (getUserAccess, requireAppAccess)"
```

---

### Task 3: Group store CRUD (DB integration)

**Files:**
- Modify: `src/lib/groups.ts` (append store functions)
- Create: `tests/lib/groups-store.test.ts`

**Interfaces:**
- Produces (in `groups.ts`):
  - `interface GroupAppAccess { app: AppKey; permission: Right }`
  - `interface Group { id: string; name: string; isAdmin: boolean; memberIds: string[]; access: GroupAppAccess[] }`
  - `listGroups(): Promise<Group[]>`
  - `createGroup(name: string): Promise<string>` (returns new id)
  - `renameGroup(id: string, name: string): Promise<void>`
  - `deleteGroup(id: string): Promise<void>`
  - `setAdmin(id: string, isAdmin: boolean): Promise<void>`
  - `setAppAccess(id: string, app: AppKey, right: Right | null): Promise<void>` (null → remove)
  - `setMembers(id: string, userIds: string[]): Promise<void>` (replaces the membership set)
  - `addUserToDefaultGroup(userId: string): Promise<void>` (into `Alle Nutzer`)

- [ ] **Step 1: Write the failing test `tests/lib/groups-store.test.ts`** (integration, real DB):

```ts
import { describe, it, expect, afterAll } from 'vitest';
import {
  createGroup, listGroups, renameGroup, setAdmin, setAppAccess, setMembers, deleteGroup,
} from '@/lib/groups';
import { pool } from '@/lib/db';

const U1 = '00000000-0000-0000-0000-000000000001';
const U2 = '00000000-0000-0000-0000-000000000002';
let gid = '';

afterAll(async () => {
  if (gid) await pool.query('DELETE FROM groups WHERE id = $1', [gid]);
  await pool.end();
});

describe('group store (integration, benötigt DB)', () => {
  it('create → list round-trip', async () => {
    gid = await createGroup('Testgruppe');
    const g = (await listGroups()).find((x) => x.id === gid)!;
    expect(g).toMatchObject({ name: 'Testgruppe', isAdmin: false, memberIds: [], access: [] });
  });

  it('setAdmin / setAppAccess / setMembers reflected in listGroups', async () => {
    await setAdmin(gid, true);
    await setAppAccess(gid, 'brickpm', 'edit');
    await setAppAccess(gid, 'dashboard', 'view');
    await setMembers(gid, [U1, U2]);
    const g = (await listGroups()).find((x) => x.id === gid)!;
    expect(g.isAdmin).toBe(true);
    expect(g.memberIds.sort()).toEqual([U1, U2].sort());
    expect(g.access.find((a) => a.app === 'brickpm')?.permission).toBe('edit');
    expect(g.access.find((a) => a.app === 'dashboard')?.permission).toBe('view');
  });

  it('setAppAccess(null) removes; setMembers replaces; rename works', async () => {
    await setAppAccess(gid, 'dashboard', null);
    await setMembers(gid, [U1]);
    await renameGroup(gid, 'Umbenannt');
    const g = (await listGroups()).find((x) => x.id === gid)!;
    expect(g.name).toBe('Umbenannt');
    expect(g.memberIds).toEqual([U1]);
    expect(g.access.find((a) => a.app === 'dashboard')).toBeUndefined();
  });

  it('deleteGroup removes it (cascades members/access)', async () => {
    await deleteGroup(gid);
    expect((await listGroups()).find((x) => x.id === gid)).toBeUndefined();
    gid = '';
  });
});
```

- [ ] **Step 2: Run — expect fail** (functions missing)

Run: `npm test -- tests/lib/groups-store.test.ts`
Expected: FAIL.

- [ ] **Step 3: Append store functions to `src/lib/groups.ts`**

```ts
export interface GroupAppAccess { app: AppKey; permission: Right }
export interface Group {
  id: string; name: string; isAdmin: boolean; memberIds: string[]; access: GroupAppAccess[];
}

export async function listGroups(): Promise<Group[]> {
  const groups = await pool.query<{ id: string; name: string; is_admin: boolean }>(
    'SELECT id, name, is_admin FROM groups ORDER BY name',
  );
  const members = await pool.query<{ group_id: string; user_id: string }>(
    'SELECT group_id, user_id FROM group_members',
  );
  const access = await pool.query<{ group_id: string; app: AppKey; permission: Right }>(
    'SELECT group_id, app, permission FROM group_app_access',
  );
  return groups.rows.map((g) => ({
    id: g.id,
    name: g.name,
    isAdmin: g.is_admin,
    memberIds: members.rows.filter((m) => m.group_id === g.id).map((m) => m.user_id),
    access: access.rows.filter((a) => a.group_id === g.id).map((a) => ({ app: a.app, permission: a.permission })),
  }));
}

export async function createGroup(name: string): Promise<string> {
  const res = await pool.query<{ id: string }>(
    'INSERT INTO groups (name) VALUES ($1) RETURNING id', [name],
  );
  return res.rows[0].id;
}

export async function renameGroup(id: string, name: string): Promise<void> {
  await pool.query('UPDATE groups SET name = $2 WHERE id = $1', [id, name]);
}

export async function deleteGroup(id: string): Promise<void> {
  await pool.query('DELETE FROM groups WHERE id = $1', [id]);
}

export async function setAdmin(id: string, isAdmin: boolean): Promise<void> {
  await pool.query('UPDATE groups SET is_admin = $2 WHERE id = $1', [id, isAdmin]);
}

export async function setAppAccess(id: string, app: AppKey, right: Right | null): Promise<void> {
  if (right === null) {
    await pool.query('DELETE FROM group_app_access WHERE group_id = $1 AND app = $2', [id, app]);
    return;
  }
  await pool.query(
    `INSERT INTO group_app_access (group_id, app, permission) VALUES ($1, $2, $3)
     ON CONFLICT (group_id, app) DO UPDATE SET permission = excluded.permission`,
    [id, app, right],
  );
}

export async function setMembers(id: string, userIds: string[]): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM group_members WHERE group_id = $1', [id]);
    for (const uid of userIds) {
      await client.query(
        'INSERT INTO group_members (group_id, user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [id, uid],
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

export async function addUserToDefaultGroup(userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO group_members (group_id, user_id)
       SELECT id, $1 FROM groups WHERE name = 'Alle Nutzer'
     ON CONFLICT DO NOTHING`,
    [userId],
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- tests/lib/groups-store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/groups.ts tests/lib/groups-store.test.ts
git commit -m "feat: group store CRUD (list/create/rename/delete/admin/access/members)"
```

---

### Task 4: Auto-add new users to the default group + backfill script

**Files:**
- Modify: `src/lib/users.ts` (`createUser` → add to default group)
- Create: `scripts/seed-groups.ts`
- Modify: `package.json` (add `seed-groups` script)
- Create: `tests/lib/users-group.test.ts`

**Interfaces:**
- Consumes: `addUserToDefaultGroup` (`@/lib/groups`).

- [ ] **Step 1: Write the failing test `tests/lib/users-group.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createUserMock = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { createUser: createUserMock } } }),
}));
vi.mock('@/lib/groups', () => ({ addUserToDefaultGroup: vi.fn() }));

import { createUser } from '@/lib/users';
import { addUserToDefaultGroup } from '@/lib/groups';

beforeEach(() => {
  createUserMock.mockReset();
  vi.mocked(addUserToDefaultGroup).mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://x';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'k';
});

describe('createUser', () => {
  it('adds the newly created user to the default group', async () => {
    createUserMock.mockResolvedValue({ data: { user: { id: 'new-id' } }, error: null });
    await createUser('a@b.de', 'secret1');
    expect(addUserToDefaultGroup).toHaveBeenCalledWith('new-id');
  });

  it('does not touch groups when auth creation fails', async () => {
    createUserMock.mockResolvedValue({ data: { user: null }, error: { message: 'boom' } });
    await expect(createUser('a@b.de', 'secret1')).rejects.toThrow('boom');
    expect(addUserToDefaultGroup).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect fail** (createUser doesn't call addUserToDefaultGroup)

Run: `npm test -- tests/lib/users-group.test.ts`
Expected: FAIL.

- [ ] **Step 3: Modify `createUser` in `src/lib/users.ts`**

Add the import at the top and update `createUser`:

```ts
import { addUserToDefaultGroup } from './groups';
// …
export async function createUser(email: string, password: string): Promise<void> {
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(error.message);
  if (data.user) await addUserToDefaultGroup(data.user.id);
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- tests/lib/users-group.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write `scripts/seed-groups.ts`** (backfill existing users)

```ts
import { listUsers } from '../src/lib/users';
import { addUserToDefaultGroup } from '../src/lib/groups';
import { pool } from '../src/lib/db';

async function main() {
  const users = await listUsers();
  for (const u of users) await addUserToDefaultGroup(u.id);
  console.log(`Backfilled ${users.length} users into 'Alle Nutzer'.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: Add the npm script** to `package.json` (after `create-user`):

```json
    "create-user": "tsx scripts/create-user.ts",
    "seed-groups": "tsx scripts/seed-groups.ts"
```

- [ ] **Step 7: Run the full suite — expect green**

Run: `npm test`
Expected: PASS (no regressions).

- [ ] **Step 8: Commit**

```bash
git add src/lib/users.ts scripts/seed-groups.ts package.json tests/lib/users-group.test.ts
git commit -m "feat: auto-add new users to default group + seed-groups backfill script"
```

---

### Task 5: Admin-gated `/api/groups` route

**Files:**
- Create: `src/app/api/groups/route.ts`
- Create: `tests/app/groups-route.test.ts`

**Interfaces:**
- Consumes: `getUserAccess` + store fns (`@/lib/groups`), `listUsers` (`@/lib/users`), `createClient` (`@/lib/supabase/server`).
- Produces: `GET` → `{ groups, users }` (admin only); `POST` → `{ action, ... }` dispatch (admin only). Actions: `create` `{name}`, `rename` `{id,name}`, `delete` `{id}`, `setAdmin` `{id,isAdmin}`, `setAppAccess` `{id,app,right|null}`, `setMembers` `{id,userIds}`.

- [ ] **Step 1: Write the failing test `tests/app/groups-route.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/groups', () => ({
  getUserAccess: vi.fn(),
  listGroups: vi.fn(async () => []),
  createGroup: vi.fn(async () => 'gid'),
  setMembers: vi.fn(),
}));
vi.mock('@/lib/users', () => ({ listUsers: vi.fn(async () => []) }));

import { GET, POST } from '@/app/api/groups/route';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess, createGroup } from '@/lib/groups';

function auth(id: string | null) {
  vi.mocked(createClient).mockReturnValue({ auth: { getUser: async () => ({ data: { user: id ? { id } : null } }) } } as never);
}
function req(body: unknown) { return new Request('http://x/api/groups', { method: 'POST', body: JSON.stringify(body) }); }

beforeEach(() => { vi.mocked(getUserAccess).mockReset(); vi.mocked(createGroup).mockReset(); });

describe('/api/groups', () => {
  it('GET 403 for a non-admin', async () => {
    auth('u1'); vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: false });
    expect((await GET()).status).toBe(403);
  });

  it('GET returns groups+users for an admin', async () => {
    auth('u1'); vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: true });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ groups: [], users: [] });
  });

  it('POST create dispatches to the store for an admin', async () => {
    auth('u1'); vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: true });
    const res = await POST(req({ action: 'create', name: 'Neue Gruppe' }));
    expect(res.status).toBe(200);
    expect(createGroup).toHaveBeenCalledWith('Neue Gruppe');
  });

  it('POST 403 for a non-admin (no mutation)', async () => {
    auth('u1'); vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: false });
    const res = await POST(req({ action: 'create', name: 'X' }));
    expect(res.status).toBe(403);
    expect(createGroup).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run — expect fail** (route missing)

Run: `npm test -- tests/app/groups-route.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write `src/app/api/groups/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getUserAccess, listGroups, createGroup, renameGroup, deleteGroup,
  setAdmin, setAppAccess, setMembers,
} from '@/lib/groups';
import { listUsers } from '@/lib/users';
import type { AppKey } from '@/lib/apps';
import type { Right } from '@/lib/groups';

export const dynamic = 'force-dynamic';

async function requireAdmin(): Promise<NextResponse | null> {
  const { data: { user } } = await createClient().auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const access = await getUserAccess(user.id);
  if (!access.isAdmin) return NextResponse.json({ error: 'Nur Admins dürfen Gruppen verwalten.' }, { status: 403 });
  return null;
}

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const [groups, users] = await Promise.all([listGroups(), listUsers()]);
  return NextResponse.json({ groups, users });
}

export async function POST(request: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const body = (await request.json()) as {
    action: string; id?: string; name?: string; isAdmin?: boolean;
    app?: AppKey; right?: Right | null; userIds?: string[];
  };
  switch (body.action) {
    case 'create': await createGroup(body.name ?? ''); break;
    case 'rename': await renameGroup(body.id!, body.name ?? ''); break;
    case 'delete': await deleteGroup(body.id!); break;
    case 'setAdmin': await setAdmin(body.id!, !!body.isAdmin); break;
    case 'setAppAccess': await setAppAccess(body.id!, body.app!, body.right ?? null); break;
    case 'setMembers': await setMembers(body.id!, body.userIds ?? []); break;
    default: return NextResponse.json({ error: 'Unbekannte Aktion.' }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- tests/app/groups-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/groups/route.ts tests/app/groups-route.test.ts
git commit -m "feat: admin-gated /api/groups route (list + mutations)"
```

---

### Task 6: Gruppen management UI (admin-only) in Einstellungen

**Files:**
- Create: `src/components/GroupsForm.tsx`
- Modify: `src/app/setup/page.tsx` (render GroupsForm for admins)
- Create: `tests/components/groups-form.test.tsx`

**Interfaces:**
- Consumes: `Group` (`@/lib/groups`), `AppUser` (`@/lib/users`), `APPS` (`@/lib/apps`).
- Produces: `GroupsForm({ groups, users }: { groups: Group[]; users: AppUser[] })`.

- [ ] **Step 1: Write the failing test `tests/components/groups-form.test.tsx`**

```tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { GroupsForm } from '@/components/GroupsForm';
import type { Group } from '@/lib/groups';
import type { AppUser } from '@/lib/users';

afterEach(cleanup);

const users: AppUser[] = [{ id: 'u1', email: 'a@b.de', createdAt: '', lastSignInAt: null }];
const groups: Group[] = [
  { id: 'g1', name: 'Produktmanagement', isAdmin: false, memberIds: ['u1'], access: [{ app: 'brickpm', permission: 'edit' }] },
];

describe('GroupsForm', () => {
  it('renders each group with its name and a per-app access control', () => {
    render(<GroupsForm groups={groups} users={users} />);
    expect(screen.getByDisplayValue('Produktmanagement')).toBeTruthy();
    // one access <select> per app (dashboard + brickpm) → at least 2
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Neue Gruppe')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run — expect fail** (component missing)

Run: `npm test -- tests/components/groups-form.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Write `src/components/GroupsForm.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { APPS } from '@/lib/apps';
import type { Group, Right } from '@/lib/groups';
import type { AppUser } from '@/lib/users';

const inputClass =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function GroupsForm({ groups, users }: { groups: Group[]; users: AppUser[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  async function call(body: object) {
    const res = await fetch('/api/groups', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setMsg(data.error ?? 'Fehler.'); return; }
    setMsg(null);
    router.refresh();
  }

  const rightOf = (g: Group, app: string): Right | '' =>
    (g.access.find((a) => a.app === app)?.permission ?? '') as Right | '';

  return (
    <section>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">Gruppen</h2>
      {msg && <p className="mb-3 text-sm text-neutral-900 dark:text-neutral-100">{msg}</p>}

      <div className="space-y-4">
        {groups.map((g) => (
          <div key={g.id} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="mb-3 flex items-center gap-3">
              <input
                className={`${inputClass} flex-1`}
                defaultValue={g.name}
                onBlur={(e) => e.target.value !== g.name && call({ action: 'rename', id: g.id, name: e.target.value })}
              />
              <label className="flex items-center gap-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                <input type="checkbox" checked={g.isAdmin} onChange={(e) => call({ action: 'setAdmin', id: g.id, isAdmin: e.target.checked })} />
                Admin
              </label>
              <button type="button" className="text-xs text-red-600 dark:text-red-400"
                onClick={() => { if (confirm(`Gruppe „${g.name}" löschen?`)) call({ action: 'delete', id: g.id }); }}>
                Löschen
              </button>
            </div>

            <div className="mb-3 flex flex-wrap gap-4">
              {APPS.map((app) => (
                <label key={app.key} className="flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <span className="w-24">{app.label}</span>
                  <select
                    className={inputClass}
                    value={rightOf(g, app.key)}
                    onChange={(e) => call({ action: 'setAppAccess', id: g.id, app: app.key, right: e.target.value === '' ? null : e.target.value })}
                  >
                    <option value="">kein Zugriff</option>
                    <option value="view">ansehen</option>
                    <option value="edit">bearbeiten</option>
                  </select>
                </label>
              ))}
            </div>

            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Mitglieder</p>
              <div className="flex flex-wrap gap-3">
                {users.map((u) => {
                  const member = g.memberIds.includes(u.id);
                  return (
                    <label key={u.id} className="flex items-center gap-1.5 text-sm text-neutral-700 dark:text-neutral-300">
                      <input
                        type="checkbox"
                        checked={member}
                        onChange={(e) => {
                          const next = e.target.checked ? [...g.memberIds, u.id] : g.memberIds.filter((id) => id !== u.id);
                          call({ action: 'setMembers', id: g.id, userIds: next });
                        }}
                      />
                      {u.email}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <input className={inputClass} placeholder="Gruppenname" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button
          type="button"
          className="rounded bg-brand px-3 py-1 text-sm text-white"
          onClick={() => { if (newName.trim()) { call({ action: 'create', name: newName.trim() }); setNewName(''); } }}
        >
          Neue Gruppe
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- tests/components/groups-form.test.tsx`
Expected: PASS.

- [ ] **Step 5: Render GroupsForm for admins in `src/app/setup/page.tsx`**

Add imports and load access + groups, then render the section only for admins. After the existing `const { data: { user: currentUser } } = …` line:

```ts
import { getUserAccess, listGroups } from '@/lib/groups';
import { GroupsForm } from '@/components/GroupsForm';
// … inside SetupPage(), after currentUser is resolved:
  const access = currentUser ? await getUserAccess(currentUser.id) : { apps: {}, isAdmin: false };
  const groups = access.isAdmin ? await listGroups() : [];
```

And in the JSX, render the Gruppen section right after `<UsersForm … />` (only for admins):

```tsx
        {access.isAdmin && <GroupsForm groups={groups} users={users} />}
```

- [ ] **Step 6: Build + full suite**

Run: `npm run build && npm test`
Expected: build succeeds; all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/GroupsForm.tsx src/app/setup/page.tsx tests/components/groups-form.test.tsx
git commit -m "feat: admin-only Gruppen management UI in Einstellungen"
```

---

### Task 7: Verify end-to-end + deploy notes

**Files:** none (verification).

- [ ] **Step 1: Full suite + build + typecheck**

Run: `npm test && npm run build && npx tsc --noEmit -p .`
Expected: all green.

- [ ] **Step 2: Browser check (Claude in Chrome / dev)**

Bring up the app (`npm run dev` against the local Supabase) and, logged in as an existing user (grandfather ⇒ admin), open `/setup`: the **Gruppen** section renders; create a group, toggle Admin, set app access, assign a member — each persists after a reload (proves DB persistence). Confirm a non-admin (a user placed only in a non-admin, dashboard-only group) does NOT see the Gruppen section.

- [ ] **Step 3: Note the deploy backfill**

Record that production deploy must run `npm run seed-groups` once after `migrate` so existing users are members of `Alle Nutzer` (the grandfather rule already prevents lockout regardless).

- [ ] **Step 4: Commit any fixups**

```bash
git commit -am "test: verify groups access end-to-end" --allow-empty
```

---

## Self-Review

**Spec coverage:**
- Tables + RLS + default group → Task 1. ✓
- App registry → Task 2 (`apps.ts`). ✓
- `getUserAccess` (aggregate, edit>view, admin, grandfather) + `requireAppAccess` → Task 2. ✓
- Store CRUD (list/create/rename/delete/admin/appAccess/members/addToDefault) → Task 3. ✓
- New-user auto-add + backfill script + grandfather → Tasks 3, 4. ✓
- Admin-gated `/api/groups` → Task 5. ✓
- Admin-only Gruppen UI in Einstellungen → Task 6. ✓
- Dashboard not gated; only Gruppen UI (and future `/brickpm`) use the guard → Tasks 5/6 (no dashboard change). ✓
- Tests: unit access, store integration, RLS, route → Tasks 1–5; component → Task 6. ✓
- Backward compat (no lockout) → grandfather (Task 2) + default group (Task 1) + backfill (Task 4). ✓

**Placeholder scan:** No TBD/TODO; every code step is complete. The setup-page edit references existing symbols (`currentUser`, `users`) already present in the file.

**Type consistency:** `AppKey`, `Right`, `UserAccess`, `Group`, `GroupAppAccess`, `getUserAccess`, `requireAppAccess`, `listGroups`/`createGroup`/`renameGroup`/`deleteGroup`/`setAdmin`/`setAppAccess`/`setMembers`/`addUserToDefaultGroup`, `APPS`/`APP_KEYS`, `GroupsForm({groups,users})` are used consistently across tasks.
