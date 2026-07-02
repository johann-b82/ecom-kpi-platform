# OAuth for external systems (Google, Meta, TikTok) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a proper "Connect with …" OAuth flow so users authorize Google (GA4 + Ads), Meta, and TikTok via a consent screen instead of pasting tokens by hand; connectors read the stored tokens automatically, with the existing manual credentials kept as a fallback.

**Architecture:** A generic OAuth subsystem under `src/lib/oauth/` (provider registry + encrypted token store + lazy-refresh token resolver) plus two browser-facing route handlers (`/api/oauth/[provider]/start` and `.../callback`). A *provider* (`google`) can authorize *several* connectors (`ga4` + `google`/Ads). Tokens live in a dedicated `oauth_connections` table (RLS on, no public policy), AES-256-GCM-encrypted via the existing `crypto.ts`. Connectors resolve their token OAuth-first, manual-fallback.

**Tech Stack:** Next.js 14 App Router route handlers, TypeScript, `pg` (privileged server writes), `node:crypto` (existing `encrypt`/`decrypt`), Vitest with an injected `fetch` for all provider calls.

## Global Constraints

- Node.js 22+; Next.js 14 App Router; TypeScript.
- Secrets (refresh/access tokens, client secrets) are AES-256-GCM-encrypted via `src/lib/crypto.ts` `encrypt`/`decrypt`; plaintext never returned over any API and never logged.
- `oauth_connections` and `connector_credentials` are reachable **only** via the privileged `pool` (`src/lib/db.ts`); RLS enabled, no `anon`/`authenticated` policy.
- All provider HTTP calls take an injectable `fetchImpl: typeof fetch = fetch` so tests never hit the network (matches existing connector clients).
- German UI copy, consistent with existing `CredentialsForm` (e.g. "Mit Google verbinden", "Verbindung trennen", "läuft ab am …").
- `migrate`/RLS SQL must be idempotent (`CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`).
- Conventional commits (`feat:`, `test:`, `refactor:`). Commit after each task.
- Redirect URIs are computed identically in `start` and `callback` from forwarded headers so they match the value registered in each provider console.

---

## Phase 1 — Framework + Google (end-to-end)

### Task 1: `oauth_connections` table + RLS

**Files:**
- Modify: `db/schema.sql` (append after `app_settings`)
- Modify: `db/rls.sql` (append after the `connector_credentials`/`app_settings` block)
- Modify: `tests/db/rls.test.ts` (add one case)

**Interfaces:**
- Produces: table `oauth_connections(provider text pk, refresh_token_enc text, access_token_enc text, expires_at timestamptz, scope text, account_label text, updated_at timestamptz)`.

- [ ] **Step 1: Add the failing RLS test case**

In `tests/db/rls.test.ts`, add inside the `describe('RLS on KPI tables', …)` block:

```ts
  it('authenticated is denied on oauth_connections', async () => {
    const c = await pool.connect();
    try {
      await c.query('SET ROLE authenticated');
      await expect(c.query('SELECT count(*) FROM oauth_connections')).rejects.toThrow(/permission denied|does not exist/i);
    } finally {
      await c.query('RESET ROLE');
      c.release();
    }
  });
```

- [ ] **Step 2: Run it — expect fail (relation does not exist)**

Run: `npm test -- tests/db/rls.test.ts`
Expected: FAIL — `relation "oauth_connections" does not exist` (before RLS applies).

- [ ] **Step 3: Add the table to `db/schema.sql`**

Append:

```sql
CREATE TABLE IF NOT EXISTS oauth_connections (
  provider          TEXT PRIMARY KEY,
  refresh_token_enc TEXT,
  access_token_enc  TEXT,
  expires_at        TIMESTAMPTZ,
  scope             TEXT,
  account_label     TEXT,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

- [ ] **Step 4: Enable RLS in `db/rls.sql`**

Change the existing line so it also covers the new table:

```sql
ALTER TABLE connector_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE oauth_connections ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 5: Migrate and run the test — expect pass**

Run: `npm run migrate && npm test -- tests/db/rls.test.ts`
Expected: PASS (now `permission denied`).

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql db/rls.sql tests/db/rls.test.ts
git commit -m "feat: add oauth_connections table with RLS (no public policy)"
```

---

### Task 2: OAuth types + provider registry (Google adapter)

**Files:**
- Create: `src/lib/oauth/types.ts`
- Create: `src/lib/oauth/providers.ts`
- Create: `tests/lib/oauth/providers.test.ts`

**Interfaces:**
- Consumes: `Connector` from `@/lib/connector-fields`.
- Produces:
  - `types.ts`: `TokenSet`, `AppCredentials`, `ProviderKey`, `OAuthProvider`.
  - `providers.ts`: `PROVIDERS: Record<ProviderKey, OAuthProvider>`, `getProvider(key: string): OAuthProvider | null`, `PROVIDER_KEYS: ProviderKey[]`.

- [ ] **Step 1: Write `src/lib/oauth/types.ts`**

```ts
import type { Connector } from '@/lib/connector-fields';

export type ProviderKey = 'google' | 'meta' | 'tiktok';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;   // epoch ms; absent → unknown / long-lived
  scope?: string;
  accountLabel?: string;
}

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
}

export interface OAuthProvider {
  key: ProviderKey;
  label: string;
  connectors: Connector[];
  scopes: string[];
  // Where the OAuth app (client id/secret) is stored in the connector_credentials vault.
  appCredentialSource: { connector: Connector; idField: string; secretField: string };
  authorizeUrl(redirectUri: string, state: string, creds: AppCredentials): string;
  exchangeCode(
    code: string,
    redirectUri: string,
    creds: AppCredentials,
    fetchImpl?: typeof fetch,
  ): Promise<TokenSet>;
  refresh?(
    current: TokenSet,
    creds: AppCredentials,
    fetchImpl?: typeof fetch,
  ): Promise<TokenSet>;
}
```

- [ ] **Step 2: Write the failing test `tests/lib/oauth/providers.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { getProvider, PROVIDERS } from '@/lib/oauth/providers';

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}
const creds = { clientId: 'CID', clientSecret: 'SEC' };
const REDIRECT = 'https://budp.lumeapps.de/api/oauth/google/callback';

describe('google provider', () => {
  it('builds an authorize URL with offline access, consent prompt and both scopes', () => {
    const g = PROVIDERS.google;
    const url = new URL(g.authorizeUrl(REDIRECT, 'STATE123', creds));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('CID');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('STATE123');
    expect(url.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/adwords',
    );
  });

  it('exchangeCode posts an authorization_code grant and normalizes the token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, scope: 'x' }));
    const token = await PROVIDERS.google.exchangeCode('CODE', REDIRECT, creds, fetchMock as unknown as typeof fetch);
    expect(token).toMatchObject({ accessToken: 'AT', refreshToken: 'RT', scope: 'x' });
    expect(typeof token.expiresAt).toBe('number');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toMatchObject({ grant_type: 'authorization_code', code: 'CODE', client_id: 'CID', client_secret: 'SEC', redirect_uri: REDIRECT });
  });

  it('refresh posts a refresh_token grant and preserves the refresh token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ access_token: 'AT2', expires_in: 3600 }));
    const token = await PROVIDERS.google.refresh!(
      { accessToken: 'old', refreshToken: 'RT' }, creds, fetchMock as unknown as typeof fetch,
    );
    expect(token).toMatchObject({ accessToken: 'AT2', refreshToken: 'RT' });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'RT', client_id: 'CID', client_secret: 'SEC' });
  });

  it('exchangeCode throws on HTTP error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ error: 'invalid_grant' }, 400));
    await expect(PROVIDERS.google.exchangeCode('C', REDIRECT, creds, fetchMock as unknown as typeof fetch))
      .rejects.toThrow(/google.*token.*400/i);
  });

  it('getProvider returns null for unknown keys', () => {
    expect(getProvider('nope')).toBeNull();
    expect(getProvider('google')?.key).toBe('google');
  });
});
```

- [ ] **Step 3: Run it — expect fail (module missing)**

Run: `npm test -- tests/lib/oauth/providers.test.ts`
Expected: FAIL — cannot find `@/lib/oauth/providers`.

- [ ] **Step 4: Write `src/lib/oauth/providers.ts` (Google only for now)**

```ts
import type { AppCredentials, OAuthProvider, ProviderKey, TokenSet } from './types';

