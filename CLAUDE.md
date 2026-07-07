# Project instructions

KPI dashboard that unifies e-commerce data sources (Shopware, GA4, Meta/TikTok/Google Ads, Klaviyo, WooCommerce, Mailchimp) along the **SEE · THINK · DO · CARE** customer-journey framework. Next.js 14 (App Router) + TypeScript + Tailwind + Recharts, self-hosted Supabase (Postgres, GoTrue, PostgREST, Kong). UI language is **German**.

## Environments

| Environment | Host | Path | Purpose |
|---|---|---|---|
| **Dev VPS** (this machine) | `root@31.70.108.191` | `/root/ecom-platform` | Development, tests, dev deployments |
| **Production** | `root@194.164.204.249` (SSH alias `prod`) | `/opt/budp` | Live at https://budp.lumeapps.de |

- Develop and run the app stack **on the dev VPS only**. Dev deployments via Docker here are fine and encouraged as part of testing.
- **Production is client-facing.** Never deploy to production without explicit user confirmation.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm test` | Vitest suite (KPI engine, crypto, RLS via `SET ROLE`, middleware, connectors) |
| `npm run migrate` | Apply `db/schema.sql` + `db/rls.sql` (idempotent) |
| `npm run seed` | Insert demo data |
| `npm run create-user` | Seed the initial user from `LOCAL_USER_EMAIL`/`LOCAL_USER_PASSWORD` |
| `npm run sync:<source>` | Pull from `shopware`/`ga4`/`klaviyo`/`meta`/`tiktok`/`google` → canonical DB |

Local stack: `docker compose up -d` in `infra/supabase/` (self-hosted Supabase), then app env from `.env.example`. Node.js **22+** required.

## Architecture rules

- **Reads** go through `supabase-js` with the user session → **RLS applies**. **Writes** (syncs, migrations) use the privileged `pg` connection.
- KPI logic lives in **pure functions** per phase: `src/kpi/{see,think,do,care}.ts`; `computeKpis(data, range)` adds period-over-period deltas. Keep KPI functions pure — no I/O.
- Connector pattern (`src/connectors/`): `fetch → normalize → canonical dataset → transactional DB replace` of only that source's rows. New connectors follow this shape exactly.
- Connector credentials are **AES-256-GCM encrypted** in `connector_credentials` / `oauth_connections` (key = `CREDENTIALS_KEY`). Plaintext never leaves the server; secret fields are never returned over the API.
- Auth: Supabase email/password, public signup disabled, Next.js middleware gates every route except `/login` + static assets.

## Security

- **No secrets in the repo** — only `.env.example` placeholders. Runtime secrets live in `.env` (dev) / `/opt/budp/app.env` (prod, root-only).
- Postgres is never exposed publicly; RLS denies `anon` everywhere.

## Testing & CI

- Done = `npm test` green **and** `npm run build` passes. CI (GitHub Actions) runs `npm ci → migrate → seed → test → build` against a disposable Postgres — the full Supabase stack is not needed for tests.
- Write the failing test first (see global TDD guidelines).

## Git workflow

- Work in worktrees/branches, deliver via PR, never push `main`. Conventional commits.
- Specs and plans live in `docs/superpowers/{specs,plans}/` — check there for prior design decisions before starting related work.

## Production deployment

Only after merge to `main` and with user confirmation:

```bash
ssh prod '/opt/budp/deploy.sh'
# ==> git pull → build image → migrate → seed groups/brickpm → recreate budp-app container → health check
```

Verify afterwards: `curl -s -o /dev/null -w "%{http_code}" https://budp.lumeapps.de/login` → `200`.
