# Amazon Ads via social-platform-sync Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Amazon Ads ad spend lands in `ad_spend`/`daily_metrics` via a System-A connector whose credentials come from the social-platform-sync hub; `amazon_sp` gets the connect flow only.

**Architecture:** A thin hub client (`src/lib/hub.ts`) fetches per-sync-run credentials from the hub's machine API (`GET /api/v1/credentials/:provider`, Bearer API key) — ecom stores no Amazon tokens. A new `src/connectors/amazon-ads/` mirrors the Meta connector (client → normalize → write) but speaks the Ads Reporting API v3 (async report jobs, gzip JSON). The setup page gets hub-driven connect buttons that redirect through the hub's consent flow. Spec: `docs/superpowers/specs/2026-07-22-amazon-ads-hub-integration-design.md`.

**Tech Stack:** Next.js 14 (app router), TypeScript, Postgres (raw `pg`), Vitest, `tsx` sync scripts. Tests run against the dev Postgres (see `tests/` conventions; `npx vitest run` runs everything).

## Global Constraints

- Hub base: the deployed hub is `https://hub.lumeapps.de`; API paths `POST /api/v1/connect-sessions` (body `{provider, returnUrl}` → `{url}`), `GET /api/v1/credentials/{provider}` → `{accessToken, expiresAt, accountConfig, clientId?}`; auth `Authorization: Bearer {apiKey}`; errors `404 {error:'not_connected'}`, `424 {error:'reconnect_required'}`.
- Amazon Ads Reporting API v3, EU host `https://advertising-api-eu.amazon.com` only. Report windows are limited to **31 days per report** and ~**95 days lookback**; the client chunks accordingly (default 90 days).
- Provider keys are exactly `amazon_ads` and `amazon_sp`. The vault connector for hub config is exactly `hub` with fields `HUB_URL`, `HUB_API_KEY`.
- `ad_spend.platform` value is exactly `amazon_ads` (matches `src/verkauf/ad-channel-map.ts`).
- ecom-platform stores **no Amazon tokens** — credentials are fetched per run and held in memory only.
- All user-facing copy is German, sentence case, design-system tokens only (warm `neutral`, `accent`, `.anno`; `dark:` variants required). No emoji in UI copy.
- **Never run the app locally** (repo CLAUDE.md) — browser verification happens on the VPS after the gated deploy. Automated tests run locally.
- TDD; every task leaves the full suite green (`npx vitest run`). Conventional commits on branch `feat/amazon-ads-hub-connector` (exists, holds the spec); delivery via PR, never push `main`.

---

### Task 1: Registry — `hub` + `amazon_ads` connector entries, runner mapping

**Files:**
- Modify: `src/lib/connector-fields.ts`
- Modify: `src/lib/sync/runner.ts`
- Test: `tests/lib/connector-fields.test.ts` (create), existing suite as regression net

**Interfaces:**
- Consumes: nothing new.
- Produces: `Connector` union gains `'hub' | 'amazon_ads'`; `CONNECTOR_FIELDS.hub = [HUB_URL, HUB_API_KEY]`, `CONNECTOR_FIELDS.amazon_ads = []`; `CONNECTOR_LABELS` and `CONNECTOR_GROUPS` entries; `SYNC_EXCLUDED: Connector[]` (contains `'hub'`) and `CREDENTIAL_SOURCE: Partial<Record<Connector, Connector>>` (`amazon_ads → hub`) exported from `connector-fields.ts`; runner derives sync list minus `SYNC_EXCLUDED` and gates `amazon_ads` on the `hub` vault entry. Tasks 2–6 rely on the union members; Task 6 relies on the runner running `npm run sync:amazon_ads`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/connector-fields.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { CONNECTOR_FIELDS, CONNECTOR_LABELS, CONNECTOR_GROUPS, SYNC_EXCLUDED, CREDENTIAL_SOURCE } from '@/lib/connector-fields';
import { SYNC_CONNECTORS } from '@/lib/sync/runner';