// Shared helper: exchange a POST body at a token endpoint and return parsed JSON.
async function postToken(
  provider: string,
  url: string,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${provider} token endpoint ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function expiryFrom(json: Record<string, unknown>, nowMs: number): number | undefined {
  const secs = Number(json.expires_in);
  return Number.isFinite(secs) ? nowMs + secs * 1000 : undefined;
}

const google: OAuthProvider = {
  key: 'google',
  label: 'Google',
  connectors: ['ga4', 'google'],
  scopes: [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/adwords',
  ],
  appCredentialSource: { connector: 'google', idField: 'GOOGLE_ADS_CLIENT_ID', secretField: 'GOOGLE_ADS_CLIENT_SECRET' },
  authorizeUrl(redirectUri, state, creds) {
    const p = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      scope: this.scopes.join(' '),
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
  },
  async exchangeCode(code, redirectUri, creds, fetchImpl = fetch) {
    const json = await postToken('google', 'https://oauth2.googleapis.com/token', {
      grant_type: 'authorization_code',
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
    }, fetchImpl);
    return {
      accessToken: String(json.access_token),
      refreshToken: json.refresh_token ? String(json.refresh_token) : undefined,
      expiresAt: expiryFrom(json, Date.now()),
      scope: json.scope ? String(json.scope) : undefined,
    };
  },
  async refresh(current, creds, fetchImpl = fetch) {
    const json = await postToken('google', 'https://oauth2.googleapis.com/token', {
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken ?? '',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }, fetchImpl);
    return {
      accessToken: String(json.access_token),
      refreshToken: current.refreshToken, // Google does not re-issue it
      expiresAt: expiryFrom(json, Date.now()),
      scope: json.scope ? String(json.scope) : current.scope,
    };
  },
};

export const PROVIDERS: Partial<Record<ProviderKey, OAuthProvider>> = { google };

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[];

export function getProvider(key: string): OAuthProvider | null {
  return (PROVIDERS as Record<string, OAuthProvider>)[key] ?? null;
}
```

> Note: `PROVIDERS` is typed `Partial` so `meta`/`tiktok` slot in during later phases. The Google OAuth app client id/secret **reuse** the existing `GOOGLE_ADS_CLIENT_ID`/`GOOGLE_ADS_CLIENT_SECRET` vault fields — it is the same Google Cloud OAuth client that covers GA4 and Ads, so we avoid asking the user to enter it twice. Test files reference `PROVIDERS.google` directly (non-null in this phase).

- [ ] **Step 5: Run test — expect pass**

Run: `npm test -- tests/lib/oauth/providers.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/oauth/types.ts src/lib/oauth/providers.ts tests/lib/oauth/providers.test.ts
git commit -m "feat: oauth provider registry with google adapter"
```

---

### Task 3: Encrypted token store

**Files:**
- Create: `src/lib/oauth/store.ts`
- Create: `tests/lib/oauth/store.test.ts`

**Interfaces:**
- Consumes: `pool` (`@/lib/db`), `encrypt`/`decrypt` (`@/lib/crypto`), `ProviderKey`/`TokenSet` (`./types`).
- Produces:
  - `interface OAuthConnection { provider: ProviderKey; refreshToken: string | null; accessToken: string | null; expiresAt: number | null; scope: string | null; accountLabel: string | null; updatedAt: string }`
  - `getConnection(provider: ProviderKey): Promise<OAuthConnection | null>`
  - `saveConnection(provider: ProviderKey, token: TokenSet): Promise<void>` (upsert; preserves an existing refresh token when `token.refreshToken` is undefined)
  - `deleteConnection(provider: ProviderKey): Promise<void>`
  - `listConnections(): Promise<OAuthConnection[]>`

- [ ] **Step 1: Write the failing test `tests/lib/oauth/store.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getConnection, saveConnection, deleteConnection } from '@/lib/oauth/store';
import { pool } from '@/lib/db';

beforeAll(() => { process.env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString('base64'); });
afterAll(async () => {
  await pool.query(`DELETE FROM oauth_connections WHERE provider = 'google'`);
  await pool.end();
});

