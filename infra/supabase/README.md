# Self-Hosted Supabase Stack

Trimmed self-hosting compose vendored from upstream `v1.24.09`.

## Services kept

| Service | Image | Role |
|---------|-------|------|
| db | supabase/postgres:15.1.1.78 | Postgres 15 database |
| auth | supabase/gotrue:v2.158.1 | Auth (GoTrue) |
| rest | postgrest/postgrest:v12.2.0 | PostgREST API |
| kong | kong:2.8.1 | API gateway |
| studio | supabase/studio:20240923-2e3e90c | Dashboard UI |
| meta | supabase/postgres-meta:v0.83.2 | DB introspection |

Services removed from upstream: realtime, storage, imgproxy, vector, analytics (logflare), functions, supavisor.

## Prerequisites

- Docker with Compose v2 (`docker compose` command available)
- Node.js (for secret generation)
- Port 5432 free (Postgres) — note: kpi-sb-pg runs on 5433 and must not be stopped
- Port 8000 free (Kong)
- Port 3001 free (Studio — mapped to 3001 on the host to avoid clashing with the Next.js app on 3000)

## First-time setup

### 1. Copy the example env

```bash
cd infra/supabase
cp .env.example .env
```

### 2. Generate secrets

```bash
# Generate POSTGRES_PASSWORD
POSTGRES_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")

# Generate JWT_SECRET
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
export JWT_SECRET

# Derive ANON_KEY and SERVICE_ROLE_KEY from JWT_SECRET
node -e '
const c=require("crypto"); const s=process.env.JWT_SECRET;
const b64=o=>Buffer.from(JSON.stringify(o)).toString("base64url");
const sign=role=>{const h=b64({alg:"HS256",typ:"JWT"});const now=Math.floor(Date.now()/1000);
  const p=b64({role,iss:"supabase",iat:now,exp:now+3600*24*3650});
  const sig=c.createHmac("sha256",s).update(h+"."+p).digest("base64url");return h+"."+p+"."+sig;};
console.log("ANON_KEY="+sign("anon")); console.log("SERVICE_ROLE_KEY="+sign("service_role"));'
```

Edit `.env` and paste in all four values: `POSTGRES_PASSWORD`, `JWT_SECRET`, `ANON_KEY`, `SERVICE_ROLE_KEY`.

Also set the following overrides in `.env`:
```
DISABLE_SIGNUP=true
ENABLE_EMAIL_AUTOCONFIRM=true
ENABLE_EMAIL_SIGNUP=true
SITE_URL=http://localhost:3000
```

## Starting the stack

```bash
cd infra/supabase
docker compose up -d
```

## Exposed ports

| Port | Service | Notes |
|------|---------|-------|
| 5432 | Postgres (db) | user `postgres`, db `postgres` |
| 8000 | Kong (API gateway) | primary entry point for app |
| 8443 | Kong HTTPS | |
| 3001 | Studio dashboard | mapped from container 3000 to avoid clash with Next.js app |

The Next.js application connects via Kong at `http://localhost:8000`.

## Verification

```bash
# Postgres is ready
docker compose exec db pg_isready -U postgres

# GoTrue health via Kong
curl -s http://localhost:8000/auth/v1/health
```

## Obtaining keys

`ANON_KEY` and `SERVICE_ROLE_KEY` are generated once during setup and stored in `.env` (git-ignored). The app reads them from env variables at build/runtime. Refer to `sdd/task-1-report.md` for the keys generated for the current environment.

## Git-ignored files

The following are never committed:
- `infra/supabase/.env` — contains secrets
- `infra/supabase/volumes/db/data/` — Postgres data directory
