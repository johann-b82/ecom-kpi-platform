# In-Repo Deployment Config Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Version-control ecom-platform's production deploy (Dockerfile.prod + deploy/docker-compose.prod.yml + deploy/deploy.sh + README) reproducing the current VPS setup byte-for-byte.

**Architecture:** One full (non-standalone) image `budp-app:local` runs web + migrate + connector syncs. A compose service names the container `budp-app`, joins the external `supabase_default` + `mocafe_internal` networks, publishes no ports (shared mocafe-caddy fronts it), and reads `/opt/budp/app.env`.

**Tech Stack:** Docker, docker compose v2, Next.js 14 (`next start`), node:22-slim.

## Global Constraints

- Image is NOT Next `standalone` — keep `npm`, `tsx`, `scripts/`, full `node_modules` (migrate + `sync-runner` need them).
- Do NOT set `NODE_ENV=production` before `npm ci` (would drop the devDependencies the build needs).
- Container name MUST be `budp-app` (shared Caddyfile routes `budp.lumeapps.de → budp-app:3000`).
- Image tag MUST stay `budp-app:local` (hourly cron runs `docker run … budp-app:local npm run sync-runner`).
- No published ports. Networks `supabase_default` + `mocafe_internal`, both `external: true`.
- `NEXT_PUBLIC_SUPABASE_URL` build arg = `https://budp.lumeapps.de` (from app.env); secrets via `env_file`; `app.env` never committed.
- Deploy on the VPS only (never local).

---

### Task 1: `.dockerignore` + `Dockerfile.prod`

**Files:**
- Modify: `.dockerignore`
- Create: `Dockerfile.prod`

- [ ] **Step 1: Extend `.dockerignore`** (currently `node_modules`, `.next`, `.git`) to:

```
node_modules
.next
.git
.claude
docs
tests
*.md
tsconfig.tsbuildinfo
.dev-server.log
```

- [ ] **Step 2: Create `Dockerfile.prod`:**

```dockerfile
# Production image for the budp app. Single FULL image (NOT Next standalone):
# the same image also runs `npm run migrate` on deploy and `npm run sync-runner`
# (which spawns `npm run sync:<connector>`) from the hourly cron, so npm, tsx,
# scripts/ and node_modules must stay present. NODE_ENV is intentionally left
# unset so `npm ci` still installs the devDependencies the Next build needs.
FROM node:22-slim
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json* ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* are inlined into the client bundle at build time.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "start"]
```

- [ ] **Step 3: Verify the image builds** (dummy public build args — the URL/key only affect the client bundle):

Run:
```bash
docker build -f Dockerfile.prod \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=https://budp.lumeapps.de \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
  -t budp-app:plantest .
```
Expected: build succeeds through `npm run build` (Next compiles, "Compiled successfully").

- [ ] **Step 4: Remove the test image + commit**

```bash
docker rmi budp-app:plantest >/dev/null 2>&1 || true
git add .dockerignore Dockerfile.prod
git commit -m "feat: in-repo production Dockerfile.prod (full image, non-standalone)"
```

---

### Task 2: `deploy/docker-compose.prod.yml`

**Files:**
- Create: `deploy/docker-compose.prod.yml`

- [ ] **Step 1: Create the compose file:**

```yaml
# Production deploy for the budp app on the shared mocafe VPS.
# Fronted by the shared mocafe-caddy proxy (budp.lumeapps.de → budp-app:3000),
# so no ports are published. Run via deploy/deploy.sh.
services:
  app:
    build:
      context: ..
      dockerfile: Dockerfile.prod
      args:
        NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
        NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
    image: budp-app:local
    container_name: budp-app
    restart: unless-stopped
    env_file: ${APP_ENV_FILE:-/opt/budp/app.env}
    networks:
      - supabase_default
      - mocafe_internal

networks:
  supabase_default:
    external: true
  mocafe_internal:
    external: true
```

- [ ] **Step 2: Validate compose config** (provide a throwaway env so interpolation + env_file resolve):

Run:
```bash
printf 'DATABASE_URL=x\nCREDENTIALS_KEY=x\n' > /tmp/budp-plantest.env
APP_ENV_FILE=/tmp/budp-plantest.env NEXT_PUBLIC_SUPABASE_URL=https://budp.lumeapps.de NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy \
  docker compose -f deploy/docker-compose.prod.yml config >/dev/null && echo "compose config OK"
rm -f /tmp/budp-plantest.env
```
Expected: `compose config OK` (no schema/interpolation errors).