describe('oauth token store (integration, benötigt DB)', () => {
  it('save→get round-trip, tokens encrypted at rest', async () => {
    const exp = 1893456000000; // fixed epoch ms
    await saveConnection('google', { accessToken: 'AT', refreshToken: 'RT', expiresAt: exp, scope: 'sc', accountLabel: 'acct' });
    const conn = await getConnection('google');
    expect(conn).toMatchObject({ provider: 'google', accessToken: 'AT', refreshToken: 'RT', expiresAt: exp, scope: 'sc', accountLabel: 'acct' });
    const raw = await pool.query(`SELECT access_token_enc, refresh_token_enc FROM oauth_connections WHERE provider = 'google'`);
    expect(raw.rows[0].access_token_enc).not.toContain('AT');
    expect(raw.rows[0].refresh_token_enc).not.toContain('RT');
  });

  it('save without refreshToken preserves the stored one (refresh case)', async () => {
    await saveConnection('google', { accessToken: 'AT2', expiresAt: 1893456000000 });
    const conn = await getConnection('google');
    expect(conn?.accessToken).toBe('AT2');
    expect(conn?.refreshToken).toBe('RT');
  });

  it('delete removes the connection', async () => {
    await deleteConnection('google');
    expect(await getConnection('google')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect fail (module missing)**

Run: `npm test -- tests/lib/oauth/store.test.ts`
Expected: FAIL — cannot find `@/lib/oauth/store`.

- [ ] **Step 3: Write `src/lib/oauth/store.ts`**

```ts
import { pool } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';
import type { ProviderKey, TokenSet } from './types';

export interface OAuthConnection {
  provider: ProviderKey;
  refreshToken: string | null;
  accessToken: string | null;
  expiresAt: number | null; // epoch ms
  scope: string | null;
  accountLabel: string | null;
  updatedAt: string;
}

interface Row {
  provider: string;
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  expires_at: string | null;
  scope: string | null;
  account_label: string | null;
  updated_at: string;
}

function toConnection(row: Row): OAuthConnection {
  return {
    provider: row.provider as ProviderKey,
    refreshToken: row.refresh_token_enc ? decrypt(row.refresh_token_enc) : null,
    accessToken: row.access_token_enc ? decrypt(row.access_token_enc) : null,
    expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    scope: row.scope,
    accountLabel: row.account_label,
    updatedAt: row.updated_at,
  };
}

export async function getConnection(provider: ProviderKey): Promise<OAuthConnection | null> {
  const res = await pool.query<Row>('SELECT * FROM oauth_connections WHERE provider = $1', [provider]);
  return res.rows[0] ? toConnection(res.rows[0]) : null;
}

export async function listConnections(): Promise<OAuthConnection[]> {
  const res = await pool.query<Row>('SELECT * FROM oauth_connections ORDER BY provider');
  return res.rows.map(toConnection);
}

export async function saveConnection(provider: ProviderKey, token: TokenSet): Promise<void> {
  // A refresh flow often omits refresh_token; COALESCE keeps the stored one.
  const refreshEnc = token.refreshToken ? encrypt(token.refreshToken) : null;
  const accessEnc = encrypt(token.accessToken);
  const expiresAt = token.expiresAt ? new Date(token.expiresAt).toISOString() : null;
  await pool.query(
    `INSERT INTO oauth_connections (provider, refresh_token_enc, access_token_enc, expires_at, scope, account_label, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (provider) DO UPDATE SET
       refresh_token_enc = COALESCE(excluded.refresh_token_enc, oauth_connections.refresh_token_enc),
       access_token_enc  = excluded.access_token_enc,
       expires_at        = excluded.expires_at,
       scope             = COALESCE(excluded.scope, oauth_connections.scope),
       account_label     = COALESCE(excluded.account_label, oauth_connections.account_label),
       updated_at        = now()`,
    [provider, refreshEnc, accessEnc, expiresAt, token.scope ?? null, token.accountLabel ?? null],
  );
}

export async function deleteConnection(provider: ProviderKey): Promise<void> {
  await pool.query('DELETE FROM oauth_connections WHERE provider = $1', [provider]);
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `npm test -- tests/lib/oauth/store.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/oauth/store.ts tests/lib/oauth/store.test.ts
git commit -m "feat: encrypted oauth token store (upsert preserves refresh token)"
```

---

### Task 4: Token resolver (lazy refresh) + app-credential loader

**Files:**
- Create: `src/lib/oauth/token.ts`
- Create: `tests/lib/oauth/token.test.ts`

**Interfaces:**
- Consumes: `getConnection`/`saveConnection` (`./store`), `getProvider`/`PROVIDERS` (`./providers`), `getCredential` (`@/lib/credentials`).
- Produces:
  - `loadAppCredentials(provider: ProviderKey): Promise<AppCredentials | null>` (null when id or secret unset)
  - `isConnected(provider: ProviderKey): Promise<boolean>`
  - `getOAuthAccessToken(provider: ProviderKey, opts?: { now?: number; fetchImpl?: typeof fetch }): Promise<string>` — returns a valid access token, refreshing when expired; throws when not connected, when app creds are missing, or when the token is expired and unrefreshable (Meta).

- [ ] **Step 1: Write the failing test `tests/lib/oauth/token.test.ts`**

This test mocks the store, providers, and credentials modules — no DB needed.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/oauth/store', () => ({ getConnection: vi.fn(), saveConnection: vi.fn() }));
vi.mock('@/lib/credentials', () => ({ getCredential: vi.fn() }));

import { getOAuthAccessToken, isConnected, loadAppCredentials } from '@/lib/oauth/token';
import { getConnection, saveConnection } from '@/lib/oauth/store';
import { getCredential } from '@/lib/credentials';

const NOW = 1_000_000_000_000;

beforeEach(() => {
  vi.mocked(getConnection).mockReset();
  vi.mocked(saveConnection).mockReset();
  vi.mocked(getCredential).mockReset();
  // Google app creds present by default.
  vi.mocked(getCredential).mockImplementation(async (_c, field) =>
    field === 'GOOGLE_ADS_CLIENT_ID' ? 'CID' : field === 'GOOGLE_ADS_CLIENT_SECRET' ? 'SEC' : null);
});

describe('getOAuthAccessToken', () => {
  it('returns the stored access token when still valid', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'google', accessToken: 'VALID', refreshToken: 'RT',
      expiresAt: NOW + 10 * 60_000, scope: null, accountLabel: null, updatedAt: '',
    });
    const token = await getOAuthAccessToken('google', { now: NOW });
    expect(token).toBe('VALID');
  });

  it('refreshes when the access token is expired', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'google', accessToken: 'OLD', refreshToken: 'RT',
      expiresAt: NOW - 1000, scope: null, accountLabel: null, updatedAt: '',
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ access_token: 'FRESH', expires_in: 3600 }), text: async () => '',
    } as Response);
    const token = await getOAuthAccessToken('google', { now: NOW, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(token).toBe('FRESH');
    expect(saveConnection).toHaveBeenCalledWith('google', expect.objectContaining({ accessToken: 'FRESH' }));
  });

  it('throws a clear error when not connected', async () => {
    vi.mocked(getConnection).mockResolvedValue(null);
    await expect(getOAuthAccessToken('google', { now: NOW })).rejects.toThrow(/nicht verbunden|not connected/i);
  });

  it('throws when app credentials are missing', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'google', accessToken: 'OLD', refreshToken: 'RT',
      expiresAt: NOW - 1000, scope: null, accountLabel: null, updatedAt: '',
    });
    vi.mocked(getCredential).mockResolvedValue(null);
    await expect(getOAuthAccessToken('google', { now: NOW })).rejects.toThrow(/client|credential/i);
  });
});

describe('isConnected / loadAppCredentials', () => {
  it('isConnected reflects store presence', async () => {
    vi.mocked(getConnection).mockResolvedValue(null);
    expect(await isConnected('google')).toBe(false);
  });
  it('loadAppCredentials returns null when secret unset', async () => {
    vi.mocked(getCredential).mockImplementation(async (_c, field) => field === 'GOOGLE_ADS_CLIENT_ID' ? 'CID' : null);
    expect(await loadAppCredentials('google')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect fail (module missing)**

Run: `npm test -- tests/lib/oauth/token.test.ts`
Expected: FAIL — cannot find `@/lib/oauth/token`.

- [ ] **Step 3: Write `src/lib/oauth/token.ts`**

```ts
import { getConnection, saveConnection } from './store';
import { getProvider } from './providers';
import { getCredential } from '@/lib/credentials';
import type { AppCredentials, ProviderKey } from './types';

const EXPIRY_BUFFER_MS = 60_000; // refresh a minute early

export async function loadAppCredentials(provider: ProviderKey): Promise<AppCredentials | null> {
  const p = getProvider(provider);
  if (!p) return null;
  const { connector, idField, secretField } = p.appCredentialSource;
  const clientId = await getCredential(connector, idField);
  const clientSecret = await getCredential(connector, secretField);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export async function isConnected(provider: ProviderKey): Promise<boolean> {
  return (await getConnection(provider)) !== null;
}

export async function getOAuthAccessToken(
  provider: ProviderKey,
  opts: { now?: number; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const p = getProvider(provider);
  if (!p) throw new Error(`Unbekannter OAuth-Provider: ${provider}`);

  const conn = await getConnection(provider);
  if (!conn || !conn.accessToken) {
    throw new Error(`${p.label} ist nicht verbunden — bitte in den Einstellungen verbinden.`);
  }

  const valid = conn.expiresAt === null || conn.expiresAt - EXPIRY_BUFFER_MS > now;
  if (valid) return conn.accessToken;

  // Expired. Refresh if the provider supports it and we have a refresh token.
  if (!p.refresh || !conn.refreshToken) {
    throw new Error(`${p.label}-Token abgelaufen — bitte neu verbinden.`);
  }
  const creds = await loadAppCredentials(provider);
  if (!creds) throw new Error(`${p.label} OAuth client id/secret fehlen — bitte in den Einstellungen hinterlegen.`);

  const refreshed = await p.refresh(
    { accessToken: conn.accessToken, refreshToken: conn.refreshToken, scope: conn.scope ?? undefined },
    creds,
    opts.fetchImpl,
  );
  await saveConnection(provider, refreshed);
  return refreshed.accessToken;
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `npm test -- tests/lib/oauth/token.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/oauth/token.ts tests/lib/oauth/token.test.ts
git commit -m "feat: oauth token resolver with lazy refresh + app-cred loader"
```

---

### Task 5: Route handlers — start, callback, disconnect

**Files:**
- Create: `src/lib/oauth/redirect.ts` (redirect-URI + state cookie helpers)
- Create: `src/app/api/oauth/[provider]/start/route.ts`
- Create: `src/app/api/oauth/[provider]/callback/route.ts`
- Create: `src/app/api/oauth/[provider]/disconnect/route.ts`
- Create: `tests/app/oauth-routes.test.ts`

**Interfaces:**
- Consumes: `getProvider` (`@/lib/oauth/providers`), `loadAppCredentials` (`@/lib/oauth/token`), `saveConnection`/`deleteConnection` (`@/lib/oauth/store`).
- Produces (in `redirect.ts`):
  - `STATE_COOKIE = 'oauth_state'`
  - `redirectUriFor(request: Request, provider: string): string`
  - `buildAuthorizeRedirect(...)` is **not** needed; keep route logic inline.

- [ ] **Step 1: Write `src/lib/oauth/redirect.ts`**

```ts
export const STATE_COOKIE = 'oauth_state';

/** Absolute callback URL, derived from forwarded headers so it matches the value
 *  registered in the provider console (works behind Caddy and on localhost). */
export function redirectUriFor(request: Request, provider: string): string {
  const h = request.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}/api/oauth/${provider}/callback`;
}
```

- [ ] **Step 2: Write the failing route test `tests/app/oauth-routes.test.ts`**

The store, token, and provider modules are mocked so no DB/network is touched.

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/oauth/store', () => ({ saveConnection: vi.fn(), deleteConnection: vi.fn() }));
vi.mock('@/lib/oauth/token', () => ({ loadAppCredentials: vi.fn() }));

import { GET as start } from '@/app/api/oauth/[provider]/start/route';
import { GET as callback } from '@/app/api/oauth/[provider]/callback/route';
import { loadAppCredentials } from '@/lib/oauth/token';
import { saveConnection } from '@/lib/oauth/store';

function req(url: string, cookie?: string): Request {
  return new Request(url, { headers: cookie ? { cookie } : {} });
}

beforeEach(() => {
  vi.mocked(loadAppCredentials).mockReset();
  vi.mocked(saveConnection).mockReset();
  vi.mocked(loadAppCredentials).mockResolvedValue({ clientId: 'CID', clientSecret: 'SEC' });
});

describe('GET /api/oauth/[provider]/start', () => {
  it('redirects to the consent screen and sets a state cookie', async () => {
    const res = await start(req('https://budp.lumeapps.de/api/oauth/google/start'), { params: { provider: 'google' } });
    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(location).toContain('accounts.google.com/o/oauth2/v2/auth');
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/oauth_state=/);
    const state = new URL(location).searchParams.get('state')!;
    expect(setCookie).toContain(`oauth_state=${state}`);
  });

  it('400 when app credentials are missing', async () => {
    vi.mocked(loadAppCredentials).mockResolvedValue(null);
    const res = await start(req('https://budp.lumeapps.de/api/oauth/google/start'), { params: { provider: 'google' } });
    expect(res.status).toBe(400);
  });

  it('404 for an unknown provider', async () => {
    const res = await start(req('https://budp.lumeapps.de/api/oauth/nope/start'), { params: { provider: 'nope' } });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/oauth/[provider]/callback', () => {
  it('rejects a mismatched state (no token stored)', async () => {
    const res = await callback(
      req('https://budp.lumeapps.de/api/oauth/google/callback?code=C&state=EVIL', 'oauth_state=GOOD'),
      { params: { provider: 'google' } },
    );
    expect(res.status).toBe(400);
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('redirects back to /setup with error when provider returns error', async () => {
    const res = await callback(
      req('https://budp.lumeapps.de/api/oauth/google/callback?error=access_denied', 'oauth_state=GOOD'),
      { params: { provider: 'google' } },
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/setup\?oauth=google&error=/);
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('exchanges the code and stores the token on the happy path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }), text: async () => '',
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const res = await callback(
      req('https://budp.lumeapps.de/api/oauth/google/callback?code=CODE&state=GOOD', 'oauth_state=GOOD'),
      { params: { provider: 'google' } },
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/setup\?oauth=google&connected=1/);
    expect(saveConnection).toHaveBeenCalledWith('google', expect.objectContaining({ accessToken: 'AT', refreshToken: 'RT' }));
    vi.unstubAllGlobals();
  });
});
```

- [ ] **Step 3: Run it — expect fail (routes missing)**

Run: `npm test -- tests/app/oauth-routes.test.ts`
Expected: FAIL — cannot find the route modules.

- [ ] **Step 4: Write `src/app/api/oauth/[provider]/start/route.ts`**

```ts
import { NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { getProvider } from '@/lib/oauth/providers';
import { loadAppCredentials } from '@/lib/oauth/token';
import { redirectUriFor, STATE_COOKIE } from '@/lib/oauth/redirect';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  const provider = getProvider(params.provider);
  if (!provider) return NextResponse.json({ error: 'unknown provider' }, { status: 404 });

  const creds = await loadAppCredentials(provider.key);
  if (!creds) {
    return NextResponse.json({ error: `${provider.label} OAuth client id/secret fehlen` }, { status: 400 });
  }

  const state = crypto.randomBytes(16).toString('hex');
  const redirectUri = redirectUriFor(request, provider.key);
  const res = NextResponse.redirect(provider.authorizeUrl(redirectUri, state, creds));
  res.cookies.set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !request.headers.get('host')?.startsWith('localhost'),
    path: `/api/oauth`,
    maxAge: 600,
  });
  return res;
}
```

- [ ] **Step 5: Write `src/app/api/oauth/[provider]/callback/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/oauth/providers';
import { loadAppCredentials } from '@/lib/oauth/token';
import { saveConnection } from '@/lib/oauth/store';
import { redirectUriFor, STATE_COOKIE } from '@/lib/oauth/redirect';

export const dynamic = 'force-dynamic';

function setupRedirect(request: Request, query: string) {
  return NextResponse.redirect(new URL(`/setup?${query}`, request.url));
}

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  const provider = getProvider(params.provider);
  if (!provider) return NextResponse.json({ error: 'unknown provider' }, { status: 404 });

  const url = new URL(request.url);
  const err = url.searchParams.get('error');
  if (err) return setupRedirect(request, `oauth=${provider.key}&error=${encodeURIComponent(err)}`);

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = request.headers.get('cookie')?.match(/(?:^|;\s*)oauth_state=([^;]+)/)?.[1];
  if (!code || !state || !cookieState || state !== cookieState) {
    return NextResponse.json({ error: 'invalid state' }, { status: 400 });
  }

  const creds = await loadAppCredentials(provider.key);
  if (!creds) return NextResponse.json({ error: 'missing app credentials' }, { status: 400 });

  let token;
  try {
    token = await provider.exchangeCode(code, redirectUriFor(request, provider.key), creds);
  } catch (e) {
    return setupRedirect(request, `oauth=${provider.key}&error=${encodeURIComponent((e as Error).message)}`);
  }
  await saveConnection(provider.key, token);

  const res = setupRedirect(request, `oauth=${provider.key}&connected=1`);
  res.cookies.set(STATE_COOKIE, '', { path: '/api/oauth', maxAge: 0 });
  return res;
}
```

- [ ] **Step 6: Write `src/app/api/oauth/[provider]/disconnect/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { getProvider } from '@/lib/oauth/providers';
import { deleteConnection } from '@/lib/oauth/store';

export const dynamic = 'force-dynamic';

export async function POST(request: Request, { params }: { params: { provider: string } }) {
  const provider = getProvider(params.provider);
  if (!provider) return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  await deleteConnection(provider.key);
  return NextResponse.redirect(new URL(`/setup?oauth=${provider.key}&disconnected=1`, request.url));
}
```

- [ ] **Step 7: Run test — expect pass**

Run: `npm test -- tests/app/oauth-routes.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/oauth/redirect.ts src/app/api/oauth tests/app/oauth-routes.test.ts
git commit -m "feat: oauth start/callback/disconnect route handlers with state CSRF"
```

---

### Task 6: Wire Google connectors (GA4 + Ads) — OAuth-first, manual fallback

**Files:**
- Modify: `src/connectors/google/client.ts` (accept an optional injected token provider)
- Modify: `scripts/sync-ga4.ts`
- Modify: `scripts/sync-google.ts`
- Create: `tests/connectors/google/token-source.test.ts`
- Modify: `tests/connectors/google/client.test.ts` (one added case)

**Interfaces:**
- Consumes: `getOAuthAccessToken`, `isConnected` (`@/lib/oauth/token`).
- Produces: `GoogleAdsClient` gains an optional 3rd constructor arg — a `tokenProvider?: () => Promise<string>`; when present, `getAccessToken()` delegates to it instead of the refresh-token grant.

- [ ] **Step 1: Add the failing `GoogleAdsClient` token-provider test**

Append to `tests/connectors/google/client.test.ts`:

```ts
describe('GoogleAdsClient with injected token provider (OAuth path)', () => {
  it('uses the token provider instead of the refresh grant', async () => {
    const tokenProvider = vi.fn().mockResolvedValue('OAUTH_AT');
    const stream = [{ results: [{ segments: { date: '2026-01-01' }, metrics: { costMicros: '1' } }] }];
    const fetchMock = vi.fn().mockResolvedValueOnce(res(stream));
    const client = new GoogleAdsClient(config, fetchMock as unknown as typeof fetch, tokenProvider);
    await client.search(30);
    expect(tokenProvider).toHaveBeenCalledOnce();
    // Only the searchStream call — no token endpoint round-trip.
    expect(fetchMock.mock.calls[0][0]).toContain('googleAds:searchStream');
    expect((fetchMock.mock.calls[0][1] as RequestInit).headers).toMatchObject({ Authorization: 'Bearer OAUTH_AT' });
  });
});
```

- [ ] **Step 2: Run it — expect fail (arity/behavior)**

Run: `npm test -- tests/connectors/google/client.test.ts`
Expected: FAIL — token provider ignored; a token-endpoint call is made.

- [ ] **Step 3: Modify `src/connectors/google/client.ts`**

Add the optional provider and short-circuit `getAccessToken`:

```ts
export class GoogleAdsClient {
  constructor(
    private readonly config: GoogleAdsConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly tokenProvider?: () => Promise<string>,
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.tokenProvider) return this.tokenProvider();
    const res = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
      }),
    });
    if (!res.ok) {
      throw new Error(`Google Ads auth failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }
  // search() unchanged
```

- [ ] **Step 4: Run test — expect pass**

Run: `npm test -- tests/connectors/google/client.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Write `tests/connectors/google/token-source.test.ts` (selection helper)**

We add a tiny helper in `sync-ga4`/`sync-google`? No — keep selection testable by putting it in `token.ts`? It is already: `isConnected` + `getOAuthAccessToken`. This test documents the selection contract used by the sync scripts:

```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/oauth/store', () => ({ getConnection: vi.fn() }));
vi.mock('@/lib/credentials', () => ({ getCredential: vi.fn() }));

import { isConnected } from '@/lib/oauth/token';
import { getConnection } from '@/lib/oauth/store';

describe('google connector token source selection', () => {
  it('isConnected("google") true when a connection row exists', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'google', accessToken: 'AT', refreshToken: 'RT', expiresAt: null, scope: null, accountLabel: null, updatedAt: '',
    });
    expect(await isConnected('google')).toBe(true);
  });
  it('isConnected("google") false when no row', async () => {
    vi.mocked(getConnection).mockResolvedValue(null);
    expect(await isConnected('google')).toBe(false);
  });
});
```

- [ ] **Step 6: Modify `scripts/sync-ga4.ts` — prefer OAuth**

Replace the client-construction block:

```ts
import { Ga4Client } from '../src/connectors/ga4/client';
import { normalizeReport } from '../src/connectors/ga4/connector';
import { writeGa4Metrics } from '../src/connectors/ga4/write';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';
import { isConnected, getOAuthAccessToken } from '../src/lib/oauth/token';
// …parseDays unchanged…

async function main() {
  const cfg = await loadConnectorConfig('ga4');
  const days = parseDays(process.argv);

  const client = (await isConnected('google'))
    ? new Ga4Client(cfg.GA4_PROPERTY_ID, () => getOAuthAccessToken('google'))
    : Ga4Client.fromCredentials(cfg.GA4_PROPERTY_ID, JSON.parse(cfg.GA4_SERVICE_ACCOUNT_JSON));
  // …rest unchanged…
```

> `loadConnectorConfig('ga4')` requires `GA4_SERVICE_ACCOUNT_JSON` (non-optional). To let OAuth-only setups skip it, mark `GA4_SERVICE_ACCOUNT_JSON` and the Google Ads manual token fields `optional: true` in Task 7; the sync script then reads them directly only on the fallback branch. Update `sync-ga4` to `const cfg = await getCredentials('ga4')` + explicit `GA4_PROPERTY_ID` presence check instead of `loadConnectorConfig` if the property id must stay required.

- [ ] **Step 7: Modify `scripts/sync-google.ts` — prefer OAuth**

```ts
import { isConnected, getOAuthAccessToken } from '../src/lib/oauth/token';
// …
async function main() {
  const cfg = await loadConnectorConfig('google');
  const days = parseDays(process.argv);
  const oauth = await isConnected('google');
  const client = new GoogleAdsClient(
    {
      developerToken: cfg.GOOGLE_ADS_DEVELOPER_TOKEN,
      clientId: cfg.GOOGLE_ADS_CLIENT_ID,
      clientSecret: cfg.GOOGLE_ADS_CLIENT_SECRET,
      refreshToken: cfg.GOOGLE_ADS_REFRESH_TOKEN ?? '',
      customerId: cfg.GOOGLE_ADS_CUSTOMER_ID,
      loginCustomerId: cfg.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    },
    fetch,
    oauth ? () => getOAuthAccessToken('google') : undefined,
  );
  // …rest unchanged…
```

- [ ] **Step 8: Run the connector + token tests**

Run: `npm test -- tests/connectors/google tests/lib/oauth`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/connectors/google/client.ts scripts/sync-ga4.ts scripts/sync-google.ts tests/connectors/google
git commit -m "feat: google connectors prefer oauth token, fall back to manual credentials"
```

---

### Task 7: OAuth-aware credential fields + relax now-optional manual fields

**Files:**
- Modify: `src/lib/connector-fields.ts`

**Interfaces:**
- Produces: `GA4_SERVICE_ACCOUNT_JSON` and `GOOGLE_ADS_REFRESH_TOKEN` become `optional: true` (OAuth path makes them unnecessary). No new Google fields — the OAuth app reuses `GOOGLE_ADS_CLIENT_ID/SECRET`.

- [ ] **Step 1: Edit `src/lib/connector-fields.ts`**

Set these two fields `optional: true`:

```ts
  ga4: [
    { field: 'GA4_PROPERTY_ID', label: 'Property ID', secret: false, optional: false },
    { field: 'GA4_SERVICE_ACCOUNT_JSON', label: 'Service Account JSON (Fallback)', secret: true, optional: true },
  ],
```

and in `google`:

```ts
    { field: 'GOOGLE_ADS_REFRESH_TOKEN', label: 'Refresh Token (Fallback)', secret: true, optional: true },
```

- [ ] **Step 2: Run the load-config test — expect still green**

Run: `npm test -- tests/lib/load-config.test.ts`
Expected: PASS (making fields optional cannot break required-field logic).

- [ ] **Step 3: Commit**

```bash
git add src/lib/connector-fields.ts
git commit -m "refactor: mark GA4 service-account and Google Ads refresh token optional (oauth fallback)"
```

---

### Task 8: Setup-page OAuth status + Connect/Disconnect UI

**Files:**
- Create: `src/lib/oauth/status.ts` (server helper for the UI)
- Modify: `src/app/setup/page.tsx`
- Modify: `src/components/CredentialsForm.tsx`
- Create: `tests/lib/oauth/status.test.ts`

**Interfaces:**
- Consumes: `PROVIDERS`/`PROVIDER_KEYS` (`@/lib/oauth/providers`), `listConnections` (`@/lib/oauth/store`), `loadAppCredentials` (`@/lib/oauth/token`).
- Produces:
  - `interface OAuthProviderStatus { key: ProviderKey; label: string; connectors: Connector[]; connected: boolean; hasAppCreds: boolean; accountLabel: string | null; scope: string | null; expiresAt: number | null }`
  - `listOAuthStatus(): Promise<OAuthProviderStatus[]>`
  - `CredentialsForm` accepts a new optional prop `oauth?: OAuthProviderStatus[]` and renders a status/Connect/Disconnect block for the provider matching each connector's group.

- [ ] **Step 1: Write the failing `status.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/oauth/store', () => ({ listConnections: vi.fn() }));
vi.mock('@/lib/oauth/token', () => ({ loadAppCredentials: vi.fn() }));

import { listOAuthStatus } from '@/lib/oauth/status';
import { listConnections } from '@/lib/oauth/store';
import { loadAppCredentials } from '@/lib/oauth/token';

beforeEach(() => {
  vi.mocked(listConnections).mockReset();
  vi.mocked(loadAppCredentials).mockReset();
});

describe('listOAuthStatus', () => {
  it('reports connected + app-cred presence per provider', async () => {
    vi.mocked(listConnections).mockResolvedValue([
      { provider: 'google', accessToken: 'AT', refreshToken: 'RT', expiresAt: 123, scope: 'sc', accountLabel: 'acct', updatedAt: '' },
    ]);
    vi.mocked(loadAppCredentials).mockResolvedValue({ clientId: 'CID', clientSecret: 'SEC' });
    const status = await listOAuthStatus();
    const google = status.find((s) => s.key === 'google')!;
    expect(google).toMatchObject({ connected: true, hasAppCreds: true, accountLabel: 'acct', expiresAt: 123 });
  });
});
```

- [ ] **Step 2: Run it — expect fail (module missing)**

Run: `npm test -- tests/lib/oauth/status.test.ts`
Expected: FAIL — cannot find `@/lib/oauth/status`.

- [ ] **Step 3: Write `src/lib/oauth/status.ts`**

```ts
import type { Connector } from '@/lib/connector-fields';
import type { ProviderKey } from './types';
import { PROVIDERS, PROVIDER_KEYS } from './providers';
import { listConnections } from './store';
import { loadAppCredentials } from './token';

export interface OAuthProviderStatus {
  key: ProviderKey;
  label: string;
  connectors: Connector[];
  connected: boolean;
  hasAppCreds: boolean;
  accountLabel: string | null;
  scope: string | null;
  expiresAt: number | null;
}

export async function listOAuthStatus(): Promise<OAuthProviderStatus[]> {
  const connections = await listConnections();
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const out: OAuthProviderStatus[] = [];
  for (const key of PROVIDER_KEYS) {
    const p = PROVIDERS[key]!;
    const conn = byProvider.get(key) ?? null;
    const creds = await loadAppCredentials(key);
    out.push({
      key,
      label: p.label,
      connectors: p.connectors,
      connected: conn !== null,
      hasAppCreds: creds !== null,
      accountLabel: conn?.accountLabel ?? null,
      scope: conn?.scope ?? null,
      expiresAt: conn?.expiresAt ?? null,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run test — expect pass**

Run: `npm test -- tests/lib/oauth/status.test.ts`
Expected: PASS.

- [ ] **Step 5: Load status in `src/app/setup/page.tsx`**

Add the import and load, and pass to the form:

```ts
import { listOAuthStatus } from '@/lib/oauth/status';
// … inside SetupPage(), after `const status = await listStatus();`
  const oauth = await listOAuthStatus();
// … change the render:
          <CredentialsForm fields={fields} oauth={oauth} />
```

- [ ] **Step 6: Render the OAuth block in `src/components/CredentialsForm.tsx`**

Import the type and add the prop:

```tsx
import type { OAuthProviderStatus } from '@/lib/oauth/status';
import { formatDeDate } from '@/lib/dates';
// …
export function CredentialsForm({ fields, oauth = [] }: { fields: FieldView[]; oauth?: OAuthProviderStatus[] }) {
```

Inside the connector `<div>` block, immediately below the `<h3>` title, insert a status/action panel for the provider that owns this connector:

```tsx
{(() => {
  const oc = oauth.find((o) => o.connectors.includes(connector as Connector));
  if (!oc) return null;
  return (
    <div className="mb-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 text-sm dark:border-neutral-800 dark:bg-neutral-950">
      {oc.connected ? (
        <div className="flex items-center justify-between gap-3">
          <span className="text-neutral-700 dark:text-neutral-300">
            ✓ Verbunden{oc.accountLabel ? ` (${oc.accountLabel})` : ''}
            {oc.expiresAt ? ` · läuft ab am ${formatDeDate(new Date(oc.expiresAt).toISOString())}` : ''}
          </span>
          <form method="post" action={`/api/oauth/${oc.key}/disconnect`}>
            <button className="text-brand hover:text-brand-dark" type="submit">Verbindung trennen</button>
          </form>
        </div>
      ) : oc.hasAppCreds ? (
        <a className="text-brand hover:text-brand-dark" href={`/api/oauth/${oc.key}/start`}>
          Mit {oc.label} verbinden →
        </a>
      ) : (
        <span className="text-neutral-500">
          OAuth Client ID/Secret unten hinterlegen, um „Mit {oc.label} verbinden" zu aktivieren.
        </span>
      )}
    </div>
  );
})()}
```

> The panel renders once per connector; for `google` it appears under both GA4 and Google Ads (same provider), which is acceptable — connecting from either authorizes both. If you prefer it once, render only when `oc.connectors[0] === connector`.

- [ ] **Step 7: Show a callback status message on `/setup`**

In `CredentialsForm` (client component), read the query params and show a banner:

```tsx
import { useSearchParams } from 'next/navigation';
// … inside the component, before `return (`:
  const sp = useSearchParams();
  const oauthMsg = sp.get('connected') ? `${sp.get('oauth')}: verbunden.`
    : sp.get('disconnected') ? `${sp.get('oauth')}: getrennt.`
    : sp.get('error') ? `${sp.get('oauth')}: Fehler — ${sp.get('error')}` : null;
// … in the JSX, near the top of the returned tree:
  {oauthMsg && <p className="text-sm text-neutral-900 dark:text-neutral-100">{oauthMsg}</p>}
```

- [ ] **Step 8: Typecheck + build the app**

Run: `npm run build`
Expected: build succeeds (no type errors in the modified page/form).

- [ ] **Step 9: Commit**

```bash
git add src/lib/oauth/status.ts src/app/setup/page.tsx src/components/CredentialsForm.tsx tests/lib/oauth/status.test.ts
git commit -m "feat: setup-page oauth status with Connect/Disconnect controls"
```

---

### Task 9: Verify Phase 1 end-to-end (Google) in a browser

**Files:** none (verification task).

- [ ] **Step 1: Bring up the stack via Docker**

Run: `cd infra/supabase && docker compose up -d && cd ../.. && npm run migrate && npm run dev`
Expected: app on `http://localhost:3000`, `oauth_connections` table present.

- [ ] **Step 2: Register the dev redirect URI**

In the Google Cloud OAuth client, add `http://localhost:3000/api/oauth/google/callback` to authorized redirect URIs, and ensure the GA4 Data API + Google Ads API are enabled.

- [ ] **Step 3: Drive the flow with Claude in Chrome**

Log in → `/setup` → enter `GOOGLE_ADS_CLIENT_ID`/`GOOGLE_ADS_CLIENT_SECRET` → save → click "Mit Google verbinden" → complete consent → confirm redirect back to `/setup?oauth=google&connected=1` and a "✓ Verbunden" panel. Verify no secret is printed in the page or console.

- [ ] **Step 4: Confirm a sync uses the OAuth token**

Run: `npm run sync:ga4 -- --days 7` and `npm run sync:google -- --days 7`
Expected: both complete without the manual service-account/refresh-token fields set.

- [ ] **Step 5: Full suite green**

Run: `npm test`
Expected: all tests pass (DB up).

- [ ] **Step 6: Commit any fixups**

```bash
git commit -am "test: verify google oauth flow end-to-end" --allow-empty
```

---

## Phase 2 — Meta (long-lived token, no refresh)

### Task 10: Meta provider adapter + app-cred fields

**Files:**
- Modify: `src/lib/oauth/providers.ts` (add `meta`)
- Modify: `src/lib/connector-fields.ts` (add `META_OAUTH_APP_ID`, `META_OAUTH_APP_SECRET`; mark `META_ACCESS_TOKEN` optional)
- Modify: `tests/lib/oauth/providers.test.ts` (add Meta cases)

**Interfaces:**
- Produces: `PROVIDERS.meta` with `connectors: ['meta']`, `scopes: ['ads_read']`, `appCredentialSource: { connector: 'meta', idField: 'META_OAUTH_APP_ID', secretField: 'META_OAUTH_APP_SECRET' }`, `exchangeCode` (code→short-lived→long-lived exchange), **no `refresh`**.

- [ ] **Step 1: Add failing Meta adapter tests**

Append to `tests/lib/oauth/providers.test.ts`:

```ts
describe('meta provider', () => {
  const REDIRECT = 'https://budp.lumeapps.de/api/oauth/meta/callback';
  it('authorize URL targets the FB dialog with ads_read', () => {
    const url = new URL(PROVIDERS.meta!.authorizeUrl(REDIRECT, 'S', creds));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v21.0/dialog/oauth');
    expect(url.searchParams.get('scope')).toBe('ads_read');
    expect(url.searchParams.get('state')).toBe('S');
  });
  it('exchangeCode exchanges code then long-lived token, no refresh token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ access_token: 'SHORT', expires_in: 3600 }))
      .mockResolvedValueOnce(res({ access_token: 'LONG', expires_in: 5184000 }));
    const token = await PROVIDERS.meta!.exchangeCode('C', REDIRECT, creds, fetchMock as unknown as typeof fetch);
    expect(token.accessToken).toBe('LONG');
    expect(token.refreshToken).toBeUndefined();
    expect(token.expiresAt).toBeGreaterThan(Date.now());
  });
  it('has no refresh method', () => { expect(PROVIDERS.meta!.refresh).toBeUndefined(); });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- tests/lib/oauth/providers.test.ts`
Expected: FAIL — `PROVIDERS.meta` undefined.

- [ ] **Step 3: Add the Meta adapter to `providers.ts`**

```ts
const META_VERSION = 'v21.0';

const meta: OAuthProvider = {
  key: 'meta',
  label: 'Meta',
  connectors: ['meta'],
  scopes: ['ads_read'],
  appCredentialSource: { connector: 'meta', idField: 'META_OAUTH_APP_ID', secretField: 'META_OAUTH_APP_SECRET' },
  authorizeUrl(redirectUri, state, creds) {
    const p = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.scopes.join(','),
      state,
    });
    return `https://www.facebook.com/${META_VERSION}/dialog/oauth?${p.toString()}`;
  },
  async exchangeCode(code, redirectUri, creds, fetchImpl = fetch) {
    // 1) code → short-lived token (GET with query params)
    const shortUrl = new URL(`https://graph.facebook.com/${META_VERSION}/oauth/access_token`);
    shortUrl.search = new URLSearchParams({
      client_id: creds.clientId, client_secret: creds.clientSecret, redirect_uri: redirectUri, code,
    }).toString();
    const shortRes = await fetchImpl(shortUrl.toString());
    if (!shortRes.ok) throw new Error(`meta token endpoint ${shortRes.status}: ${await shortRes.text()}`);
    const shortJson = (await shortRes.json()) as Record<string, unknown>;

    // 2) short-lived → long-lived (~60 days)
    const longUrl = new URL(`https://graph.facebook.com/${META_VERSION}/oauth/access_token`);
    longUrl.search = new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: creds.clientId, client_secret: creds.clientSecret,
      fb_exchange_token: String(shortJson.access_token),
    }).toString();
    const longRes = await fetchImpl(longUrl.toString());
    if (!longRes.ok) throw new Error(`meta token exchange ${longRes.status}: ${await longRes.text()}`);
    const longJson = (await longRes.json()) as Record<string, unknown>;
    return {
      accessToken: String(longJson.access_token),
      expiresAt: expiryFrom(longJson, Date.now()),
    };
  },
  // no refresh — user must reconnect on expiry
};
```

Add `meta` to the `PROVIDERS` object: `export const PROVIDERS: Partial<Record<ProviderKey, OAuthProvider>> = { google, meta };`

- [ ] **Step 4: Add Meta app-cred fields + mark token optional in `connector-fields.ts`**

```ts
  meta: [
    { field: 'META_OAUTH_APP_ID', label: 'OAuth App ID', secret: false, optional: true },
    { field: 'META_OAUTH_APP_SECRET', label: 'OAuth App Secret', secret: true, optional: true },
    { field: 'META_ACCESS_TOKEN', label: 'Access Token (Fallback)', secret: true, optional: true },
    { field: 'META_AD_ACCOUNT_ID', label: 'Ad Account ID', secret: false, optional: false },
    { field: 'META_PURCHASE_ACTION_TYPE', label: 'Purchase Action Type', secret: false, optional: true },
  ],
```

- [ ] **Step 5: Run adapter tests — expect pass**

Run: `npm test -- tests/lib/oauth/providers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/oauth/providers.ts src/lib/connector-fields.ts tests/lib/oauth/providers.test.ts
git commit -m "feat: meta oauth adapter (long-lived token, no refresh)"
```

---

### Task 11: Wire Meta connector — OAuth-first, manual fallback

**Files:**
- Modify: `scripts/sync-meta.ts`
- Create: `tests/lib/oauth/token-meta.test.ts`

**Interfaces:**
- Consumes: `isConnected`, `getOAuthAccessToken` (`@/lib/oauth/token`).

- [ ] **Step 1: Write the failing Meta expiry test**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/oauth/store', () => ({ getConnection: vi.fn(), saveConnection: vi.fn() }));
vi.mock('@/lib/credentials', () => ({ getCredential: vi.fn() }));
import { getOAuthAccessToken } from '@/lib/oauth/token';
import { getConnection } from '@/lib/oauth/store';

const NOW = 1_000_000_000_000;
beforeEach(() => { vi.mocked(getConnection).mockReset(); });

describe('meta token (no refresh)', () => {
  it('returns the token while valid', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'meta', accessToken: 'LONG', refreshToken: null, expiresAt: NOW + 60_000_000, scope: null, accountLabel: null, updatedAt: '',
    });
    expect(await getOAuthAccessToken('meta', { now: NOW })).toBe('LONG');
  });
  it('throws "neu verbinden" once expired (no refresh available)', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'meta', accessToken: 'LONG', refreshToken: null, expiresAt: NOW - 1000, scope: null, accountLabel: null, updatedAt: '',
    });
    await expect(getOAuthAccessToken('meta', { now: NOW })).rejects.toThrow(/neu verbinden/i);
  });
});
```

- [ ] **Step 2: Run — expect pass immediately**

Run: `npm test -- tests/lib/oauth/token-meta.test.ts`
Expected: PASS — the resolver already handles the no-refresh case (Task 4). This test locks the Meta contract in.

- [ ] **Step 3: Modify `scripts/sync-meta.ts`**

```ts
import { isConnected, getOAuthAccessToken } from '../src/lib/oauth/token';
// …
async function main() {
  const cfg = await loadConnectorConfig('meta');
  const purchaseActionType = cfg.META_PURCHASE_ACTION_TYPE ?? 'purchase';
  const days = parseDays(process.argv);

  const accessToken = (await isConnected('meta'))
    ? await getOAuthAccessToken('meta')
    : cfg.META_ACCESS_TOKEN;
  const client = new MetaClient(accessToken, cfg.META_AD_ACCOUNT_ID);
  // …rest unchanged…
```

> `loadConnectorConfig('meta')` no longer requires `META_ACCESS_TOKEN` (now optional). `META_AD_ACCOUNT_ID` stays required.

- [ ] **Step 4: Run — expect pass**

Run: `npm test -- tests/lib/oauth tests/connectors/meta`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/sync-meta.ts tests/lib/oauth/token-meta.test.ts
git commit -m "feat: meta connector prefers oauth token, falls back to manual"
```

---

## Phase 3 — TikTok (access + refresh token)

### Task 12: TikTok provider adapter + app-cred fields

**Files:**
- Modify: `src/lib/oauth/providers.ts` (add `tiktok`)
- Modify: `src/lib/connector-fields.ts` (add `TIKTOK_OAUTH_APP_ID`, `TIKTOK_OAUTH_APP_SECRET`; mark `TIKTOK_ACCESS_TOKEN` optional)
- Modify: `tests/lib/oauth/providers.test.ts` (add TikTok cases)

**Interfaces:**
- Produces: `PROVIDERS.tiktok` with `connectors: ['tiktok']`, `appCredentialSource: { connector: 'tiktok', idField: 'TIKTOK_OAUTH_APP_ID', secretField: 'TIKTOK_OAUTH_APP_SECRET' }`, `exchangeCode` + `refresh` per TikTok Business API.

- [ ] **Step 1: Add failing TikTok adapter tests**

Append to `tests/lib/oauth/providers.test.ts`:

```ts
describe('tiktok provider', () => {
  const REDIRECT = 'https://budp.lumeapps.de/api/oauth/tiktok/callback';
  it('authorize URL carries app_id, redirect and state', () => {
    const url = new URL(PROVIDERS.tiktok!.authorizeUrl(REDIRECT, 'S', creds));
    expect(url.searchParams.get('app_id')).toBe('CID');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('state')).toBe('S');
  });
  it('exchangeCode reads token from data envelope', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ code: 0, data: { access_token: 'AT', refresh_token: 'RT', access_token_expire_in: 86400 } }));
    const token = await PROVIDERS.tiktok!.exchangeCode('C', REDIRECT, creds, fetchMock as unknown as typeof fetch);
    expect(token).toMatchObject({ accessToken: 'AT', refreshToken: 'RT' });
    expect(token.expiresAt).toBeGreaterThan(Date.now());
  });
  it('refresh uses refresh_token grant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ code: 0, data: { access_token: 'AT2', refresh_token: 'RT2', access_token_expire_in: 86400 } }));
    const token = await PROVIDERS.tiktok!.refresh!({ accessToken: 'old', refreshToken: 'RT' }, creds, fetchMock as unknown as typeof fetch);
    expect(token).toMatchObject({ accessToken: 'AT2', refreshToken: 'RT2' });
  });
});
```

- [ ] **Step 2: Run — expect fail**

Run: `npm test -- tests/lib/oauth/providers.test.ts`
Expected: FAIL — `PROVIDERS.tiktok` undefined.

- [ ] **Step 3: Add the TikTok adapter to `providers.ts`**

```ts
const TIKTOK_BASE = 'https://business-api.tiktok.com';

function tiktokEnvelope(json: Record<string, unknown>, provider = 'tiktok'): Record<string, unknown> {
  if (Number(json.code) !== 0) throw new Error(`${provider} token error code ${json.code}: ${json.message ?? ''}`);
  return (json.data ?? {}) as Record<string, unknown>;
}
function tiktokExpiry(data: Record<string, unknown>, nowMs: number): number | undefined {
  const secs = Number(data.access_token_expire_in);
  return Number.isFinite(secs) ? nowMs + secs * 1000 : undefined;
}

const tiktok: OAuthProvider = {
  key: 'tiktok',
  label: 'TikTok',
  connectors: ['tiktok'],
  scopes: [],
  appCredentialSource: { connector: 'tiktok', idField: 'TIKTOK_OAUTH_APP_ID', secretField: 'TIKTOK_OAUTH_APP_SECRET' },
  authorizeUrl(redirectUri, state, creds) {
    const p = new URLSearchParams({ app_id: creds.clientId, redirect_uri: redirectUri, state });
    return `${TIKTOK_BASE}/portal/auth?${p.toString()}`;
  },
  async exchangeCode(code, _redirectUri, creds, fetchImpl = fetch) {
    const data = tiktokEnvelope(await postToken(
      'tiktok', `${TIKTOK_BASE}/open_api/v1.3/oauth2/access_token/`,
      { app_id: creds.clientId, secret: creds.clientSecret, auth_code: code, grant_type: 'authorization_code' },
      fetchImpl,
    ));
    return {
      accessToken: String(data.access_token),
      refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
      expiresAt: tiktokExpiry(data, Date.now()),
    };
  },
  async refresh(current, creds, fetchImpl = fetch) {
    const data = tiktokEnvelope(await postToken(
      'tiktok', `${TIKTOK_BASE}/open_api/v1.3/oauth2/refresh_token/`,
      { app_id: creds.clientId, secret: creds.clientSecret, refresh_token: current.refreshToken ?? '', grant_type: 'refresh_token' },
      fetchImpl,
    ));
    return {
      accessToken: String(data.access_token),
      refreshToken: data.refresh_token ? String(data.refresh_token) : current.refreshToken,
      expiresAt: tiktokExpiry(data, Date.now()),
    };
  },
};
```

Add `tiktok` to `PROVIDERS`: `{ google, meta, tiktok }`.

- [ ] **Step 4: Add TikTok app-cred fields + mark token optional in `connector-fields.ts`**

```ts
  tiktok: [
    { field: 'TIKTOK_OAUTH_APP_ID', label: 'OAuth App ID', secret: false, optional: true },
    { field: 'TIKTOK_OAUTH_APP_SECRET', label: 'OAuth App Secret', secret: true, optional: true },
    { field: 'TIKTOK_ACCESS_TOKEN', label: 'Access Token (Fallback)', secret: true, optional: true },
    { field: 'TIKTOK_ADVERTISER_ID', label: 'Advertiser ID', secret: false, optional: false },
    { field: 'TIKTOK_VALUE_METRIC', label: 'Value-Metrik', secret: false, optional: true },
    { field: 'TIKTOK_VIDEO_METRIC', label: 'Video-Metrik', secret: false, optional: true },
  ],
```

- [ ] **Step 5: Run adapter tests — expect pass**

Run: `npm test -- tests/lib/oauth/providers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/oauth/providers.ts src/lib/connector-fields.ts tests/lib/oauth/providers.test.ts
git commit -m "feat: tiktok oauth adapter (access + refresh token)"
```

---

### Task 13: Wire TikTok connector — OAuth-first, manual fallback

**Files:**
- Modify: `scripts/sync-tiktok.ts`

**Interfaces:**
- Consumes: `isConnected`, `getOAuthAccessToken` (`@/lib/oauth/token`).

- [ ] **Step 1: Modify `scripts/sync-tiktok.ts`**

```ts
import { isConnected, getOAuthAccessToken } from '../src/lib/oauth/token';
// … inside main(), after loading cfg + days:
  const accessToken = (await isConnected('tiktok'))
    ? await getOAuthAccessToken('tiktok')
    : cfg.TIKTOK_ACCESS_TOKEN;
  const client = new TikTokClient(
    accessToken,
    cfg.TIKTOK_ADVERTISER_ID,
    cfg.TIKTOK_VALUE_METRIC ?? 'complete_payment_roas',
    cfg.TIKTOK_VIDEO_METRIC ?? 'video_play_actions',
  );
  // …rest unchanged…
```

> Adjust the metric defaults to match the existing values already used in `scripts/sync-tiktok.ts` — copy them verbatim from the current file rather than guessing.

- [ ] **Step 2: Run the TikTok + oauth tests**

Run: `npm test -- tests/connectors/tiktok tests/lib/oauth`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add scripts/sync-tiktok.ts
git commit -m "feat: tiktok connector prefers oauth token, falls back to manual"
```

---

### Task 14: Final verification + docs

**Files:**
- Modify: `README.md` (Connectors / Auth section — note the OAuth "Connect" flow)

- [ ] **Step 1: Full suite + build (DB up)**

Run: `npm test && npm run build`
Expected: all tests pass; build succeeds.

- [ ] **Step 2: Browser verification for Meta + TikTok**

Register `…/api/oauth/meta/callback` and `…/api/oauth/tiktok/callback` in each provider console (localhost + prod). Enter each provider's OAuth App ID/Secret on `/setup`, click "Mit … verbinden", complete consent, confirm the "✓ Verbunden" panel and a `?connected=1` redirect.

- [ ] **Step 3: Update `README.md`**

Under **Connectors**/**Auth**, add a short paragraph: connector credentials can now be provided either by pasting tokens (fallback) or via a "Mit … verbinden" OAuth flow in *Einstellungen → Verbindungen* for Google (GA4 + Ads), Meta, and TikTok; tokens are stored AES-256-GCM-encrypted in `oauth_connections`. Note that Meta uses a ~60-day long-lived token that must be re-connected on expiry, and that each provider's console must whitelist both the localhost and production callback URIs.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: document the OAuth connect flow for external systems"
```

- [ ] **Step 5: Open the PR**

```bash
git push -u origin worktree-oauth-external-systems
gh pr create --title "feat: OAuth connect flow for Google, Meta, TikTok" --body "Implements docs/superpowers/specs/2026-07-02-oauth-external-systems-design.md"
```

---

## Self-Review

**Spec coverage:**
- Provider≠connector, Google covers GA4+Ads → Tasks 2, 6. ✓
- `oauth_connections` table, RLS no public policy → Task 1. ✓
- Encrypted token store → Task 3. ✓
- Provider adapter interface + Google/Meta/TikTok specifics → Tasks 2, 10, 12. ✓
- Token resolver with lazy refresh, Meta no-refresh reconnect → Tasks 4, 11. ✓
- Routes start/callback + state CSRF, redirect-URI from forwarded headers → Task 5. ✓
- App-cred fields in vault; Google reuses Ads client id/secret; manual fields kept as fallback → Tasks 6, 7, 10, 12. ✓
- Connector integration OAuth-first, manual-fallback (GA4, Ads, Meta, TikTok) → Tasks 6, 11, 13. ✓
- UI status + Connect/Disconnect + callback messages → Task 8. ✓
- Error handling (consent denied, state mismatch, exchange/refresh failure) → Tasks 4, 5. ✓
- Tests: adapters, resolver, routes, fallback selection, RLS → Tasks 1–5, 11. ✓
- Phased Google→Meta→TikTok, each builds/tests green → phase structure. ✓
- Out-of-scope items (multi-tenant, background refresh jobs, webhooks, Shopware/Klaviyo) → not implemented. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code. The two "adjust to match existing file" notes (sync-ga4 config loading, TikTok metric defaults) point at concrete existing values to copy — not invented behavior.

**Type consistency:** `TokenSet`, `AppCredentials`, `OAuthProvider`, `OAuthConnection`, `ProviderKey`, `getOAuthAccessToken(provider, opts)`, `isConnected`, `loadAppCredentials`, `getConnection`/`saveConnection`/`deleteConnection`/`listConnections`, `getProvider`/`PROVIDERS`/`PROVIDER_KEYS`, `redirectUriFor`/`STATE_COOKIE`, `listOAuthStatus`/`OAuthProviderStatus` are used consistently across tasks.
