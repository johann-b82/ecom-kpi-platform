# Deployment (budp — https://budp.lumeapps.de)

Deploys the Next app as `budp-app` on the shared **mocafe** VPS.

## Prerequisites (already present on the VPS)

- The self-hosted Supabase stack on the external `supabase_default` network
  (`DATABASE_URL` host = `supabase-db`).
- The shared `mocafe-caddy` reverse proxy on the external `mocafe_internal`
  network. **Routing contract** (lives in `/opt/mocafe/infra/caddy/Caddyfile`,
  not this repo): `budp.lumeapps.de { reverse_proxy budp-app:3000 }`.
- `/opt/budp/app.env` — runtime secrets (`DATABASE_URL`, `DATABASE_SSL`,
  `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`, `CREDENTIALS_KEY`). Never committed.

## Deploy

```bash
# on the VPS, from the repo checkout (default APP_ENV_FILE=/opt/budp/app.env)
deploy/deploy.sh
```

Runs: git pull → build `budp-app:local` → migrate → seed-groups →
recreate `budp-app` → health check.

## Notes

- **Not** a Next `standalone` image: the same image runs `npm run migrate` and
  the hourly cron `npm run sync-runner` (→ `npm run sync:<connector>`), so npm,
  tsx and `scripts/` must stay in the image.
- **No owned Caddyfile:** the reverse proxy is the shared mocafe-caddy; this repo
  only documents the route contract above.
- **Rollback:** the legacy `/opt/budp/deploy.sh` (kept as `.bak`) still works
  against the unchanged `budp-app:local` image.