- [ ] **Step 3: Commit**

```bash
git add deploy/docker-compose.prod.yml
git commit -m "feat: in-repo docker-compose.prod.yml (budp-app, shared networks, no ports)"
```

---

### Task 3: `deploy/deploy.sh` + `deploy/README.md`

**Files:**
- Create: `deploy/deploy.sh` (executable)
- Create: `deploy/README.md`

- [ ] **Step 1: Create `deploy/deploy.sh`:**

```bash
#!/usr/bin/env bash
# In-repo budp deploy: git pull -> build -> migrate -> seed -> recreate -> health.
# Runs on the VPS. Reproduces the legacy /opt/budp/deploy.sh, compose-driven.
set -euo pipefail
REPO_DIR="$(cd "$(dirname "$0")/.." && pwd)"
export APP_ENV_FILE="${APP_ENV_FILE:-/opt/budp/app.env}"
PUBLIC_URL="https://budp.lumeapps.de"
set -a; source "$APP_ENV_FILE"; set +a
cd "$REPO_DIR"
COMPOSE="docker compose -f deploy/docker-compose.prod.yml"
echo "==> git pull";      git pull --ff-only
echo "==> build";         $COMPOSE build
echo "==> migrate";       $COMPOSE run --rm app npm run migrate
echo "==> seed groups";   $COMPOSE run --rm app npm run seed-groups
echo "==> seed brickpm";  $COMPOSE run --rm app npm run seed-brickpm
echo "==> recreate app";  docker rm -f budp-app >/dev/null 2>&1 || true
$COMPOSE up -d
echo "==> wait ready";    for i in $(seq 1 30); do docker logs budp-app 2>&1 | grep -q "Ready in" && break; sleep 2; done
echo "==> health";        curl -sS -o /dev/null -w "  /login -> %{http_code}\n" "$PUBLIC_URL/login" || true
echo "Done ($(git rev-parse --short HEAD))."
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x deploy/deploy.sh`

- [ ] **Step 3: Create `deploy/README.md`:**

```markdown
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

Runs: git pull → build `budp-app:local` → migrate → seed-groups → seed-brickpm →
recreate `budp-app` → health check.

## Notes

- **Not** a Next `standalone` image: the same image runs `npm run migrate` and
  the hourly cron `npm run sync-runner` (→ `npm run sync:<connector>`), so npm,
  tsx and `scripts/` must stay in the image.
- **No owned Caddyfile:** the reverse proxy is the shared mocafe-caddy; this repo
  only documents the route contract above.
- **Rollback:** the legacy `/opt/budp/deploy.sh` (kept as `.bak`) still works
  against the unchanged `budp-app:local` image.
```

- [ ] **Step 4: Commit**

```bash
git add deploy/deploy.sh deploy/README.md
git commit -m "feat: in-repo deploy.sh + deploy README (shared-proxy documented)"
```

---

### Task 4: Live cutover + verification (VPS)

- [ ] **Step 1: Merge the PR to `main`** (needs user authorization).

- [ ] **Step 2: On the VPS, run the new in-repo deploy** (the repo checkout is `/opt/budp/app`):

```bash
ssh root@194.164.204.249 'cd /opt/budp/app && APP_ENV_FILE=/opt/budp/app.env bash deploy/deploy.sh'
```
Expected: build → migrate → seeds → up → `/login -> 200` → `Done (<sha>)`.

- [ ] **Step 3: Verify wiring reproduced exactly**

```bash
ssh root@194.164.204.249 'docker inspect budp-app --format "networks={{range \$k,\$v := .NetworkSettings.Networks}}{{\$k}} {{end}} restart={{.HostConfig.RestartPolicy.Name}} ports={{.HostConfig.PortBindings}}"'
```
Expected: `networks=` includes both `supabase_default` and `mocafe_internal`; `restart=unless-stopped`; `ports=map[]`.

- [ ] **Step 4: Prove the image still runs a connector sync** (npm/tsx/scripts present):

```bash
ssh root@194.164.204.249 'timeout 120 docker run --rm --network supabase_default --env-file /opt/budp/app.env budp-app:local npm run sync:woocommerce 2>&1 | tail -3'
```
Expected: an "Incremental sync … Done (incremental)." line (watermarks set from the earlier backfill), exit 0.

---

## Notes

- No unit tests: this is infra config. Verification is build + compose config + live cutover.
- After a verified cutover, the server-side `/opt/budp/deploy.sh` and `Dockerfile.app` are redundant — remove them manually (out of scope here).
