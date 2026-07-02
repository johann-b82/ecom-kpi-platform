# Suite groups & access control (BrickPM Phase 1) — Design

**Date:** 2026-07-02
**Status:** Approved for planning
**Branch:** `brickpm-groups`

## Context

budp is evolving from a single KPI dashboard into an **integrated business-application
suite** (one CI, shared users, shared Supabase DB). The first non-KPI app will be
**BrickPM** (product management). Before adding a second app we need an **authorization
layer**: today the middleware only checks *authentication* — every signed-in user has full
access, there are no roles or groups.

This phase (1 of 4) delivers **groups** that control **which apps a user may open and with
what right (view / edit)**, plus management UI, guards, and backward compatibility so the
live dashboard keeps working. It does **not** build BrickPM itself (Phase 2) — it prepares
the access model the later apps plug into.

## Scope

- New tables `groups`, `group_members`, `group_app_access` (RLS-protected, server-only).
- An **app registry** constant (`dashboard`, `brickpm`; extensible).
- An **authorization layer**: `getUserAccess(userId)` → effective per-app rights + admin
  flag; `requireAppAccess(app, right)` guard for server components / actions.
- **Management UI**: *Einstellungen → Gruppen* — create/rename/delete groups, mark a group
  as admin, set per-app access + right, assign members. Visible to admins only.
- **Backward compatibility**: a seeded default group `Alle Nutzer` (admin, view+edit on all
  apps); existing users backfilled into it; new users auto-added on creation; and a
  grandfather rule so nothing is locked out before the backfill runs.

**Out of scope (later phases):** the BrickPM app and its routes/tables (Phase 2–4),
data-scope restrictions (only view certain product series), per-record permissions, and
gating the existing KPI dashboard (it stays open to any authenticated user this phase — see
Risk/Compat). The app registry includes `brickpm` so the guard is testable now, but no
`/brickpm` route exists yet.

## Data model

Runs on the same self-hosted Postgres. **No FK to `auth.users`** — the repo's `schema.sql`
must apply on plain Postgres in CI (auth schema absent; RLS exercised via `SET ROLE`), so
`user_id` is a bare `uuid` with app-level integrity, matching how `connector_credentials`
etc. avoid `auth.*` coupling.

```sql
CREATE TABLE IF NOT EXISTS groups (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL UNIQUE,
  is_admin   BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id  UUID NOT NULL,                    -- auth.users(id), no FK (CI is plain PG)
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE IF NOT EXISTS group_app_access (
  group_id   UUID NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  app        TEXT NOT NULL,                  -- 'dashboard' | 'brickpm'
  permission TEXT NOT NULL CHECK (permission IN ('view','edit')),
  PRIMARY KEY (group_id, app)
);

-- Default group so a fresh install has an admin group (idempotent).
INSERT INTO groups (name, is_admin) VALUES ('Alle Nutzer', true)
  ON CONFLICT (name) DO NOTHING;
INSERT INTO group_app_access (group_id, app, permission)
  SELECT id, a.app, 'edit' FROM groups, (VALUES ('dashboard'),('brickpm')) AS a(app)
  WHERE name = 'Alle Nutzer'
  ON CONFLICT (group_id, app) DO NOTHING;
```

RLS (in `db/rls.sql`, no public policy — reachable only via the privileged `pg` pool, same
posture as `connector_credentials`):

```sql
ALTER TABLE groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_members    ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_app_access ENABLE ROW LEVEL SECURITY;
```

## Authorization layer (`src/lib/groups.ts`)

```ts
export type AppKey = 'dashboard' | 'brickpm';
export type Right = 'view' | 'edit';

export interface UserAccess {
  apps: Partial<Record<AppKey, Right>>; // best right per app the user can access
  isAdmin: boolean;                      // member of any is_admin group
}

// Effective access = union over the user's groups; per app take the strongest right
// (edit > view). Admin = member of any admin group.
// Grandfather (per user): a user who is a member of NO group returns full admin access,
// so the live app never locks out — neither before the backfill runs nor for accounts
// not yet assigned. To restrict someone, put them in a (non-admin, limited) group; any
// membership turns the grandfather off.
export async function getUserAccess(userId: string): Promise<UserAccess>;

// Server guard: throws (→ handled by caller: redirect) when the user lacks `right` on `app`.
export async function requireAppAccess(app: AppKey, right?: Right): Promise<void>;
```

