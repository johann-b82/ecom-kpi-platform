# In-repo deployment config

**Date:** 2026-07-03
**Status:** Approved (design)

## Problem

ecom-platform's production deploy lives only on the VPS: `/opt/budp/deploy.sh`,
`/opt/budp/Dockerfile.app`, and an ad-hoc `docker run`. Nothing is version-
controlled or reviewable. Bring the deploy config into the repo (adopting
lumeapps-platform's in-repo structure) **without changing deploy behavior**.

## Discovered constraints (shape the scope)

1. **Shared reverse proxy.** A single `mocafe-caddy-1` fronts every app on the
   VPS. The budp route lives in `/opt/mocafe/infra/caddy/Caddyfile`
   (`budp.lumeapps.de → budp-app:3000`); `budp-app` publishes no ports and joins
   the shared `mocafe_internal` network. ecom does **not** own its proxy → no
   Caddyfile in this repo (documented as an external dependency instead).
2. **One image for web + migrate + sync.** The same `budp-app:local` image runs
   `npm run start` (web), `npm run migrate` (deploy), and the hourly cron
   `npm run sync-runner`, which spawns `npm run sync:<connector>` subprocesses
   (`src/lib/sync/runner.ts`). So **no Next `standalone` output** — the image must
   keep `npm`, `tsx`, `scripts/`, and full `node_modules`.

## Current wiring to reproduce exactly

- Image: `node:22-slim`, `npm ci`, `COPY . .`, build args `NEXT_PUBLIC_SUPABASE_URL`
  (= `https://budp.lumeapps.de`) + `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `npm run build`,
  `npm run start` on 3000.
- Container `budp-app`: `restart unless-stopped`, `env_file /opt/budp/app.env`,
  networks `supabase_default` (Supabase; `DATABASE_URL` host = `supabase-db`) +
  `mocafe_internal` (shared proxy), **no published ports**.
- Deploy order: git pull → build → `migrate` → `seed-groups` → `seed-brickpm` →
  recreate `budp-app` → wait for "Ready in" → curl `https://budp.lumeapps.de/login`.

## Files (in repo)

- `Dockerfile.prod` (repo root) — the current `Dockerfile.app`, cleaned: adds
  `ENV NEXT_TELEMETRY_DISABLED=1`, comments; keeps full image + `npm run start`.
- `deploy/docker-compose.prod.yml` — one `app` service:
  - `build: { context: .., dockerfile: Dockerfile.prod, args: {NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY} }`
  - `image: budp-app:local` (so the existing cron `docker run … budp-app:local npm run sync-runner` keeps working unchanged)
  - `container_name: budp-app`, `restart: unless-stopped`, `env_file: ${APP_ENV_FILE:-/opt/budp/app.env}`
  - `networks: [supabase_default, mocafe_internal]`, both declared `external: true`
  - no `ports`
- `deploy/deploy.sh` — in-repo replacement for `/opt/budp/deploy.sh`:
  sources `APP_ENV_FILE`, `git pull --ff-only`, `docker compose -f
  deploy/docker-compose.prod.yml build`, `run --rm app npm run migrate` /
  `seed-groups` / `seed-brickpm`, `docker rm -f budp-app` (clears the pre-compose
  container on first cutover), `compose up -d`, wait-for-ready, health curl.
- `deploy/README.md` — prerequisites, the **shared-proxy route contract**
  (`budp.lumeapps.de { reverse_proxy budp-app:3000 }` lives in `/opt/mocafe`),
  the deploy command, the rollback (old `/opt/budp/deploy.sh.bak`), and why no
  standalone / no owned Caddyfile.
- `.dockerignore` (repo root) — exclude `.git`, `node_modules`, `.next`,
  `.claude`, `docs`, `*.md`, test output so `COPY . .` stays lean (create if
  absent).

## Build-arg / secret flow

`deploy.sh` does `set -a; source "$APP_ENV_FILE"; set +a` before compose, so
`docker compose build` interpolates `NEXT_PUBLIC_SUPABASE_URL` /
`NEXT_PUBLIC_SUPABASE_ANON_KEY` from app.env into the build args. Runtime secrets
reach the container via `env_file`. `app.env` stays on the VPS, never committed.

## Cutover & rollback

The change is additive to the repo; it takes effect only when someone runs
`deploy/deploy.sh` on the VPS. First run removes the old `docker run`-created
`budp-app` before `compose up`. If anything fails, the old `/opt/budp/deploy.sh`
(kept as `.bak`) still works against the unchanged `budp-app:local` image.
After a verified cutover, the server-side `/opt/budp/deploy.sh` and
`Dockerfile.app` become redundant (removed manually, out of this change).

## Testing / verification

No unit-testable logic (infra config). Verification:
- `docker compose -f deploy/docker-compose.prod.yml config` parses cleanly.
- `docker build -f Dockerfile.prod .` succeeds locally.
- Live (VPS, per the deploy-on-VPS rule): run `deploy/deploy.sh`; assert
  `budp-app` is attached to both `supabase_default` and `mocafe_internal`,
  `/login → 200`, and a manual `npm run sync:woocommerce` still runs (proves the
  image kept npm/tsx/scripts).

## Out of scope

Next `standalone` output; owning/duplicating the shared Caddy; the `src/apps`
registry alignment item; removing the server-side legacy deploy files.
