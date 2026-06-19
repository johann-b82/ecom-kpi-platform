# Unified Data Platform

[![CI](https://github.com/johann-b82/ecom-kpi-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/johann-b82/ecom-kpi-platform/actions/workflows/ci.yml)
[![Live](https://img.shields.io/badge/live-budp.lumeapps.de-D9004C)](https://budp.lumeapps.de)
[![Next.js 14](https://img.shields.io/badge/Next.js-14-000000?logo=next.js)](https://nextjs.org)
[![Supabase](https://img.shields.io/badge/Supabase-self--hosted-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)
[![Node 22+](https://img.shields.io/badge/Node-22%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)

> **Own the core.** A KPI dashboard that unifies e‑commerce data sources along the **SEE · THINK · DO · CARE** customer‑journey framework.

It pulls data from a shop (Shopware), web analytics (GA4), ad platforms (Meta / TikTok / Google Ads) and e‑mail/CRM (Klaviyo) into one canonical model, computes the typical KPIs per journey phase (with period‑over‑period deltas), and renders them in a themeable dashboard. Connector credentials are stored **AES‑256‑GCM‑encrypted**; the whole app sits behind **Supabase Auth** with **Row‑Level‑Security**.

---

## Table of contents

- [Stack](#stack)
- [Architecture](#architecture)
- [Features](#features)
- [Local development](#local-development)
- [Configuration](#configuration)
- [Commands](#commands)
- [Connectors](#connectors)
- [Auth & branding](#auth--branding)
- [Production deployment](#production-deployment)
- [Updating production](#updating-production)
- [Security model](#security-model)
- [Testing & CI](#testing--ci)
- [Project structure](#project-structure)

---

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind** + **Tremor** (charts)
- **Self‑hosted Supabase**: Postgres + **GoTrue** (auth) + **PostgREST** + **Kong** (gateway)
- **`@supabase/ssr`** for cookie‑based sessions; **`pg`** for server‑side writes / migrations
- **Vitest** (tests), **tsx** (scripts), **Docker Compose**, **GitHub Actions** (CI)
- **Node.js 22+** required (`@supabase/supabase-js` needs native WebSocket — absent on Node 20)

## Architecture

```
Browser ──HTTPS──► Reverse proxy (TLS) ──► Next.js app  (dashboard, /api, middleware gate)
                              └─ /auth/*, /rest/* ─► Supabase Kong ─► GoTrue / PostgREST ─► Postgres
Sync CLI (tsx) ───────────────────────────────────────────────────► Postgres (privileged, RLS bypassed)
```

- **Auth:** Supabase email/password (public signup disabled, users created via a script). Next.js **middleware** gates every route except `/login` + static assets — unauthenticated pages redirect to `/login`, `/api/*` returns `401`.
- **Reads:** user‑facing KPI reads go through `supabase-js` with the user's session → **RLS** applies (`authenticated → read`, `anon` denied).
- **Writes:** connector syncs / migrations use a privileged `pg` connection (RLS bypassed).
- **Credential vault:** `connector_credentials` holds AES‑256‑GCM ciphertext (key = `CREDENTIALS_KEY` env). Plaintext never leaves the server.
- **KPI engine:** pure functions per phase (`src/kpi/{see,think,do,care}.ts`); `computeKpis(data, range)` adds deltas vs. the previous period.

## Features

- Dashboard with **SEE/THINK/DO/CARE** columns, per‑KPI tooltips (calculation + data source), and a drill‑down per phase.
- Date‑range filter (7 / 30 / 90 days) with German date formatting.
- **Einstellungen** page: configure connector credentials (masked/encrypted) **and** branding — **logo, headline, subline and accent color** are editable and apply to the dashboard *and* the login screen.
- Light/dark theme toggle in a round avatar user menu.
- Six connectors, each: `fetch → normalize → canonical dataset → transactional DB replace`.

## Local development

**Prerequisites:** Docker + Docker Compose, Node.js 22+.

```bash
# 1. clone
git clone https://github.com/johann-b82/ecom-kpi-platform.git && cd ecom-kpi-platform
npm install

# 2. bring up the self-hosted Supabase stack
cd infra/supabase
cp .env.example .env          # then set POSTGRES_PASSWORD, JWT_SECRET, ANON_KEY, SERVICE_ROLE_KEY
#   (generate ANON_KEY/SERVICE_ROLE_KEY from JWT_SECRET — see Supabase self-hosting docs)
#   set DISABLE_SIGNUP=true, ENABLE_EMAIL_AUTOCONFIRM=true, SITE_URL=http://localhost:3000
docker compose up -d
cd ../..

# 3. app env
cp .env.example .env          # set DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL/ANON_KEY,
#   SUPABASE_SERVICE_ROLE_KEY, CREDENTIALS_KEY, LOCAL_USER_EMAIL/PASSWORD

# 4. schema + RLS, demo data, and the initial user
npm run migrate               # applies db/schema.sql + db/rls.sql
npm run seed                  # optional demo data
npm run create-user           # creates LOCAL_USER_EMAIL with LOCAL_USER_PASSWORD

# 5. run
npm run dev                   # http://localhost:3000  →  log in  →  dashboard
```

## Configuration

All secrets come from env (nothing is hardcoded). Generate the AES key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection for migrate/seed/sync (privileged) |
| `DATABASE_SSL` | `require` to enable TLS (remote Postgres); empty for local |
| `NEXT_PUBLIC_SUPABASE_URL` | Public Supabase/Kong URL (browser + server client) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Service‑role JWT (admin user creation) |
| `CREDENTIALS_KEY` | 32‑byte base64 — master key for the AES credential vault |
| `LOCAL_USER_EMAIL` / `LOCAL_USER_PASSWORD` | Initial dashboard user (for `create-user`) |

> **Connector credentials are NOT set via env.** They are entered in **Einstellungen → Verbindungen** and stored encrypted in the database.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm test` | Vitest suite |
| `npm run migrate` | Apply `db/schema.sql` + `db/rls.sql` (idempotent) |
| `npm run seed` | Insert demo data |
| `npm run create-user` | Create/seed the initial user (idempotent) |
| `npm run sync:shopware` | Pull live data from Shopware → canonical DB |
| `npm run sync:{ga4,klaviyo,meta,tiktok,google}` | Pull from the respective source |

## Connectors

| Phase | Source | Connector |
|---|---|---|
| Shop / orders | Shopware 6 (Admin API) | `sync:shopware` |
| Web analytics | Google Analytics 4 | `sync:ga4` |
| Advertising | Meta / TikTok / Google Ads | `sync:meta` / `sync:tiktok` / `sync:google` |
| E‑mail & CRM | Klaviyo | `sync:klaviyo` |

Each connector reads its credentials from the encrypted vault, fetches, normalizes to the canonical model (`daily_metrics`, `orders`, `customers`, `ad_spend`, `subscribers`) and replaces only its own source's rows in a transaction.

## Auth & branding

- **Auth:** Supabase email/password. Public signup is disabled — create users with `npm run create-user`. A new user gets full read access (single shared access level; no roles).
- **Branding:** logo (image upload, stored as a data URL), headline, subline and accent color are editable in **Einstellungen → Branding** and stored in the `app_settings` table. They are read server‑side and apply to both the dashboard and the (unauthenticated) login screen.

## Production deployment

The app is **live at https://budp.lumeapps.de**. Deployment pattern (single domain, one TLS cert):

1. **Self‑hosted Supabase stack** + the **Next app** run as Docker containers; Postgres is bound to localhost only (never exposed publicly).
2. A **reverse proxy with automatic TLS** (e.g. Caddy) terminates HTTPS on the domain and routes:
   - `/auth/*` and `/rest/*` → Supabase **Kong**
   - everything else → the **Next app** (`:3000`)
   so `NEXT_PUBLIC_SUPABASE_URL` is simply the site's own URL.
3. The app image is built with the public Supabase URL/anon key baked in (`next build` inlines `NEXT_PUBLIC_*`).
4. Data and the AES `CREDENTIALS_KEY` can be carried over from another environment so the encrypted connector credentials keep decrypting.

Runtime secrets live in an `app.env` file (root‑only, never committed).

## Updating production

A single script pulls the latest code, rebuilds, runs migrations and recreates the app container:

```bash
./deploy.sh
# ==> git pull → build image → migrate (schema+rls) → recreate app container → health check
```

So the day‑to‑day workflow is: merge to `main` → run `deploy.sh` on the server → live. Schema changes are migrated automatically (migrations are idempotent).

## Security model

- **No secrets in the repo.** `.env` files are git‑ignored; only `.env.example` placeholders are committed. CI uses dummy values.
- **Auth gate:** middleware validates the session with `getUser()` (server‑verified, not just the cookie). No unauthenticated path reaches a protected page or business API.
- **RLS:** the five KPI tables allow `authenticated` read only; `anon` is denied. `connector_credentials` and `app_settings` have RLS enabled with **no** public policy — reachable only via the privileged server‑side connection.
- **Vault:** connector secrets are AES‑256‑GCM encrypted; secret fields are never returned over the API and are masked in the UI.

## Testing & CI

```bash
npm test          # Vitest — KPI engine (pure), crypto, RLS (SET ROLE), middleware, connectors, settings
```

GitHub Actions runs `npm ci → migrate → seed → test → build` on every push/PR against a disposable Postgres service. The full Supabase stack is **not** required for CI: RLS is exercised via `SET ROLE`, and auth/login are mocked.

## Project structure

```
src/
  app/            # routes: dashboard, /login, /setup (Einstellungen), /api/*
  components/     # UI: BrandHeader, UserMenu, KpiCard, Filters, CredentialsForm, BrandingForm, …
  kpi/            # canonical model + pure KPI functions (see/think/do/care) + repository
  connectors/     # per-source fetch → normalize → write
  lib/            # db (pg), supabase clients, crypto, credentials, settings, dates
  middleware.ts   # Supabase auth gate
db/               # schema.sql + rls.sql
infra/supabase/   # vendored self-hosted Supabase stack (trimmed)
scripts/          # migrate, seed, create-user, sync-*
```