- Admin-management (create groups, assign members) requires `isAdmin`.
- `getUserAccess` reads via the privileged `pg` pool (server-only). No client access to the
  group tables is needed, so RLS stays fully closed.
- `edit` implies `view`. `requireAppAccess('x','view')` passes for a user with `edit` on x.

Store CRUD (also in `groups.ts`), all via `pg`:
`listGroups()`, `createGroup(name)`, `renameGroup(id,name)`, `deleteGroup(id)`,
`setAdmin(id,bool)`, `setAppAccess(id,app,right|null)`, `setMembers(id,userIds[])`,
`addUserToDefaultGroup(userId)`.

## Management UI

- `src/app/setup/page.tsx` computes `access = getUserAccess(currentUser.id)` and, **only if
  `access.isAdmin`**, renders a new **Gruppen** section (`GroupsForm`) above/near Benutzer.
- `GroupsForm` (client) lists groups; per group: name (rename), admin toggle, a per-app
  matrix of *kein Zugriff / ansehen / bearbeiten*, and a member multi-select drawn from the
  existing user list. Create/delete group. Saves via `POST /api/groups`.
- Copy is German and uses budp's existing form styling (labels, brand buttons, cards) — same
  components/utilities as `UsersForm`/`CredentialsForm`.

## API (`src/app/api/groups/route.ts`)

- `GET` → `{ groups, users }` for the form (admin only).
- `POST` → mutations (`create`/`rename`/`delete`/`setAdmin`/`setAppAccess`/`setMembers`).
- Both first call `getUserAccess(user.id)` and **403** unless `isAdmin`. (`/api/*` is already
  middleware-gated to 401 when unauthenticated.)

## Backward compatibility & seeding

- `db/schema.sql` seeds the `Alle Nutzer` admin group (idempotent, above).
- **Backfill existing users:** `scripts/seed-groups.ts` (`npm run seed-groups`) lists
  `auth.users` via the admin API and inserts each into `Alle Nutzer`. Idempotent.
- **New users:** `createUser` (in `src/lib/users.ts`) calls `addUserToDefaultGroup(id)`
  after creating the auth user, so new accounts inherit full access.
- **Grandfather rule** in `getUserAccess`: a user with **no group memberships** gets full
  admin access. This guarantees no lockout during the deploy window before the backfill runs
  and for any not-yet-assigned account; assigning a user to any group enforces that group's
  access instead.
- **Dashboard stays open** this phase (not gated), so the live KPI app cannot be
  accidentally locked out. Only the new admin-only Gruppen UI and the (future) BrickPM route
  consult the guard.

## Testing (Vitest)

- **Unit (`tests/lib/groups.test.ts`, mocked `pg`):** `getUserAccess` — max-right
  aggregation across groups, `edit`>`view`, `isAdmin` from any admin group, member of a
  limited group → only that group's apps/rights, member of no groups → full admin
  (grandfather). `requireAppAccess` allows/denies.
- **Integration (DB):** group store CRUD round-trips; `setMembers`/`setAppAccess` upserts.
- **RLS (`tests/db/rls.test.ts`, add cases):** `authenticated` is denied on `groups`,
  `group_members`, `group_app_access` (`SET ROLE` → `permission denied`).
- **Route (`tests/app/groups-route.test.ts`, mocked store + access):** non-admin → 403;
  admin → mutations dispatch to the store.

No live provider/auth calls; `pg`/access are mocked in unit/route tests, real DB only for
the integration + RLS tests (matching the existing test setup).

## Files

- Modify: `db/schema.sql`, `db/rls.sql`, `src/lib/users.ts`, `src/app/setup/page.tsx`,
  `package.json` (add `seed-groups`), `tests/db/rls.test.ts`.
- Create: `src/lib/apps.ts` (APPS registry: key + label), `src/lib/groups.ts`,
  `src/app/api/groups/route.ts`, `src/components/GroupsForm.tsx`,
  `scripts/seed-groups.ts`, `tests/lib/groups.test.ts`, `tests/app/groups-route.test.ts`.

## Risks

- **Lockout of the live app** — mitigated by: dashboard not gated this phase, the grandfather
  rule (zero groups → full admin), the seeded admin default group, and backfilling existing
  users. The admin who deploys is a member of `Alle Nutzer` (admin) after backfill.
- **Prod migration** — additive tables + idempotent seed; safe under the existing `deploy.sh`
  migrate step.