describe('hub + amazon_ads registry entries', () => {
  it('registers hub with URL/API-Key fields and amazon_ads without own fields', () => {
    expect(CONNECTOR_FIELDS.hub.map((f) => f.field)).toEqual(['HUB_URL', 'HUB_API_KEY']);
    expect(CONNECTOR_FIELDS.hub.find((f) => f.field === 'HUB_API_KEY')?.secret).toBe(true);
    expect(CONNECTOR_FIELDS.amazon_ads).toEqual([]);
    expect(CONNECTOR_LABELS.hub).toBe('Verbindungs-Hub');
    expect(CONNECTOR_LABELS.amazon_ads).toBe('Amazon Ads');
    expect(CONNECTOR_GROUPS.flatMap((g) => g.connectors)).toContain('amazon_ads');
  });

  it('hub is excluded from sync; amazon_ads is gated on hub credentials', () => {
    expect(SYNC_EXCLUDED).toContain('hub');
    expect(CREDENTIAL_SOURCE.amazon_ads).toBe('hub');
    const keys = SYNC_CONNECTORS.map((c) => c.key);
    expect(keys).toContain('amazon_ads');
    expect(keys).not.toContain('hub');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/lib/connector-fields.test.ts`
Expected: FAIL — `Property 'hub' does not exist` / imports missing.

- [ ] **Step 3: Extend the registry**

In `src/lib/connector-fields.ts`:

```ts
export type Connector = 'shopware' | 'woocommerce' | 'ga4' | 'klaviyo' | 'mailchimp' | 'meta' | 'tiktok' | 'google' | 'hub' | 'amazon_ads';
```

Append to `CONNECTOR_FIELDS` (after `google`):

```ts
  hub: [
    { field: 'HUB_URL', label: 'Hub-URL', secret: false, optional: false },
    { field: 'HUB_API_KEY', label: 'API-Key', secret: true, optional: false },
  ],
  // Credentials liegen im Hub (social-platform-sync), nicht lokal.
  amazon_ads: [],
```

Append to `CONNECTOR_LABELS`:

```ts
  hub: 'Verbindungs-Hub',
  amazon_ads: 'Amazon Ads',
```

In `CONNECTOR_GROUPS`, add `'amazon_ads'` to the `Werbung` group and a new group at the end:

```ts
  { title: 'Werbung', connectors: ['meta', 'tiktok', 'google', 'amazon_ads'] },
  ...
  { title: 'Hub', connectors: ['hub'] },
```

Append below `CONNECTOR_GROUPS`:

```ts
// Registry entries that are configuration-only and must never appear in the sync scheduler.
export const SYNC_EXCLUDED: Connector[] = ['hub'];

// Connectors whose "configured" state comes from another vault entry (credentials live elsewhere).
export const CREDENTIAL_SOURCE: Partial<Record<Connector, Connector>> = { amazon_ads: 'hub' };
```

- [ ] **Step 4: Wire the runner**

In `src/lib/sync/runner.ts`, change the import and the two derivations:

```ts
import { CONNECTORS, CONNECTOR_LABELS, SYNC_EXCLUDED, CREDENTIAL_SOURCE, type Connector } from '@/lib/connector-fields';
```

```ts
export const SYNC_CONNECTORS: { key: Connector; label: string }[] =
  CONNECTORS.filter((key) => !SYNC_EXCLUDED.includes(key)).map((key) => ({ key, label: CONNECTOR_LABELS[key] }));
```

In `listSyncState` and `runAll`, resolve the credential source when checking `configured`:

```ts
        configured: configured.has(CREDENTIAL_SOURCE[c.key] ?? c.key),
```

(in `listSyncState`'s returned row) and

```ts
  const keys = SYNC_CONNECTORS.filter((c) => configured.has(CREDENTIAL_SOURCE[c.key] ?? c.key)).map((c) => c.key);
```

(in `runAll`).

- [ ] **Step 5: Run the new test, then the full suite**

Run: `npx vitest run tests/lib/connector-fields.test.ts` → PASS.
Run: `npx vitest run`
Expected: PASS. If a pre-existing test enumerates `CONNECTORS` and now sees `hub`/`amazon_ads` (e.g. credentials or setup-page tests), extend its expectation to include them — do not weaken assertions.

- [ ] **Step 6: Commit**

```bash
git add src/lib/connector-fields.ts src/lib/sync/runner.ts tests/lib/connector-fields.test.ts
git commit -m "feat: register hub and amazon_ads connectors, gate amazon_ads sync on hub config"
```

---

### Task 2: Hub client (`src/lib/hub.ts`)

**Files:**
- Create: `src/lib/hub.ts`
- Test: `tests/lib/hub.test.ts`

**Interfaces:**
- Consumes: `getCredentials('hub')` from `src/lib/credentials.ts` (Task 1 registered the `hub` entry).
- Produces (Tasks 3 and 6 rely on these exact signatures):

```ts
export type HubProvider = 'amazon_ads' | 'amazon_sp';
export interface HubCredentials {
  accessToken: string;
  expiresAt: string | null;
  accountConfig: Record<string, string>;
  clientId?: string;
}
export type HubConnectionState = 'verbunden' | 'nicht verbunden' | 'neu verbinden' | 'nicht konfiguriert' | 'fehler';
export class HubNotConfiguredError extends Error {}
export async function getHubCredentials(provider: HubProvider, fetchImpl?: typeof fetch): Promise<HubCredentials>;
export async function createHubConnectSession(provider: HubProvider, returnUrl: string, fetchImpl?: typeof fetch): Promise<string>; // returns consent URL
export async function probeHubConnection(provider: HubProvider, fetchImpl?: typeof fetch): Promise<HubConnectionState>;
```

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/hub.test.ts` (the vault lives in the dev Postgres like `tests/lib/credentials.test.ts`; mirror its DB setup/teardown conventions — read that file first and reuse its helper imports verbatim):

```ts
import { describe, it, expect, beforeAll, vi } from 'vitest';
import { setCredential } from '@/lib/credentials';
import { getHubCredentials, createHubConnectSession, probeHubConnection, HubNotConfiguredError } from '@/lib/hub';

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe('hub client', () => {
  beforeAll(async () => {
    await setCredential('hub', 'HUB_URL', 'https://hub.test');
    await setCredential('hub', 'HUB_API_KEY', 'key-123');
  });

  it('fetches credentials with the bearer key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ accessToken: 'at', expiresAt: null, accountConfig: { profileId: '111' }, clientId: 'lwa-id' }));
    const creds = await getHubCredentials('amazon_ads', fetchMock as unknown as typeof fetch);
    expect(creds.accessToken).toBe('at');
    expect(creds.accountConfig.profileId).toBe('111');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hub.test/api/v1/credentials/amazon_ads');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer key-123' });
  });

  it('maps hub error responses to German errors', async () => {
    const f404 = vi.fn().mockResolvedValue(res({ error: 'not_connected' }, 404));
    await expect(getHubCredentials('amazon_ads', f404 as unknown as typeof fetch)).rejects.toThrow(/nicht verbunden/);
    const f424 = vi.fn().mockResolvedValue(res({ error: 'reconnect_required' }, 424));
    await expect(getHubCredentials('amazon_ads', f424 as unknown as typeof fetch)).rejects.toThrow(/neu verbinden/i);
  });

  it('creates a connect session and returns the consent url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ url: 'https://hub.test/connect/tok' }, 201));
    const url = await createHubConnectSession('amazon_sp', 'https://budp.test/setup', fetchMock as unknown as typeof fetch);
    expect(url).toBe('https://hub.test/connect/tok');
    const [reqUrl, init] = fetchMock.mock.calls[0];
    expect(reqUrl).toBe('https://hub.test/api/v1/connect-sessions');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ provider: 'amazon_sp', returnUrl: 'https://budp.test/setup' });
  });

  it('probes connection state without throwing', async () => {
    const ok = vi.fn().mockResolvedValue(res({ accessToken: 'at', expiresAt: null, accountConfig: {} }));
    expect(await probeHubConnection('amazon_ads', ok as unknown as typeof fetch)).toBe('verbunden');
    const notConn = vi.fn().mockResolvedValue(res({ error: 'not_connected' }, 404));
    expect(await probeHubConnection('amazon_ads', notConn as unknown as typeof fetch)).toBe('nicht verbunden');
    const recon = vi.fn().mockResolvedValue(res({ error: 'reconnect_required' }, 424));
    expect(await probeHubConnection('amazon_ads', recon as unknown as typeof fetch)).toBe('neu verbinden');
    const boom = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await probeHubConnection('amazon_ads', boom as unknown as typeof fetch)).toBe('fehler');
  });
});
```

Note: `HubNotConfiguredError` is covered implicitly — do not delete the `hub` vault rows mid-file (other tests share the DB); the „nicht konfiguriert" probe branch is unit-covered by the route test in Task 3.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/lib/hub.test.ts`
Expected: FAIL — module `@/lib/hub` not found.

- [ ] **Step 3: Implement**

Create `src/lib/hub.ts`:

```ts
import { getCredentials } from '@/lib/credentials';

export type HubProvider = 'amazon_ads' | 'amazon_sp';

export interface HubCredentials {
  accessToken: string;
  expiresAt: string | null;
  accountConfig: Record<string, string>;
  clientId?: string;
}

export type HubConnectionState = 'verbunden' | 'nicht verbunden' | 'neu verbinden' | 'nicht konfiguriert' | 'fehler';

export class HubNotConfiguredError extends Error {
  constructor() { super('Hub-URL/API-Key fehlen — bitte auf /setup hinterlegen.'); }
}

async function hubConfig(): Promise<{ url: string; apiKey: string }> {
  const cfg = await getCredentials('hub');
  if (!cfg.HUB_URL || !cfg.HUB_API_KEY) throw new HubNotConfiguredError();
  return { url: cfg.HUB_URL.replace(/\/$/, ''), apiKey: cfg.HUB_API_KEY };
}

export async function getHubCredentials(provider: HubProvider, fetchImpl: typeof fetch = fetch): Promise<HubCredentials> {
  const { url, apiKey } = await hubConfig();
  const res = await fetchImpl(`${url}/api/v1/credentials/${provider}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 404) throw new Error(`${provider} ist im Hub nicht verbunden — bitte auf /setup verbinden.`);
  if (res.status === 424) throw new Error(`${provider}-Verbindung im Hub abgelaufen — bitte neu verbinden.`);
  if (!res.ok) throw new Error(`Hub credentials ${provider} fehlgeschlagen: ${res.status} ${await res.text()}`);
  return (await res.json()) as HubCredentials;
}

export async function createHubConnectSession(provider: HubProvider, returnUrl: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const { url, apiKey } = await hubConfig();
  const res = await fetchImpl(`${url}/api/v1/connect-sessions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, returnUrl }),
  });
  if (!res.ok) throw new Error(`Hub connect-session ${provider} fehlgeschlagen: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { url: string }).url;
}

export async function probeHubConnection(provider: HubProvider, fetchImpl: typeof fetch = fetch): Promise<HubConnectionState> {
  try {
    await getHubCredentials(provider, fetchImpl);
    return 'verbunden';
  } catch (err) {
    if (err instanceof HubNotConfiguredError) return 'nicht konfiguriert';
    const msg = err instanceof Error ? err.message : '';
    if (msg.includes('nicht verbunden')) return 'nicht verbunden';
    if (msg.includes('neu verbinden')) return 'neu verbinden';
    return 'fehler';
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/lib/hub.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/hub.ts tests/lib/hub.test.ts
git commit -m "feat: hub client for credentials, connect sessions, and status probes"
```

---

### Task 3: Connect route + setup-page hub section

**Files:**
- Create: `src/app/api/hub/[provider]/connect/route.ts`
- Create: `src/components/HubConnections.tsx`
- Modify: `src/app/(shell)/setup/page.tsx`
- Test: `tests/app/hub-connect-route.test.ts`

**Interfaces:**
- Consumes: `createHubConnectSession`, `probeHubConnection`, `HubNotConfiguredError` from Task 2; `resolveOrigin` from `src/lib/oauth/redirect.ts`.
- Produces: `GET /api/hub/{amazon_ads|amazon_sp}/connect` → 307 to the hub consent URL; `<HubConnections states={...} />` server-rendered section on `/setup`.

- [ ] **Step 1: Write the failing route test**

Look at an existing route test under `tests/app/` first and mirror its import/mocking conventions. Create `tests/app/hub-connect-route.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/hub', () => ({
  createHubConnectSession: vi.fn(),
  HubNotConfiguredError: class HubNotConfiguredError extends Error {},
}));

import { GET } from '@/app/api/hub/[provider]/connect/route';
import { createHubConnectSession, HubNotConfiguredError } from '@/lib/hub';

describe('GET /api/hub/[provider]/connect', () => {
  beforeEach(() => vi.mocked(createHubConnectSession).mockReset());

  it('redirects to the hub consent url with a /setup return url', async () => {
    vi.mocked(createHubConnectSession).mockResolvedValue('https://hub.test/connect/tok');
    const res = await GET(new Request('https://budp.test/api/hub/amazon_ads/connect'), { params: { provider: 'amazon_ads' } });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://hub.test/connect/tok');
    expect(vi.mocked(createHubConnectSession).mock.calls[0]).toEqual(['amazon_ads', 'https://budp.test/setup']);
  });

  it('rejects unknown providers with 404', async () => {
    const res = await GET(new Request('https://budp.test/api/hub/google/connect'), { params: { provider: 'google' } });
    expect(res.status).toBe(404);
  });

  it('maps a missing hub config to 400 with a German message', async () => {
    vi.mocked(createHubConnectSession).mockRejectedValue(new (HubNotConfiguredError as unknown as { new (): Error })());
    const res = await GET(new Request('https://budp.test/api/hub/amazon_ads/connect'), { params: { provider: 'amazon_ads' } });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/app/hub-connect-route.test.ts`
Expected: FAIL — route module not found.

- [ ] **Step 3: Implement the route**

Create `src/app/api/hub/[provider]/connect/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { createHubConnectSession, HubNotConfiguredError, type HubProvider } from '@/lib/hub';
import { resolveOrigin } from '@/lib/oauth/redirect';

export const dynamic = 'force-dynamic';

const HUB_PROVIDERS: HubProvider[] = ['amazon_ads', 'amazon_sp'];

export async function GET(request: Request, { params }: { params: { provider: string } }) {
  if (!HUB_PROVIDERS.includes(params.provider as HubProvider)) {
    return NextResponse.json({ error: 'unknown provider' }, { status: 404 });
  }
  const { proto, host } = resolveOrigin(request);
  try {
    const url = await createHubConnectSession(params.provider as HubProvider, `${proto}://${host}/setup`);
    return NextResponse.redirect(url);
  } catch (err) {
    if (err instanceof HubNotConfiguredError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Hub-Fehler' }, { status: 502 });
  }
}
```

Check `resolveOrigin`'s actual return shape in `src/lib/oauth/redirect.ts` before using it — if it returns something other than `{ proto, host }`, adapt the origin construction (and the test stays unchanged since it only asserts the returnUrl string).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/app/hub-connect-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Implement the setup-page section (no separate test — covered by build + VPS browser check)**

Create `src/components/HubConnections.tsx` (server component, styled with existing setup-page conventions):

```tsx
import type { HubConnectionState } from '@/lib/hub';

const PROVIDER_LABELS: Record<string, string> = {
  amazon_ads: 'Amazon Ads',
  amazon_sp: 'Amazon Seller Central',
};

const STATE_STYLES: Record<HubConnectionState, string> = {
  'verbunden': 'text-success',
  'nicht verbunden': 'text-neutral-500 dark:text-neutral-400',
  'neu verbinden': 'text-warning',
  'nicht konfiguriert': 'text-neutral-500 dark:text-neutral-400',
  'fehler': 'text-danger',
};

export function HubConnections({ states }: { states: { provider: string; state: HubConnectionState }[] }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-0 p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h3 className="anno mb-3 text-neutral-500 dark:text-neutral-400">Hub-Verbindungen (Amazon)</h3>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Amazon wird über den Verbindungs-Hub angebunden — Zugangsdaten und Token-Refresh liegen im Hub, nicht in dieser Instanz.
      </p>
      <ul className="space-y-2">
        {states.map(({ provider, state }) => (
          <li key={provider} className="flex items-center justify-between text-sm">
            <span className="text-neutral-900 dark:text-neutral-100">{PROVIDER_LABELS[provider] ?? provider}</span>
            <span className="flex items-center gap-4">
              <span className={STATE_STYLES[state]}>{state}</span>
              {state !== 'nicht konfiguriert' && state !== 'verbunden' && state !== 'fehler' && (
                <a className="text-accent hover:text-accent-hover" href={`/api/hub/${provider}/connect`}>
                  Verbinden →
                </a>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

In `src/app/(shell)/setup/page.tsx`: import `probeHubConnection` from `@/lib/hub` and `HubConnections` from `@/components/HubConnections`; inside `SetupPage`, after the `demoAds` line add:

```ts
  const hubStates = await Promise.all(
    (['amazon_ads', 'amazon_sp'] as const).map(async (provider) => ({ provider, state: await probeHubConnection(provider) })),
  );
```

and render `<HubConnections states={hubStates} />` inside the existing `Verbindungen` section `<div>`, directly after `<CredentialsForm fields={fields} oauth={oauth} />`.

- [ ] **Step 6: Full suite + build**

Run: `npx vitest run && npm run build`
Expected: all PASS; build typechecks the new page/component.

- [ ] **Step 7: Commit**

```bash
git add "src/app/api/hub/[provider]/connect/route.ts" src/components/HubConnections.tsx "src/app/(shell)/setup/page.tsx" tests/app/hub-connect-route.test.ts
git commit -m "feat: hub connect flow and Amazon connection status on /setup"
```

---

### Task 4: Amazon Ads Reporting client

**Files:**
- Create: `src/connectors/amazon-ads/types.ts`
- Create: `src/connectors/amazon-ads/client.ts`
- Test: `tests/connectors/amazon-ads/client.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (credentials arrive as constructor args).
- Produces (Task 5/6 rely on these):

```ts
// types.ts
export interface AmazonAdsReportRow {
  date: string;          // YYYY-MM-DD
  cost: number;
  impressions: number;
  clicks: number;
  purchases14d: number;
  sales14d: number;
}
// client.ts
export class AmazonAdsClient {
  constructor(accessToken: string, clientId: string, profileId: string,
    fetchImpl?: typeof fetch, sleepImpl?: (ms: number) => Promise<void>);
  fetchDailyReport(days: number): Promise<AmazonAdsReportRow[]>;
}
```

- [ ] **Step 1: Write the failing tests**

Create `tests/connectors/amazon-ads/client.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { AmazonAdsClient } from '@/connectors/amazon-ads/client';

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}
function gzRes(rows: unknown): Response {
  const buf = gzipSync(Buffer.from(JSON.stringify(rows)));
  return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as unknown as Response;
}
const noSleep = async () => {};

describe('AmazonAdsClient.fetchDailyReport', () => {
  it('creates a report, polls until COMPLETED, downloads and parses gzip json', async () => {
    const rows = [{ date: '2026-07-01', cost: 12.5, impressions: 100, clicks: 5, purchases14d: 1, sales14d: 40 }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ reportId: 'r1', status: 'PENDING' }))
      .mockResolvedValueOnce(res({ reportId: 'r1', status: 'PROCESSING' }))
      .mockResolvedValueOnce(res({ reportId: 'r1', status: 'COMPLETED', url: 'https://s3.test/r1.gz' }))
      .mockResolvedValueOnce(gzRes(rows));
    const client = new AmazonAdsClient('TOK', 'LWA', '111', fetchMock as unknown as typeof fetch, noSleep);
    const out = await client.fetchDailyReport(7);
    expect(out).toEqual(rows);

    const [createUrl, createInit] = fetchMock.mock.calls[0];
    expect(createUrl).toBe('https://advertising-api-eu.amazon.com/reporting/reports');
    expect((createInit as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer TOK',
      'Amazon-Advertising-API-ClientId': 'LWA',
      'Amazon-Advertising-API-Scope': '111',
      'Content-Type': 'application/vnd.createasyncreportrequest.v3+json',
    });
    const body = JSON.parse((createInit as RequestInit).body as string);
    expect(body.configuration).toMatchObject({
      adProduct: 'SPONSORED_PRODUCTS', reportTypeId: 'spCampaigns', timeUnit: 'DAILY', format: 'GZIP_JSON',
      columns: ['date', 'cost', 'impressions', 'clicks', 'purchases14d', 'sales14d'],
    });
    expect(fetchMock.mock.calls[1][0]).toBe('https://advertising-api-eu.amazon.com/reporting/reports/r1');
  });

  it('splits ranges over 31 days into multiple report jobs', async () => {
    const mk = (d: string) => [{ date: d, cost: 1, impressions: 1, clicks: 1, purchases14d: 0, sales14d: 0 }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ reportId: 'a', status: 'COMPLETED', url: 'https://s3.test/a.gz' }))
      .mockResolvedValueOnce(res({ reportId: 'a', status: 'COMPLETED', url: 'https://s3.test/a.gz' }))
      .mockResolvedValueOnce(gzRes(mk('2026-06-01')))
      .mockResolvedValueOnce(res({ reportId: 'b', status: 'COMPLETED', url: 'https://s3.test/b.gz' }))
      .mockResolvedValueOnce(res({ reportId: 'b', status: 'COMPLETED', url: 'https://s3.test/b.gz' }))
      .mockResolvedValueOnce(gzRes(mk('2026-07-01')));
    const client = new AmazonAdsClient('TOK', 'LWA', '111', fetchMock as unknown as typeof fetch, noSleep);
    const out = await client.fetchDailyReport(40);
    expect(out.map((r) => r.date)).toEqual(['2026-06-01', '2026-07-01']);
    // two create calls with adjacent, non-overlapping windows
    const startsEnds = [fetchMock.mock.calls[0], fetchMock.mock.calls[3]].map(([, init]) => {
      const b = JSON.parse((init as RequestInit).body as string);
      return [b.startDate, b.endDate] as [string, string];
    });
    expect(startsEnds[0][1] < startsEnds[1][0]).toBe(true);
  });

  it('fails cleanly on report FAILURE and on poll timeout', async () => {
    const failMock = vi.fn()
      .mockResolvedValueOnce(res({ reportId: 'r1', status: 'PENDING' }))
      .mockResolvedValueOnce(res({ reportId: 'r1', status: 'FAILURE', failureReason: 'boom' }));
    const c1 = new AmazonAdsClient('TOK', 'LWA', '111', failMock as unknown as typeof fetch, noSleep);
    await expect(c1.fetchDailyReport(7)).rejects.toThrow(/FAILURE/);

    const stuckMock = vi.fn().mockResolvedValue(res({ reportId: 'r1', status: 'PROCESSING' }));
    const c2 = new AmazonAdsClient('TOK', 'LWA', '111', stuckMock as unknown as typeof fetch, noSleep);
    await expect(c2.fetchDailyReport(7)).rejects.toThrow(/Timeout/);
  });

  it('throws with status on a non-OK create response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ message: 'throttled' }, 429));
    const client = new AmazonAdsClient('TOK', 'LWA', '111', fetchMock as unknown as typeof fetch, noSleep);
    await expect(client.fetchDailyReport(7)).rejects.toThrow(/429/);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/connectors/amazon-ads/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `src/connectors/amazon-ads/types.ts`:

```ts
export interface AmazonAdsReportRow {
  date: string;
  cost: number;
  impressions: number;
  clicks: number;
  purchases14d: number;
  sales14d: number;
}

export interface AmazonAdsReportStatus {
  reportId: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILURE';
  url?: string;
  failureReason?: string;
}
```

Create `src/connectors/amazon-ads/client.ts`:

```ts
import { gunzipSync } from 'node:zlib';
import { addDays } from '@/lib/dates';
import type { AmazonAdsReportRow, AmazonAdsReportStatus } from './types';

const BASE = 'https://advertising-api-eu.amazon.com';
// Reporting v3 limits: max 31 days per spCampaigns report, ~95 days lookback.
const MAX_WINDOW_DAYS = 31;
const MAX_LOOKBACK_DAYS = 90;
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 60;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class AmazonAdsClient {
  constructor(
    private readonly accessToken: string,
    private readonly clientId: string,
    private readonly profileId: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly sleepImpl: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  private headers(contentType?: string): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'Amazon-Advertising-API-ClientId': this.clientId,
      'Amazon-Advertising-API-Scope': this.profileId,
    };
    if (contentType) h['Content-Type'] = contentType;
    return h;
  }

  private async createReport(startDate: string, endDate: string): Promise<string> {
    const res = await this.fetchImpl(`${BASE}/reporting/reports`, {
      method: 'POST',
      headers: this.headers('application/vnd.createasyncreportrequest.v3+json'),
      body: JSON.stringify({
        name: `ecom-platform spCampaigns ${startDate}..${endDate}`,
        startDate,
        endDate,
        configuration: {
          adProduct: 'SPONSORED_PRODUCTS',
          reportTypeId: 'spCampaigns',
          groupBy: ['campaign'],
          columns: ['date', 'cost', 'impressions', 'clicks', 'purchases14d', 'sales14d'],
          timeUnit: 'DAILY',
          format: 'GZIP_JSON',
        },
      }),
    });
    if (!res.ok) throw new Error(`Amazon Ads report create failed: ${res.status} ${await res.text()}`);
    return ((await res.json()) as AmazonAdsReportStatus).reportId;
  }

  private async waitForReport(reportId: string): Promise<string> {
    for (let i = 0; i < MAX_POLLS; i++) {
      const res = await this.fetchImpl(`${BASE}/reporting/reports/${reportId}`, { headers: this.headers() });
      if (!res.ok) throw new Error(`Amazon Ads report status failed: ${res.status} ${await res.text()}`);
      const status = (await res.json()) as AmazonAdsReportStatus;
      if (status.status === 'COMPLETED' && status.url) return status.url;
      if (status.status === 'FAILURE') throw new Error(`Amazon Ads report FAILURE: ${status.failureReason ?? 'unbekannt'}`);
      await this.sleepImpl(POLL_INTERVAL_MS);
    }
    throw new Error(`Amazon Ads report Timeout nach ${MAX_POLLS} Polls (reportId ${reportId}).`);
  }

  private async downloadReport(url: string): Promise<AmazonAdsReportRow[]> {
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`Amazon Ads report download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return JSON.parse(gunzipSync(buf).toString('utf8')) as AmazonAdsReportRow[];
  }

  async fetchDailyReport(days: number): Promise<AmazonAdsReportRow[]> {
    const capped = Math.min(days, MAX_LOOKBACK_DAYS);
    const today = new Date().toISOString().slice(0, 10);
    const start = addDays(today, -(capped - 1));
    const rows: AmazonAdsReportRow[] = [];
    let windowStart = start;
    while (windowStart <= today) {
      const windowEnd = [addDays(windowStart, MAX_WINDOW_DAYS - 1), today].sort()[0];
      const reportId = await this.createReport(windowStart, windowEnd);
      const url = await this.waitForReport(reportId);
      rows.push(...(await this.downloadReport(url)));
      windowStart = addDays(windowEnd, 1);
    }
    return rows;
  }
}
```

Check `addDays` in `src/lib/dates.ts` first: it must accept a `YYYY-MM-DD` string and a negative/positive day offset and return `YYYY-MM-DD` (the Meta client uses it the same way). If its signature differs, adapt the calls, not the helper.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/connectors/amazon-ads/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/amazon-ads/types.ts src/connectors/amazon-ads/client.ts tests/connectors/amazon-ads/client.test.ts
git commit -m "feat: Amazon Ads Reporting v3 client (async jobs, gzip, 31-day windows)"
```

---

### Task 5: Normalize + write

**Files:**
- Create: `src/connectors/amazon-ads/connector.ts`
- Create: `src/connectors/amazon-ads/write.ts`
- Test: `tests/connectors/amazon-ads/normalize.test.ts`
- Test: `tests/connectors/amazon-ads/write.test.ts`

**Interfaces:**
- Consumes: `AmazonAdsReportRow` from Task 4; `AdSpend`, `CanonicalDataset` from `src/lib/types.ts`.
- Produces: `normalizeReport(rows: AmazonAdsReportRow[]): CanonicalDataset` (adSpend only, `platform: 'amazon_ads'`, rows summed per date, sorted by date); `writeAmazonAds(data: CanonicalDataset): Promise<void>` (delete-then-insert, aborts on 0 rows). Task 6 calls both.

- [ ] **Step 1: Write the failing normalize test**

Create `tests/connectors/amazon-ads/normalize.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { normalizeReport } from '@/connectors/amazon-ads/connector';

describe('normalizeReport', () => {
  it('sums campaign rows per date into one amazon_ads ad_spend row', () => {
    const data = normalizeReport([
      { date: '2026-07-02', cost: 5, impressions: 50, clicks: 2, purchases14d: 1, sales14d: 20 },
      { date: '2026-07-01', cost: 10.5, impressions: 100, clicks: 4, purchases14d: 2, sales14d: 80 },
      { date: '2026-07-01', cost: 2.5, impressions: 30, clicks: 1, purchases14d: 0, sales14d: 0 },
    ]);
    expect(data.adSpend).toEqual([
      { date: '2026-07-01', platform: 'amazon_ads', spend: 13, impressions: 130, clicks: 5, conversions: 2, convValue: 80 },
      { date: '2026-07-02', platform: 'amazon_ads', spend: 5, impressions: 50, clicks: 2, conversions: 1, convValue: 20 },
    ]);
    expect(data.dailyMetrics).toEqual([]);
    expect(data.orders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/connectors/amazon-ads/normalize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement normalize**

Create `src/connectors/amazon-ads/connector.ts`:

```ts
import type { AdSpend, CanonicalDataset } from '@/lib/types';
import type { AmazonAdsReportRow } from './types';

export function normalizeReport(rows: AmazonAdsReportRow[]): CanonicalDataset {
  const byDate = new Map<string, AdSpend>();
  for (const row of rows) {
    const acc = byDate.get(row.date) ?? {
      date: row.date, platform: 'amazon_ads', spend: 0, impressions: 0, clicks: 0, conversions: 0, convValue: 0,
    };
    acc.spend += Number(row.cost ?? 0);
    acc.impressions += Number(row.impressions ?? 0);
    acc.clicks += Number(row.clicks ?? 0);
    acc.conversions += Number(row.purchases14d ?? 0);
    acc.convValue += Number(row.sales14d ?? 0);
    byDate.set(row.date, acc);
  }
  const adSpend = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  return { dailyMetrics: [], orders: [], customers: [], adSpend, subscribers: [] };
}
```

- [ ] **Step 4: Run normalize test → PASS, then write the failing write test**

Read `tests/connectors/meta/write.test.ts` first and mirror its DB setup/cleanup exactly (same helpers, same truncation pattern). Create `tests/connectors/amazon-ads/write.test.ts` with the meta write test's structure, adjusted to:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { pool } from '@/lib/db';
import { writeAmazonAds } from '@/connectors/amazon-ads/write';

const row = { date: '2026-07-01', platform: 'amazon_ads', spend: 13, impressions: 130, clicks: 5, conversions: 2, convValue: 80 };
const dataset = { dailyMetrics: [], orders: [], customers: [], adSpend: [row], subscribers: [] };

describe('writeAmazonAds', () => {
  beforeEach(async () => {
    await pool.query(`DELETE FROM ad_spend WHERE platform = 'amazon_ads'`);
  });

  it('replaces amazon_ads rows without touching other platforms', async () => {
    await pool.query(
      `INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value)
       VALUES ('2026-07-01', 'meta_ads', 1, 1, 1, 1, 1), ('2026-06-30', 'amazon_ads', 99, 9, 9, 9, 9)`,
    );
    await writeAmazonAds(dataset);
    const amazon = await pool.query(`SELECT date::text, spend::float FROM ad_spend WHERE platform = 'amazon_ads'`);
    expect(amazon.rows).toEqual([{ date: '2026-07-01', spend: 13 }]);
    const meta = await pool.query(`SELECT count(*)::int AS n FROM ad_spend WHERE platform = 'meta_ads'`);
    expect(meta.rows[0].n).toBe(1);
    await pool.query(`DELETE FROM ad_spend WHERE platform = 'meta_ads' AND date = '2026-07-01'`);
  });

  it('aborts on an empty dataset without deleting', async () => {
    await pool.query(
      `INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value)
       VALUES ('2026-06-30', 'amazon_ads', 99, 9, 9, 9, 9)`,
    );
    await expect(writeAmazonAds({ ...dataset, adSpend: [] })).rejects.toThrow(/0 ad_spend/);
    const r = await pool.query(`SELECT count(*)::int AS n FROM ad_spend WHERE platform = 'amazon_ads'`);
    expect(r.rows[0].n).toBe(1);
  });
});
```

If the meta write test uses different date-column casting or cleanup helpers, follow the meta test's conventions over this sketch.

- [ ] **Step 5: Implement write**

Create `src/connectors/amazon-ads/write.ts` (the Meta pattern minus `daily_metrics`, which this connector never writes):

```ts
import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { AdSpend, CanonicalDataset } from '@/lib/types';

const CHUNK = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertAdSpend(client: PoolClient, rows: AdSpend[]): Promise<void> {
  for (const part of chunk(rows, CHUNK)) {
    const values: unknown[] = [];
    const tuples = part.map((a, i) => {
      const b = i * 7;
      values.push(a.date, a.platform, a.spend, a.impressions, a.clicks, a.conversions, a.convValue);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7})`;
    });
    await client.query(
      `INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value) VALUES ${tuples.join(',')}`,
      values,
    );
  }
}

export async function writeAmazonAds(data: CanonicalDataset): Promise<void> {
  if (data.adSpend.length === 0) {
    throw new Error('Amazon Ads sync: 0 ad_spend rows — aborting without deleting.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ad_spend WHERE platform = 'amazon_ads'`);
    await insertAdSpend(client, data.adSpend);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 6: Run both test files to verify they pass**

Run: `npx vitest run tests/connectors/amazon-ads/`
Expected: PASS (client, normalize, write).

- [ ] **Step 7: Commit**

```bash
git add src/connectors/amazon-ads/connector.ts src/connectors/amazon-ads/write.ts tests/connectors/amazon-ads/normalize.test.ts tests/connectors/amazon-ads/write.test.ts
git commit -m "feat: normalize and write Amazon Ads spend into ad_spend"
```

---

### Task 6: Sync script + npm wiring

**Files:**
- Create: `scripts/sync-amazon-ads.ts`
- Modify: `package.json` (scripts block)

**Interfaces:**
- Consumes: `getHubCredentials` (Task 2), `AmazonAdsClient` (Task 4), `normalizeReport`/`writeAmazonAds` (Task 5).
- Produces: `npm run sync:amazon_ads` — the exact key the sync runner shells out to for connector key `amazon_ads` (`npm run sync:<key>` in `src/lib/sync/runner.ts`).

- [ ] **Step 1: Write the script**

Create `scripts/sync-amazon-ads.ts` (mirrors `scripts/sync-meta.ts`):

```ts
import { AmazonAdsClient } from '../src/connectors/amazon-ads/client';
import { normalizeReport } from '../src/connectors/amazon-ads/connector';
import { writeAmazonAds } from '../src/connectors/amazon-ads/write';
import { pool } from '../src/lib/db';
import { getHubCredentials } from '../src/lib/hub';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 90;
}

async function main() {
  const days = parseDays(process.argv);
  const creds = await getHubCredentials('amazon_ads');
  const profileId = creds.accountConfig.profileId;
  if (!creds.clientId || !profileId) {
    throw new Error('Hub lieferte keine clientId/profileId für amazon_ads — Verbindung im Hub prüfen.');
  }
  const client = new AmazonAdsClient(creds.accessToken, creds.clientId, profileId);
  console.log(`Fetching Amazon Ads report (last ${days} days)…`);
  const rows = await client.fetchDailyReport(days);
  console.log(`Fetched ${rows.length} campaign-day rows.`);

  const data = normalizeReport(rows);
  console.log(`Normalized → ${data.adSpend.length} ad_spend rows (amazon_ads).`);

  await writeAmazonAds(data);
  console.log('Wrote amazon_ads ad_spend to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 2: Wire package.json**

In `package.json`, after the `"sync:google"` line add:

```json
    "sync:amazon_ads": "tsx scripts/sync-amazon-ads.ts",
```

(The key must be `sync:amazon_ads` — the runner executes `npm run sync:${connectorKey}` and the connector key is `amazon_ads`.)

- [ ] **Step 3: Verify — full suite + build + script loads**

Run: `npx vitest run && npm run build`
Expected: PASS / build OK.
Run: `npm run sync:amazon_ads`
Expected: exits non-zero with the German hub-config error (`Hub-URL/API-Key fehlen…`) — proves the script wires up and fails cleanly without config; no DB writes happen.

- [ ] **Step 4: Commit**

```bash
git add scripts/sync-amazon-ads.ts package.json
git commit -m "feat: amazon_ads sync script fed by hub credentials"
```

---

### Task 7: Help module (Verbindungen)

**Files:**
- Modify: `src/lib/help/content.ts` (the `verbindungen` page, `slug: 'verbindungen'` around line 375)
- Test: existing `tests/lib/help-content.test.ts` as the gate

**Interfaces:** none — documentation content only.

- [ ] **Step 1: Extend the `verbindungen` help page**

Read the existing `sections` of the `verbindungen` entry in `src/lib/help/content.ts` and append one section in the same shape/tone as its neighbors (German, sentence case). Content to convey:

- Titel: `Amazon über den Verbindungs-Hub`
- Body (an die bestehende Section-Struktur anpassen): Amazon Ads und Amazon Seller Central werden nicht mit eigenen Zugangsdaten verbunden, sondern über den zentralen Verbindungs-Hub. Unter „Verbindungen" werden dafür nur Hub-URL und API-Key hinterlegt (Gruppe „Hub"). „Verbinden" öffnet die Zustimmungsseite des Hubs; danach holt die Synchronisation die Zugangsdaten bei jedem Lauf frisch vom Hub — es werden keine Amazon-Token in dieser Instanz gespeichert. Status „neu verbinden" bedeutet: die Verbindung im Hub ist abgelaufen und muss über „Verbinden" erneuert werden.

- [ ] **Step 2: Run the help gate + full suite**

Run: `npx vitest run tests/lib/help-content.test.ts && npx vitest run`
Expected: PASS. If the registry test asserts an exact section count for `verbindungen`, update that count.

- [ ] **Step 3: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs: Hilfe zu Amazon-Anbindung über den Verbindungs-Hub"
```

---

### Task 8: Full verification + PR

**Files:** none (verification only).

- [ ] **Step 1: Full suite + build**

Run: `npx vitest run && npm run build`
Expected: everything PASS, build clean.

- [ ] **Step 2: Push branch + open PR**

Use superpowers:finishing-a-development-branch. Push `feat/amazon-ads-hub-connector`, open a PR against `main` (spec + plan ride along). PR body summarizes: hub client, connect flow, amazon_ads connector, amazon_sp connect-only, help update.

- [ ] **Step 3: STOP — deployment gate**

Do **not** deploy. Deployment to budp (production) and the hub-side configuration (rollout steps below) only after explicit user confirmation.

---

## Rollout (operational, after PR review — each step gated on the user)

1. **Hub admin** (hub.lumeapps.de): enter Amazon Ads LWA client ID/secret in the provider settings; user whitelists `https://hub.lumeapps.de/oauth/amazon_ads/callback` in the Amazon developer console.
2. **Hub admin:** create an API client for the budp install with return-URL base `https://budp.lumeapps.de` → note the API key.
3. **budp `/setup`:** enter `HUB_URL=https://hub.lumeapps.de` and the API key under „Verbindungs-Hub".
4. **Deploy** ecom-platform to the budp VPS (existing deploy path) — **only after explicit confirmation**.
5. Connect Amazon Ads via the new „Verbinden" button, run `sync:amazon_ads` (or „Jetzt synchronisieren"), verify rows in `ad_spend` and the Verkauf channel view. Browser-verify `/setup` (hub section, states, dark mode) per the verification-before-completion skill.
6. `amazon_sp`: connect once Amazon approves the SP-API app (set nothing in ecom — it is connect-only until P6).
