# Self-hosted Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the KPI platform from a slim Docker-Postgres + Auth.js onto a self-hosted Supabase stack (Postgres + GoTrue email/password auth + Row-Level-Security), keeping the existing AES credential vault.

**Architecture:** Three sequential, each-independently-shippable phases. Phase 1 repoints the database at Supabase Postgres (Auth.js stays). Phase 2 replaces Auth.js with Supabase Auth (email/password, signups off, manual user) via `@supabase/ssr`. Phase 3 routes user-facing reads through `supabase-js` with RLS enforced; sync writes stay on a privileged `pg` connection.

**Tech Stack:** Next.js 14 App Router, TypeScript, `@supabase/supabase-js` + `@supabase/ssr`, self-hosted Supabase (Postgres 15 / GoTrue / PostgREST / Kong), `pg` (sync/migrate/seed), Vitest, tsx, Docker Compose.

## Global Constraints

- Self-hosted Supabase runs **locally now, remote-ready**: every URL/key/secret comes from env, nothing hardcoded.
- Auth is **GoTrue email/password**, public signup **disabled**, the initial user created via a script; local auto-confirm (no SMTP). **No OAuth in this migration.** No roles, no per-user data partitioning.
- Access model: **all authenticated users read all data.** RLS `authenticated → SELECT`; `anon` has no access. Writes only via the privileged `postgres`/service-role connection.
- The **AES-256-GCM credential vault stays** (`src/lib/crypto.ts`, `CREDENTIALS_KEY`). `connector_credentials` moves into the Supabase DB. **No Supabase Vault.**
- **Credential-path deviation from spec (flagged):** `src/lib/credentials.ts` stays on the privileged `pg` path (shared by both the sync CLI and the `/api/credentials` route — it stores ciphertext only and is already middleware-gated). RLS is still **enabled** on `connector_credentials` with **no** `anon`/`authenticated` policy, so PostgREST/public access is denied; only the privileged connection (which bypasses RLS) reads it. This avoids duplicating the credential logic across a pg path (sync) and a supabase-js path (route).
- Client-exposed env vars use the `NEXT_PUBLIC_` prefix (required by Next.js to inline them into the browser bundle): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Server-only: `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `CREDENTIALS_KEY`, `LOCAL_USER_EMAIL`, `LOCAL_USER_PASSWORD`.
- Path alias `@/* → src/*` (tsconfig). Dark theme / emerald accents for any new UI, matching the dashboard.
- TDD, frequent commits, conventional commit messages. Vitest runs files serially (`fileParallelism: false`) — DB integration tests share one Postgres.
- Removed by the end: `next-auth` dependency, `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/allowlist.ts`, `tests/lib/allowlist.test.ts`, and the `AUTH_*` env vars.

---

## Phase 1 — Supabase Postgres as the database

### Task 1: Stand up the self-hosted Supabase stack

**Files:**
- Create: `infra/supabase/` (vendored upstream compose + env + volumes)
- Create: `infra/supabase/README.md`
- Modify: `.gitignore` (ignore `infra/supabase/.env` and `infra/supabase/volumes/db/data`)

**Interfaces:**
- Produces: a running stack exposing Kong at `http://localhost:8000`, Postgres at `localhost:5432` (user `postgres`, db `postgres`), plus the generated `ANON_KEY` and `SERVICE_ROLE_KEY` printed for later tasks.

The official compose is large and not our code — fetch it at a pinned ref rather than hand-writing it.

- [ ] **Step 1: Fetch the upstream self-hosting files at a pinned tag**

```bash
cd /Users/johannbechtold/Documents/ecom-platform/.worktrees/supabase-migration
REF=v1.24.07  # pinned supabase CLI/self-hosting tag; adjust only if unavailable
mkdir -p infra
# sparse-checkout just the docker self-hosting dir
git clone --depth 1 --branch "$REF" --filter=blob:none --sparse https://github.com/supabase/supabase.git /tmp/sb-upstream
git -C /tmp/sb-upstream sparse-checkout set docker
cp -R /tmp/sb-upstream/docker infra/supabase
rm -rf /tmp/sb-upstream
ls infra/supabase   # expect: docker-compose.yml  .env.example  volumes/  dev/  ...
```

Expected: `infra/supabase/docker-compose.yml`, `infra/supabase/.env.example`, `infra/supabase/volumes/` exist.

- [ ] **Step 2: Create the stack env from the example and generate secrets**

```bash
cd infra/supabase
cp .env.example .env
# Generate the three required secrets:
POSTGRES_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))")
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")
echo "POSTGRES_PASSWORD=$POSTGRES_PASSWORD"
echo "JWT_SECRET=$JWT_SECRET"
```

Set in `infra/supabase/.env`: `POSTGRES_PASSWORD`, `JWT_SECRET`, and generate matching `ANON_KEY`/`SERVICE_ROLE_KEY` JWTs from `JWT_SECRET` using the helper at <https://supabase.com/docs/guides/self-hosting/docker#generate-api-keys> (roles `anon` and `service_role`, both signed with `JWT_SECRET`). Also set `DISABLE_SIGNUP=true`, `ENABLE_EMAIL_AUTOCONFIRM=true`, `ENABLE_EMAIL_SIGNUP=true`, and `SITE_URL=http://localhost:3000`. Record the generated `ANON_KEY` and `SERVICE_ROLE_KEY` — Task 4/Task 6 need them.

- [ ] **Step 3: Trim unneeded services (YAGNI)**

Edit `infra/supabase/docker-compose.yml`: remove the `realtime`, `storage`, `imgproxy`, `vector`, and `supabase-analytics`/`analytics` service blocks and any `depends_on` references to them in the remaining services. Keep: `db`, `auth` (GoTrue), `rest` (PostgREST), `kong`, `studio`, `meta` (postgres-meta). If `studio`/`kong` declare a hard `depends_on` on a removed service, delete only that dependency line.

- [ ] **Step 4: Bring the stack up and verify**

```bash
cd infra/supabase
docker compose up -d
# wait for db health, then:
docker compose exec db pg_isready -U postgres   # expect: accepting connections
curl -s http://localhost:8000/auth/v1/health    # expect: {"...":"GoTrue is...","...":...} 200
```

Expected: Postgres accepts connections; GoTrue health endpoint returns 200 via Kong.

- [ ] **Step 5: Write the bring-up README**

Create `infra/supabase/README.md` documenting: prerequisites (Docker), `cp .env.example .env` + secret generation, `docker compose up -d`, the exposed ports (Kong 8000, Postgres 5432, Studio 3000-of-the-stack — note Studio's port and that the Next app uses 3000, so map Studio elsewhere if it clashes), and how to obtain `ANON_KEY`/`SERVICE_ROLE_KEY`. Note that `.env` and `volumes/db/data` are git-ignored.

- [ ] **Step 6: Ignore stack secrets and data**

Add to `.gitignore`:
```
infra/supabase/.env
infra/supabase/volumes/db/data/
```

```bash
git check-ignore infra/supabase/.env   # expect: prints the path (ignored)
```

- [ ] **Step 7: Commit**

```bash
git add infra/supabase .gitignore
git commit -m "feat: vendor trimmed self-hosted Supabase stack (db/auth/rest/kong/studio/meta)"
```

Note: `infra/supabase/.env` is intentionally NOT committed. Verify with `git status` that no `.env` is staged.

---

### Task 2: Point the app's database layer at Supabase Postgres

**Files:**
- Modify: `src/lib/db.ts`
- Modify: `docker-compose.yml`
- Modify: `.env.example`
- Test: `tests/lib/db-ssl.test.ts` (new)

**Interfaces:**
- Consumes: Supabase Postgres at `DATABASE_URL` (from Task 1).
- Produces: `pool` (unchanged export) now SSL-aware via `DATABASE_SSL`.

The Supabase Postgres requires TLS when remote. Make SSL env-driven so local (no SSL) and remote (SSL) both work.

- [ ] **Step 1: Write the failing test**

`tests/lib/db-ssl.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { poolSsl } from '@/lib/db';

describe('poolSsl', () => {
  it('returns false when DATABASE_SSL is unset', () => {
    expect(poolSsl(undefined)).toBe(false);
  });
  it('returns rejectUnauthorized:false when DATABASE_SSL=require', () => {
    expect(poolSsl('require')).toEqual({ rejectUnauthorized: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/lib/db-ssl.test.ts`
Expected: FAIL — `poolSsl` is not exported.

- [ ] **Step 3: Implement**

`src/lib/db.ts`:
```ts
import { Pool, type PoolConfig } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';

export function poolSsl(flag: string | undefined): PoolConfig['ssl'] {
  return flag === 'require' ? { rejectUnauthorized: false } : false;
}

export const pool = new Pool({ connectionString, ssl: poolSsl(process.env.DATABASE_SSL) });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/lib/db-ssl.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Update docker-compose + .env.example**

Edit `docker-compose.yml`: remove the entire `db:` service and the app's `depends_on.db` block. Change the app `environment` to:
```yaml
    environment:
      DATABASE_URL: ${DATABASE_URL}
      DATABASE_SSL: ${DATABASE_SSL:-}
      NEXT_PUBLIC_SUPABASE_URL: ${NEXT_PUBLIC_SUPABASE_URL}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      SUPABASE_SERVICE_ROLE_KEY: ${SUPABASE_SERVICE_ROLE_KEY}
      CREDENTIALS_KEY: ${CREDENTIALS_KEY}
    extra_hosts:
      - "host.docker.internal:host-gateway"
```
Add a comment in the file: the Supabase stack runs separately via `infra/supabase` (`docker compose up -d`); for local dev prefer running the Next app on the host (`npm run dev`) against `localhost:8000`/`localhost:5432`.

Edit `.env.example`: replace the first `DATABASE_URL=...` line with:
```
# Supabase Postgres (direct connection for sync/migrate/seed). Local: no SSL.
DATABASE_URL=postgres://postgres:your-postgres-password@localhost:5432/postgres
DATABASE_SSL=
```
(Leave the rest of the file for Task 9 to finish the AUTH_* → SUPABASE_* swap.)

- [ ] **Step 6: Verify migrate + seed + existing DB tests against Supabase Postgres**

```bash
# infra/supabase stack must be up (Task 1). Set DATABASE_URL to the Supabase Postgres.
export DATABASE_URL=postgres://postgres:<pw>@localhost:5432/postgres
npm run migrate   # expect: "Schema applied."
npm run seed      # expect: seed completes
npm test -- tests/lib/schema.test.ts tests/lib/credentials.test.ts tests/lib/load-config.test.ts tests/lib/db-ssl.test.ts
```

Expected: schema applies on Supabase Postgres; the DB integration tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db.ts docker-compose.yml .env.example tests/lib/db-ssl.test.ts
git commit -m "feat: SSL-aware pg pool + point app/compose at Supabase Postgres"
```

---

## Phase 2 — Supabase Auth replaces Auth.js

### Task 3: Add Supabase client factories

**Files:**
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/client.ts`
- Test: `tests/lib/supabase-client.test.ts`
- Modify: `package.json` (deps)

**Interfaces:**
- Produces:
  - `src/lib/supabase/server.ts` → `createClient(): SupabaseClient` (reads cookies via `next/headers`; uses `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
  - `src/lib/supabase/client.ts` → `createClient(): SupabaseClient` (browser).

- [ ] **Step 1: Install dependencies**

```bash
npm install @supabase/supabase-js @supabase/ssr
```
Expected: both added to `package.json` dependencies.

- [ ] **Step 2: Write the failing test**

`tests/lib/supabase-client.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/headers', () => ({
  cookies: () => ({ getAll: () => [], set: () => {} }),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8000';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
});

describe('supabase server client factory', () => {
  it('returns a client exposing auth + from', async () => {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = createClient();
    expect(typeof supabase.auth.getUser).toBe('function');
    expect(typeof supabase.from).toBe('function');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- tests/lib/supabase-client.test.ts`
Expected: FAIL — module `@/lib/supabase/server` not found.

- [ ] **Step 4: Implement the server factory**

`src/lib/supabase/server.ts`:
```ts
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createClient() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // called from a Server Component (read-only cookies) — middleware refreshes the session.
          }
        },
      },
    },
  );
}
```

- [ ] **Step 5: Implement the browser factory**

`src/lib/supabase/client.ts`:
```ts
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/lib/supabase-client.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/lib/supabase tests/lib/supabase-client.test.ts
git commit -m "feat: add @supabase/ssr server + browser client factories"
```

---

### Task 4: Login page + sign-out button

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/components/LoginForm.tsx`
- Modify: `src/components/SignOutButton.tsx`
- Test: `tests/components/login-form.test.tsx`

**Interfaces:**
- Consumes: `createClient` from `@/lib/supabase/client` (Task 3).
- Produces: `/login` route; `LoginForm` (client) calling `signInWithPassword`; `SignOutButton` (client) calling `signOut`.

`useSearchParams` forces the form into a Suspense boundary; the page is a thin server component that wraps the client form.

- [ ] **Step 1: Write the failing test**

`tests/components/login-form.test.tsx`:
```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
const replace = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signInWithPassword } }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams(''),
}));

describe('LoginForm', () => {
  it('signs in with entered email + password and redirects', async () => {
    const { LoginForm } = await import('@/components/LoginForm');
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'a@b.de' } });
    fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.de', password: 'pw' });
      expect(replace).toHaveBeenCalledWith('/');
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/components/login-form.test.tsx`
Expected: FAIL — `@/components/LoginForm` not found.

- [ ] **Step 3: Implement LoginForm**

`src/components/LoginForm.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await createClient().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError('Login fehlgeschlagen. E-Mail oder Passwort prüfen.');
      return;
    }
    router.replace(params.get('redirectTo') ?? '/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-800 bg-neutral-900 p-6">
      <h1 className="text-xl font-bold text-emerald-400">Anmelden</h1>
      <label className="block text-sm text-neutral-300">
        E-Mail
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          className="mt-1 w-full rounded bg-neutral-800 px-3 py-2 text-neutral-100" />
      </label>
      <label className="block text-sm text-neutral-300">
        Passwort
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
          className="mt-1 w-full rounded bg-neutral-800 px-3 py-2 text-neutral-100" />
      </label>
      {error && <p className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy}
        className="w-full rounded bg-emerald-600 px-3 py-2 font-medium text-white hover:bg-emerald-500 disabled:opacity-50">
        {busy ? '…' : 'Anmelden'}
      </button>
    </form>
  );
}
```

- [ ] **Step 4: Implement the login page**

`src/app/login/page.tsx`:
```tsx
import { Suspense } from 'react';
import { LoginForm } from '@/components/LoginForm';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-6">
      <Suspense>
        <LoginForm />
      </Suspense>
    </main>
  );
}
```

- [ ] **Step 5: Rewrite SignOutButton for Supabase**

`src/components/SignOutButton.tsx`:
```tsx
'use client';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

export function SignOutButton({ email }: { email?: string | null }) {
  const router = useRouter();
  async function onClick() {
    await createClient().auth.signOut();
    router.replace('/login');
    router.refresh();
  }
  return (
    <span className="flex items-center gap-2 text-sm text-neutral-400">
      {email && <span>{email}</span>}
      <button type="button" onClick={onClick} className="rounded bg-neutral-800 px-2 py-1 hover:text-emerald-400">
        Abmelden
      </button>
    </span>
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- tests/components/login-form.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/login src/components/LoginForm.tsx src/components/SignOutButton.tsx tests/components/login-form.test.tsx
git commit -m "feat: email/password login page + Supabase sign-out"
```

---

### Task 5: Replace the middleware gate and remove Auth.js

**Files:**
- Modify: `src/middleware.ts`
- Modify: `src/app/page.tsx` (header only — read user via Supabase server client)
- Delete: `src/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/lib/allowlist.ts`, `tests/lib/allowlist.test.ts`
- Modify: `package.json` (remove `next-auth`)
- Test: `tests/middleware.test.ts`

**Interfaces:**
- Consumes: `@supabase/ssr` `createServerClient`; `supabase.auth.getUser()`.
- Produces: a middleware that gates all routes except `/login` + static assets.

- [ ] **Step 1: Write the failing test**

`tests/middleware.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

let user: { email: string } | null = null;
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user } }) } }),
}));

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8000';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon';
});

async function run(path: string) {
  const { middleware } = await import('@/middleware');
  return middleware(new NextRequest(`http://localhost:3000${path}`));
}

describe('middleware auth gate', () => {
  it('redirects unauthenticated page requests to /login', async () => {
    user = null;
    const res = await run('/');
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });
  it('returns 401 JSON for unauthenticated /api requests', async () => {
    user = null;
    const res = await run('/api/kpis');
    expect(res.status).toBe(401);
  });
  it('passes through when authenticated', async () => {
    user = { email: 'a@b.de' };
    const res = await run('/');
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/middleware.test.ts`
Expected: FAIL — current middleware imports `@/auth` (next-auth), not the Supabase mock.

- [ ] **Step 3: Implement the Supabase middleware**

`src/middleware.ts` (replace entire file):
```ts
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    if (request.nextUrl.pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('redirectTo', request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: ['/((?!login|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/middleware.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Update the dashboard header to read the user via Supabase**

In `src/app/page.tsx`, replace the two Auth.js lines. Remove:
```ts
import { auth } from '@/auth';
```
```ts
  const session = await auth();
```
Add the import near the others:
```ts
import { createClient } from '@/lib/supabase/server';
```
Add after the `range` declaration:
```ts
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
```
Change the header usage from `email={session?.user?.email}` to:
```tsx
          <SignOutButton email={user?.email} />
```
(Leave the `loadDataset()` call untouched — Task 8 changes it.)

- [ ] **Step 6: Remove Auth.js files + dependency**

```bash
git rm src/auth.ts 'src/app/api/auth/[...nextauth]/route.ts' src/lib/allowlist.ts tests/lib/allowlist.test.ts
npm uninstall next-auth
```

- [ ] **Step 7: Verify build + full suite**

```bash
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon npm run build
npm test
```
Expected: build compiles the middleware to the Edge runtime; full suite green (allowlist/auth tests gone, middleware test present).

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: Supabase middleware auth gate; remove Auth.js + allowlist"
```

---

### Task 6: Seed the initial user

**Files:**
- Create: `scripts/create-user.ts`
- Modify: `package.json` (script `create-user`)
- Test: `tests/scripts/create-user.test.ts`

**Interfaces:**
- Consumes: `SUPABASE_SERVICE_ROLE_KEY`, `NEXT_PUBLIC_SUPABASE_URL` (or `SUPABASE_URL`), `LOCAL_USER_EMAIL`, `LOCAL_USER_PASSWORD`.
- Produces: `npm run create-user` — idempotent admin user creation.

- [ ] **Step 1: Write the failing test**

`tests/scripts/create-user.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const createUser = vi.fn();
vi.mock('@supabase/supabase-js', () => ({
  createClient: () => ({ auth: { admin: { createUser } } }),
}));

beforeEach(() => {
  vi.resetModules();
  createUser.mockReset();
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:8000';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
  process.env.LOCAL_USER_EMAIL = 'admin@x.de';
  process.env.LOCAL_USER_PASSWORD = 'pw';
});

describe('createInitialUser', () => {
  it('creates the user from env', async () => {
    createUser.mockResolvedValue({ data: { user: { email: 'admin@x.de' } }, error: null });
    const { createInitialUser } = await import('../../scripts/create-user');
    await createInitialUser();
    expect(createUser).toHaveBeenCalledWith({ email: 'admin@x.de', password: 'pw', email_confirm: true });
  });
  it('is idempotent when the user already exists', async () => {
    createUser.mockResolvedValue({ data: { user: null }, error: { message: 'A user with this email address has already been registered' } });
    const { createInitialUser } = await import('../../scripts/create-user');
    await expect(createInitialUser()).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/scripts/create-user.test.ts`
Expected: FAIL — `scripts/create-user` not found.

- [ ] **Step 3: Implement**

`scripts/create-user.ts`:
```ts
import { createClient } from '@supabase/supabase-js';

export async function createInitialUser(): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const email = process.env.LOCAL_USER_EMAIL;
  const password = process.env.LOCAL_USER_PASSWORD;
  if (!url || !key || !email || !password) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LOCAL_USER_EMAIL, LOCAL_USER_PASSWORD required.');
  }
  const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) {
    if (error.message.toLowerCase().includes('already')) {
      console.log('User already exists — ok.');
      return;
    }
    throw error;
  }
  console.log('Created user', email);
}

// Run when invoked directly (tsx scripts/create-user.ts), not when imported by tests.
if (process.argv[1] && process.argv[1].endsWith('create-user.ts')) {
  createInitialUser().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
```

- [ ] **Step 4: Add the npm script**

In `package.json` `scripts`, add:
```json
    "create-user": "tsx scripts/create-user.ts",
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- tests/scripts/create-user.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git add scripts/create-user.ts package.json tests/scripts/create-user.test.ts
git commit -m "feat: idempotent initial-user seed script"
```

---

## Phase 3 — Reads via supabase-js + RLS

### Task 7: Enable RLS + policies + daily-series RPC

**Files:**
- Create: `db/rls.sql`
- Modify: `scripts/migrate.ts` (apply `rls.sql` after `schema.sql`)
- Test: `tests/db/rls.test.ts`

**Interfaces:**
- Produces: RLS on all six tables; `authenticated` may `SELECT` the five KPI tables; `anon` denied everywhere; `connector_credentials` locked to privileged access; SQL function `daily_series(text, date, date)` for the drill-down.

- [ ] **Step 1: Write the RLS SQL**

`db/rls.sql`:
```sql
-- Roles exist in real Supabase; create them no-op for plain-postgres CI.
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- KPI tables: authenticated may read; anon has no grant + no policy.
GRANT SELECT ON daily_metrics, orders, customers, ad_spend, subscribers TO authenticated;

ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read ON daily_metrics;
CREATE POLICY authenticated_read ON daily_metrics FOR SELECT TO authenticated USING (true);

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read ON orders;
CREATE POLICY authenticated_read ON orders FOR SELECT TO authenticated USING (true);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read ON customers;
CREATE POLICY authenticated_read ON customers FOR SELECT TO authenticated USING (true);

ALTER TABLE ad_spend ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read ON ad_spend;
CREATE POLICY authenticated_read ON ad_spend FOR SELECT TO authenticated USING (true);

ALTER TABLE subscribers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_read ON subscribers;
CREATE POLICY authenticated_read ON subscribers FOR SELECT TO authenticated USING (true);

-- Credentials: RLS on, NO anon/authenticated policy → only privileged (postgres/service_role) access.
ALTER TABLE connector_credentials ENABLE ROW LEVEL SECURITY;

-- Drill-down aggregation (PostgREST can't GROUP BY): SECURITY INVOKER so RLS applies.
CREATE OR REPLACE FUNCTION daily_series(p_metric_key text, p_start date, p_end date)
RETURNS TABLE(date date, value double precision)
LANGUAGE sql STABLE SECURITY INVOKER AS $$
  SELECT date, sum(value) AS value FROM daily_metrics
  WHERE metric_key = p_metric_key AND date BETWEEN p_start AND p_end
  GROUP BY date ORDER BY date
$$;
GRANT EXECUTE ON FUNCTION daily_series(text, date, date) TO authenticated;
```

- [ ] **Step 2: Apply rls.sql from migrate**

In `scripts/migrate.ts`, after the existing `await pool.query(sql);` and its `console.log`, add:
```ts
  const rls = readFileSync(new URL('../db/rls.sql', import.meta.url), 'utf8');
  await pool.query(rls);
  console.log('RLS policies applied.');
```

- [ ] **Step 3: Write the failing test**

`tests/db/rls.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';

afterAll(async () => { await pool.end(); });

describe('RLS on KPI tables', () => {
  it('authenticated can SELECT daily_metrics', async () => {
    const c = await pool.connect();
    try {
      await c.query('SET ROLE authenticated');
      await expect(c.query('SELECT count(*) FROM daily_metrics')).resolves.toBeTruthy();
    } finally {
      await c.query('RESET ROLE');
      c.release();
    }
  });
  it('anon is denied on daily_metrics', async () => {
    const c = await pool.connect();
    try {
      await c.query('SET ROLE anon');
      await expect(c.query('SELECT count(*) FROM daily_metrics')).rejects.toThrow(/permission denied/i);
    } finally {
      await c.query('RESET ROLE');
      c.release();
    }
  });
  it('anon is denied on connector_credentials', async () => {
    const c = await pool.connect();
    try {
      await c.query('SET ROLE authenticated');
      await expect(c.query('SELECT count(*) FROM connector_credentials')).rejects.toThrow(/permission denied/i);
    } finally {
      await c.query('RESET ROLE');
      c.release();
    }
  });
});
```

- [ ] **Step 4: Run migrate, then the test**

```bash
npm run migrate
npm test -- tests/db/rls.test.ts
```
Expected: 3 tests pass — `authenticated` reads KPI tables, `anon` denied, `authenticated` denied on `connector_credentials` (no grant/policy).

- [ ] **Step 5: Commit**

```bash
git add db/rls.sql scripts/migrate.ts tests/db/rls.test.ts
git commit -m "feat: RLS policies (authenticated read, anon denied) + daily_series RPC"
```

---

### Task 8: Route KPI reads through supabase-js

**Files:**
- Modify: `src/kpi/repository.ts`
- Modify: `src/app/page.tsx`
- Modify: `src/app/api/kpis/route.ts`
- Modify: `src/app/phase/[phase]/page.tsx` (drill-down caller of `loadDailySeries`)
- Modify: `tests/kpi/repository.test.ts`

**Interfaces:**
- Consumes: a `SupabaseClient` from `@/lib/supabase/server` (`createClient()`).
- Produces:
  - `loadDataset(supabase: SupabaseClient): Promise<CanonicalDataset>`
  - `loadDailySeries(supabase: SupabaseClient, metricKey: string, range: DateRange): Promise<{ date: string; value: number }[]>`

- [ ] **Step 1: Rewrite the repository test (mock supabase client)**

Replace `tests/kpi/repository.test.ts` with a unit test of the mapping (no live DB):
```ts
import { describe, it, expect, vi } from 'vitest';

function fakeSupabase(tables: Record<string, unknown[]>) {
  return {
    from: (t: string) => ({ select: () => Promise.resolve({ data: tables[t] ?? [], error: null }) }),
    rpc: vi.fn(),
  } as any;
}

describe('loadDataset (supabase-js)', () => {
  it('maps rows and coerces ad_spend bigints to numbers', async () => {
    const { loadDataset } = await import('@/kpi/repository');
    const supabase = fakeSupabase({
      daily_metrics: [{ date: '2026-06-01', source: 's', channel: 'c', metricKey: 'sessions', value: 5 }],
      orders: [],
      customers: [],
      ad_spend: [{ date: '2026-06-01', platform: 'meta', spend: 10, impressions: '1000', clicks: '50', conversions: '3', convValue: 99 }],
      subscribers: [],
    });
    const data = await loadDataset(supabase);
    expect(data.dailyMetrics[0].metricKey).toBe('sessions');
    expect(data.adSpend[0].impressions).toBe(1000);
    expect(data.adSpend[0].clicks).toBe(50);
    expect(data.adSpend[0].conversions).toBe(3);
  });
  it('throws when a query returns an error', async () => {
    const { loadDataset } = await import('@/kpi/repository');
    const supabase = { from: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) } as any;
    await expect(loadDataset(supabase)).rejects.toThrow(/boom/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/kpi/repository.test.ts`
Expected: FAIL — `loadDataset` still takes no argument / uses `pool`.

- [ ] **Step 3: Rewrite the repository**

`src/kpi/repository.ts` (replace entire file):
```ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CanonicalDataset, DateRange } from '@/lib/types';

function unwrap<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

export async function loadDataset(supabase: SupabaseClient): Promise<CanonicalDataset> {
  const [dm, ord, cust, ads, subs] = await Promise.all([
    supabase.from('daily_metrics').select('date, source, channel, metricKey:metric_key, value'),
    supabase.from('orders').select('orderId:order_id, customerId:customer_id, date, revenue, isFirstOrder:is_first_order'),
    supabase.from('customers').select('customerId:customer_id, firstOrderDate:first_order_date, lastOrderDate:last_order_date, ordersCount:orders_count, totalRevenue:total_revenue'),
    supabase.from('ad_spend').select('date, platform, spend, impressions, clicks, conversions, convValue:conv_value'),
    supabase.from('subscribers').select('date, source, signups, unsubscribes, npsScore:nps_score'),
  ]);
  return {
    dailyMetrics: unwrap(dm) as CanonicalDataset['dailyMetrics'],
    orders: unwrap(ord) as CanonicalDataset['orders'],
    customers: unwrap(cust) as CanonicalDataset['customers'],
    adSpend: (unwrap(ads) as any[]).map((r) => ({
      ...r, impressions: Number(r.impressions), clicks: Number(r.clicks), conversions: Number(r.conversions),
    })) as CanonicalDataset['adSpend'],
    subscribers: unwrap(subs) as CanonicalDataset['subscribers'],
  };
}

export async function loadDailySeries(
  supabase: SupabaseClient, metricKey: string, range: DateRange,
): Promise<{ date: string; value: number }[]> {
  const { data, error } = await supabase.rpc('daily_series', {
    p_metric_key: metricKey, p_start: range.start, p_end: range.end,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { date: string; value: number }) => ({ date: r.date, value: Number(r.value) }));
}
```

- [ ] **Step 4: Update callers**

`src/app/page.tsx`: the Supabase client already exists from Task 5 (`const supabase = createClient()`). Change `computeKpis(await loadDataset(), range)` to `computeKpis(await loadDataset(supabase), range)`.

`src/app/api/kpis/route.ts`: add `import { createClient } from '@/lib/supabase/server';`, then change `const data = await loadDataset();` to:
```ts
  const supabase = createClient();
  const data = await loadDataset(supabase);
```

`src/app/phase/[phase]/page.tsx`: add `import { createClient } from '@/lib/supabase/server';`; create `const supabase = createClient();` near the top of the component; update each `loadDailySeries(metricKey, range)` call to `loadDailySeries(supabase, metricKey, range)`. (Read the file first to match its exact call sites and variable names.)

- [ ] **Step 5: Run repository test + full suite + build**

```bash
npm test -- tests/kpi/repository.test.ts
npm test
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy-anon npm run build
```
Expected: repository test passes; full suite green; build compiles.

- [ ] **Step 6: Commit**

```bash
git add src/kpi/repository.ts src/app/page.tsx src/app/api/kpis/route.ts 'src/app/phase/[phase]/page.tsx' tests/kpi/repository.test.ts
git commit -m "feat: route KPI reads through supabase-js (RLS-enforced) + daily_series RPC"
```

---

### Task 9: Finalize env + CI

**Files:**
- Modify: `.env.example`
- Modify: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: a complete `.env.example` (Supabase, no AUTH_*) and a green CI that needs only a plain Postgres service (RLS via `SET ROLE`, middleware/login/create-user via mocks).

- [ ] **Step 1: Finish the .env.example swap**

In `.env.example`, remove the `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_ALLOWED_EMAILS`, `AUTH_URL`, and `GOOGLE_APPLICATION_CREDENTIALS` lines and the Auth comment block. Add a Supabase block:
```
# --- Supabase (self-hosted; see infra/supabase) ---
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# Initial dashboard user (created via: npm run create-user)
LOCAL_USER_EMAIL=you@example.com
LOCAL_USER_PASSWORD=change-me
```
Keep the existing `CREDENTIALS_KEY` block and the connector placeholder values.

- [ ] **Step 2: Update CI**

Edit `.github/workflows/ci.yml`. Change the postgres service env to user/db `postgres` (so it matches the new default and `SET ROLE` works as superuser):
```yaml
        env:
          POSTGRES_USER: postgres
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: postgres
        options: >-
          --health-cmd "pg_isready -U postgres"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10
```
Replace the job `env` block with:
```yaml
    env:
      DATABASE_URL: postgres://postgres:postgres@localhost:5432/postgres
      NEXT_PUBLIC_SUPABASE_URL: http://localhost:8000
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ci-dummy-anon-key
```
Leave the step sequence (`npm ci` → `migrate` → `seed` → `test` → `build`) unchanged. `migrate` now also applies `db/rls.sql`; the RLS `SET ROLE` test runs against this Postgres; middleware/login/create-user tests are mocked; `build` inlines the dummy `NEXT_PUBLIC_*`.

- [ ] **Step 3: Verify CI parity locally**

```bash
DATABASE_URL=postgres://postgres:<pw>@localhost:5432/postgres npm run migrate
DATABASE_URL=postgres://postgres:<pw>@localhost:5432/postgres npm run seed
npm test
NEXT_PUBLIC_SUPABASE_URL=http://localhost:8000 NEXT_PUBLIC_SUPABASE_ANON_KEY=ci-dummy-anon-key npm run build
```
Expected: migrate (schema + RLS) ok, seed ok, full suite green, build compiles.

- [ ] **Step 4: Commit**

```bash
git add .env.example .github/workflows/ci.yml
git commit -m "feat: finalize Supabase env + CI (plain postgres service, RLS via SET ROLE)"
```

---

## Manual live-verification (after merge, needs the running stack)

Not automated (requires the full Supabase stack + a real session):
1. `cd infra/supabase && docker compose up -d`; set the app `.env` (Supabase keys, `DATABASE_URL`, `CREDENTIALS_KEY`, `LOCAL_USER_*`).
2. `npm run migrate && npm run seed && npm run create-user`.
3. `npm run dev`; open `/` → redirected to `/login`; sign in with `LOCAL_USER_*` → dashboard loads.
4. `curl -i http://localhost:3000/api/kpis` without a session cookie → `401`; in-browser after login → KPIs render.
5. Re-enter Shopware credentials on `/setup`, run `npm run sync:shopware`, confirm the dashboard shows live data.

---

## Self-Review (planner)

- **Spec coverage:** infra stack (T1), DB repoint + SSL (T2), Supabase clients (T3), login/sign-out (T4), middleware gate + Auth.js removal (T5), user seed (T6), RLS + RPC (T7), reads via supabase-js (T8), env + CI (T9), manual live-verify (final section). The credential-path deviation is documented in Global Constraints. Every spec section maps to a task.
- **Type consistency:** `loadDataset(supabase)` / `loadDailySeries(supabase, metricKey, range)` signatures are defined in T8 and used by the same task's caller edits; `createClient()` (server) defined T3, used T5/T8; `createInitialUser()` defined + tested T6. Env names (`NEXT_PUBLIC_SUPABASE_URL/ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) are consistent across T2/T3/T5/T6/T9.
- **Phasing:** each phase ends shippable — P1 (data on Supabase, Auth.js intact), P2 (Supabase auth live), P3 (RLS-enforced reads).
