# BrickPM foundation (Phase 2) — Design

**Date:** 2026-07-02
**Status:** Approved for planning
**Branch:** `brickpm-foundation`

## Context

Phase 1 (groups & access control) is live in budp. Phase 2 introduces **BrickPM** as a real,
gated app area inside budp: its Postgres schema, seed data (extracted from the original
demo), a server-side data layer, a `/brickpm` shell (sidebar over the 10 sections, in
**budp's CI**) with a working **Cockpit**, a nav entry, and the `requireAppAccess('brickpm')`
gate. Because we now gate a real route, this phase also **hardens the grandfather rule**.

Later phases: Phase 3 migrates the other 9 sections' content; Phase 4 adds the 4 new pages.
The original demo lives at `~/Downloads/drive-download-20260702T194014Z-3-001/UseCase_BrickPM.html`
(a minified bundle) with real data for 13 products, 7 promotions, 6 goodies, 8 competitors,
9 notifications, 8 integrations — all in budp CI now, not the demo's blue look.

## Scope

- **7 BrickPM tables** (`bpm_` prefix), RLS-closed (server-only via the privileged `pg`
  pool, like `connector_credentials`).
- **Seed**: extract the 6 data arrays from the bundle **once** into a committed data module
  `src/brickpm/seed-data.ts`; `scripts/seed-brickpm.ts` inserts them (idempotent).
- **Data layer** `src/brickpm/repository.ts` — server reads via `pg`.
- **`/brickpm` route + shell + nav**, gated by `requireAppAccess('brickpm')`; Cockpit page
  live; the other 9 sections show a "in Arbeit" placeholder.
- **Cockpit** (budp CI): 6 KPI cards + "Heute wichtig" + offene Notifications.
- **Grandfather-hardening**: change the rule from *per-user* (no membership ⇒ admin) to
  *global* (no groups exist at all ⇒ admin), removing the escalation vector now that a real
  route is gated.

Out of scope: the 9 non-cockpit sections' real content (Phase 3); the 4 analytics pages
(Phase 4); writes/mutations to BrickPM data (Phase 3); charts.

## Data model

`bpm_` prefix keeps BrickPM cleanly separate from the KPI tables. Columns mirror the
bundle's objects. No FK to `auth.users`. Idempotent (`CREATE TABLE IF NOT EXISTS`).

```sql
CREATE TABLE IF NOT EXISTS bpm_products (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, cat TEXT, series TEXT, status TEXT,
  year INT, parts INT, uvp DOUBLE PRECISION, price DOUBLE PRECISION, cost DOUBLE PRECISION,
  t_mgn DOUBLE PRECISION, m_mgn DOUBLE PRECISION, stock INT, min_stock INT,
  valid_from DATE, valid_to DATE, channel TEXT, succ TEXT, descr TEXT
);
CREATE TABLE IF NOT EXISTS bpm_promotions (
  id TEXT PRIMARY KEY, name TEXT, product_id TEXT, type TEXT, start_date DATE, end_date DATE,
  target_units INT, sold INT, target_rev DOUBLE PRECISION, exp_mgn DOUBLE PRECISION,
  status TEXT, note TEXT
);
CREATE TABLE IF NOT EXISTS bpm_goodies (
  id TEXT PRIMARY KEY, name TEXT, type TEXT, cost DOUBLE PRECISION, price DOUBLE PRECISION,
  products TEXT[], min_cart DOUBLE PRECISION, valid_from DATE, valid_to DATE, status TEXT,
  mgn_effect DOUBLE PRECISION, comment TEXT
);
CREATE TABLE IF NOT EXISTS bpm_competitors (
  id TEXT PRIMARY KEY, product_id TEXT, competitor TEXT, comp_product TEXT,
  own_price DOUBLE PRECISION, comp_price DOUBLE PRECISION, avail BOOLEAN, date DATE, rec TEXT
);
CREATE TABLE IF NOT EXISTS bpm_notifications (
  id TEXT PRIMARY KEY, type TEXT, priority TEXT, ref_id TEXT, msg TEXT, action TEXT,
  status TEXT, due DATE, role TEXT, target TEXT
);
CREATE TABLE IF NOT EXISTS bpm_integrations (
  id TEXT PRIMARY KEY, type TEXT, system TEXT, purpose TEXT, objects TEXT[], dir TEXT,
  status TEXT, ep TEXT, last_sync TEXT
);
CREATE TABLE IF NOT EXISTS bpm_audit_log (
  id BIGSERIAL PRIMARY KEY, ts TIMESTAMPTZ NOT NULL DEFAULT now(),
  actor TEXT, action TEXT NOT NULL, detail TEXT
);
```

RLS (in `db/rls.sql`, no public policy — server-only):

```sql
ALTER TABLE bpm_products, bpm_promotions, bpm_goodies, bpm_competitors,
            bpm_notifications, bpm_integrations, bpm_audit_log ENABLE ROW LEVEL SECURITY;
```
(one `ALTER TABLE … ENABLE ROW LEVEL SECURITY;` per table — Postgres needs them separate.)

## Seed

The bundle is not in the repo, so we extract **once** and commit the data as a fixture:

- A one-time extraction reads the bundle at the path above, pulls the six arrays
  (`products`, `promotions`, `goodies`, `competitors`, `notifications`, `integrations`),
  and writes them to `src/brickpm/seed-data.ts` as typed constants (dates/`succ`/arrays
  preserved; `''` → `null` for dates).
- `scripts/seed-brickpm.ts` (`npm run seed-brickpm`) inserts each array with
  `INSERT … ON CONFLICT (id) DO UPDATE` so re-running refreshes rows idempotently.

## Data layer (`src/brickpm/repository.ts`)

Server-side reads via `pool`:

- `listProducts(): Promise<BpmProduct[]>`, `listNotifications(): Promise<BpmNotification[]>`.
- `getCockpit(): Promise<CockpitData>` where
  `CockpitData = { stats: CockpitStats; heuteWichtig: BpmNotification[]; offene: BpmNotification[] }`.
- A **pure** `computeCockpitStats(products, notifications): CockpitStats` (unit-testable, no
  I/O) — `getCockpit` just loads rows and calls it.

`CockpitStats` (the 6 KPIs):
- `produkte` = product count
- `kritisch` = count where `stock < min_stock`
- `preorder` = count where `status = 'preorder'`
- `aktiveAktionen` = promotions where `status = 'aktiv'`
- `avgMarge` = average of `(price - cost) / price` over products with `price > 0` (fraction)
- `offeneNotifs` = notifications where `status = 'offen'`

"Heute wichtig" = open notifications sorted by priority (`kritisch` > `hoch` > `mittel` >
`niedrig`) then `due` ascending, top 5. "offene" = all open notifications.

## Routing, shell, nav, gating

- `src/app/brickpm/layout.tsx` (server): guards with `requireAppAccess('brickpm')` — on
  failure `redirect('/')` (Next `redirect` must be called outside the try/catch). Renders the
  BrickPM **sidebar shell** in **budp CI** — a neutral-surface sidebar (budp tokens:
  `bg-white`/`dark:bg-neutral-900`, brand-accented active item), NOT the demo's dark blue —
  listing the 10 sections (Cockpit, Sortiment, Aktionen, Marge, Goodies, Wettbewerb,
  Notifications, Schnittstellen, Admin, Demo), Cockpit active; plus a header with a link back
  to the dashboard and the `UserMenu`.
- `src/app/brickpm/page.tsx` = **Cockpit** (KPI cards + Heute wichtig + offene Notifications).
- `src/app/brickpm/[section]/page.tsx` = placeholder ("Dieser Bereich kommt in einer
  späteren Phase.") for the other 9 sections, so the sidebar links resolve.
- **Nav entry:** `UserMenu` gains an optional `canBrickPM?: boolean`; when true it shows a
  "BrickPM" link (to `/brickpm`). The dashboard page computes `getUserAccess(user.id)` and
  passes `canBrickPM={!!access.apps.brickpm}`. The BrickPM shell renders `UserMenu` with
  `canBrickPM` and a "Dashboard" link.
- The sidebar is a small BrickPM-scoped component; it uses budp tokens (brand accent, neutral
  palette) — **not** the demo's blue.

## Grandfather-hardening (`src/lib/groups.ts`)

Change `getUserAccess`: when the user has **no membership rows**, no longer return full admin
unconditionally. Instead check the global group count — `SELECT count(*)::int FROM groups`;
if `0` (a truly empty system) → full admin (fresh-install safety net); otherwise → **no
access** (`{ apps: {}, isAdmin: false }`). Since the schema seeds `Alle Nutzer`, backfill ran,
and `createUser` auto-adds, every real user has a membership — so this only removes the
escalation path (emptying a user's memberships no longer grants admin). Update the
`getUserAccess` tests accordingly (the "no membership" case now needs a second mocked query
for the group count and asserts full-admin only when count is 0).

## Deploy

`migrate` (via `deploy.sh`) creates the `bpm_` tables. After it, the deploy must run
`npm run seed-groups` **and** `npm run seed-brickpm`. Since `deploy.sh` lives on the VPS
(`/opt/budp/deploy.sh`, not in the repo), add both seed steps to it at deploy time; document
this in the plan's verification task.

## Testing (Vitest)

- **RLS (`tests/db/rls.test.ts`):** each `bpm_` table denies `authenticated` (`SET ROLE`).
- **Pure stats (`tests/brickpm/cockpit.test.ts`):** `computeCockpitStats` over fixture
  products/notifications yields the exact 6 KPIs and the Heute-wichtig ordering.
- **Repository (DB integration):** seed a couple rows, `getCockpit()` returns matching stats.
- **Grandfather-hardening (`tests/lib/groups.test.ts`):** no membership + groups exist → no
  access; no membership + zero groups → full admin; membership cases unchanged.
- **Seed script**: not unit-tested (matches repo convention for `scripts/*`); exercised in
  the verification task.
- Build + `tsc` clean; browser check of `/brickpm` in the verification task.

## Files

- Modify: `db/schema.sql`, `db/rls.sql`, `tests/db/rls.test.ts`, `src/lib/groups.ts`,
  `tests/lib/groups.test.ts`, `src/components/UserMenu.tsx`, `src/app/page.tsx` (pass
  `canBrickPM`), `package.json` (add `seed-brickpm`).
- Create: `src/brickpm/types.ts`, `src/brickpm/seed-data.ts` (extracted fixture),
  `src/brickpm/repository.ts`, `src/brickpm/cockpit.ts` (pure stats),
  `scripts/seed-brickpm.ts`, `src/app/brickpm/layout.tsx`, `src/app/brickpm/page.tsx`,
  `src/app/brickpm/[section]/page.tsx`, `src/components/BpmSidebar.tsx`,
  `tests/brickpm/cockpit.test.ts`, `tests/brickpm/repository.test.ts`.

## Risks

- **Grandfather change locking someone out** — mitigated: all prod users are backfilled into
  `Alle Nutzer` (admin), so they have memberships and are unaffected; the zero-groups net
  covers fresh installs. Verify on deploy that the current users still resolve to admin.
- **Prod migration** — additive `bpm_` tables + idempotent seed; safe under `deploy.sh`.
- **Gating regression on the KPI dashboard** — the dashboard is NOT gated; only `/brickpm`
  uses the guard. `getUserAccess` change is verified by unit tests before deploy.
