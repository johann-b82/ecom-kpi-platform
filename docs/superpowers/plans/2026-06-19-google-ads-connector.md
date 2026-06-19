# Google-Ads-Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Google-Ads-Werbedaten (GAQL/searchStream) über einen On-Demand-CLI-Sync in `ad_spend` (platform='google_ads') und `daily_metrics` `video_views` (source='google_ads') laden, sodass SEE und DO auch Google-Zahlen enthalten.

**Architecture:** Drei isolierte Einheiten nach dem `Connector`-Muster (wie Meta/TikTok): `client.ts` (OAuth2-Refresh-Token-Grant + `searchStream` per fetch, Chunk-Flattening), `connector.ts` (`normalizeRows()` → `CanonicalDataset`, rein), `write.ts` (transaktionaler Replace beider Google-Quellen). CLI `scripts/sync-google.ts` mit `--days`. Engine/API/UI unverändert.

**Tech Stack:** TypeScript · `fetch` (in Tests injiziert) · `pg` · `tsx` · Vitest. Keine neue Dependency. Baut auf V1 + Shopware + GA4 + Klaviyo + Meta + TikTok.

## Global Constraints

- Auth: OAuth2 Refresh-Token-Grant — POST `https://oauth2.googleapis.com/token` mit `{ grant_type:'refresh_token', client_id, client_secret, refresh_token }` → `access_token`. Requests mit Headern `Authorization: Bearer <token>`, `developer-token: <devToken>`, optional `login-customer-id: <loginCustomerId>`.
- Endpoint: POST `https://googleads.googleapis.com/v17/customers/<customerId>/googleAds:searchStream`, Body `{ query: "<GAQL>" }`. Antwort = Array von Chunks, je `results[]` → flach zusammenführen (keine Paginierung).
- GAQL: `SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value, metrics.video_views FROM customer WHERE segments.date BETWEEN '<start>' AND '<end>'`; `<start>` = `${days-1}` Tage vor heute, `<end>` = heute, Default `days=180`.
- Mapping → `ad_spend` (platform='google_ads'): `date`←`segments.date`; `spend`←`Number(metrics.costMicros)/1_000_000`; `impressions`←`Number(metrics.impressions)`; `clicks`←`Number(metrics.clicks)`; `conversions`←`Number(metrics.conversions)`; `convValue`←`Number(metrics.conversionsValue)`.
- Mapping → `daily_metrics` (source='google_ads', channel='default'): `video_views`←`Number(metrics.videoViews)`.
- Fehlende Metrik → 0 (via `Number(x ?? 0)`-Guard, der `undefined` zu 0 macht).
- Write = Transaktion `DELETE ad_spend WHERE platform='google_ads'` + `DELETE daily_metrics WHERE source='google_ads'` + gebündelte Inserts in beide. **Bei 0 ad_spend-Zeilen abbrechen ohne DELETE.**
- On-Demand-CLI `npm run sync:google [--days N]`, Default 180. Kein Scheduler, kein Schema-Change.
- Secrets (alle OAuth-/Token-Werte) nur in `.env`/lokal, nie committet.
- Kanonische Typen (aus V1): `AdSpend { date, platform, spend, impressions, clicks, conversions, convValue }`, `DailyMetric { date, source, channel, metricKey, value }`, `CanonicalDataset { dailyMetrics, orders, customers, adSpend, subscribers }`.

---

## File Structure

```
src/connectors/google/
  types.ts        # GoogleAdsRow, GoogleAdsStreamChunk
  connector.ts    # normalizeRows(rows): CanonicalDataset (rein)
  client.ts       # GoogleAdsClient: getAccessToken + search (searchStream, flatten)
  write.ts        # writeGoogleAds(data): transaktionaler Replace beider Google-Quellen
scripts/sync-google.ts         # CLI mit --days
tests/connectors/google/
  normalize.test.ts   # rein, Fixtures inline
  client.test.ts      # gemockter fetch
  write.test.ts       # Integration gegen DB
.env.example        # + GOOGLE_ADS_* (6 Variablen)
package.json        # + "sync:google" script
```

---

### Task 1: Google-Rohtypen & `normalizeRows` (rein)

**Files:**
- Create: `src/connectors/google/types.ts`, `src/connectors/google/connector.ts`
- Test: `tests/connectors/google/normalize.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset`, `AdSpend`, `DailyMetric` aus `@/lib/types`.
- Produces: Typen `GoogleAdsRow`, `GoogleAdsStreamChunk`; `normalizeRows(rows: GoogleAdsRow[]): CanonicalDataset` (befüllt `adSpend` + `dailyMetrics` video_views; `spend` aus Micros).

- [ ] **Step 1: Rohtypen anlegen**

`src/connectors/google/types.ts`:
```ts
export interface GoogleAdsRow {
  segments: { date: string };
  metrics: {
    costMicros?: string;
    impressions?: string;
    clicks?: string;
    conversions?: number;
    conversionsValue?: number;
    videoViews?: string;
  };
}
export interface GoogleAdsStreamChunk {
  results?: GoogleAdsRow[];
}
```

- [ ] **Step 2: Failing test schreiben**

`tests/connectors/google/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeRows } from '@/connectors/google/connector';
import type { GoogleAdsRow } from '@/connectors/google/types';

const rows: GoogleAdsRow[] = [
  {
    segments: { date: '2026-01-01' },
    metrics: { costMicros: '150250000', impressions: '70000', clicks: '1000', conversions: 18, conversionsValue: 2100.75, videoViews: '4000' },
  },
  {
    segments: { date: '2026-01-02' },
    metrics: { costMicros: '90000000', impressions: '50000', clicks: '800' },
  },
];

function ad(ds: ReturnType<typeof normalizeRows>, date: string) {
  return ds.adSpend.find((a) => a.date === date)!;
}
function vv(ds: ReturnType<typeof normalizeRows>, date: string) {
  return ds.dailyMetrics.find((m) => m.date === date && m.metricKey === 'video_views')!;
}

describe('normalizeRows', () => {
  it('rechnet cost_micros in Währung um und mappt ad_spend', () => {
    const ds = normalizeRows(rows);
    expect(ds.adSpend).toHaveLength(2);
    expect(ad(ds, '2026-01-01')).toMatchObject({
      platform: 'google_ads', spend: 150.25, impressions: 70000, clicks: 1000, conversions: 18, convValue: 2100.75,
    });
  });
  it('fehlende conversions/value/video → 0', () => {
    const ds = normalizeRows(rows);
    expect(ad(ds, '2026-01-02')).toMatchObject({ conversions: 0, convValue: 0 });
    expect(vv(ds, '2026-01-02').value).toBe(0);
  });
  it('extrahiert video_views, source google_ads', () => {
    const ds = normalizeRows(rows);
    expect(vv(ds, '2026-01-01')).toMatchObject({ source: 'google_ads', channel: 'default', value: 4000 });
  });
  it('befüllt nur adSpend + dailyMetrics; Werte numerisch', () => {
    const ds = normalizeRows(rows);
    expect(ds.orders).toHaveLength(0);
    expect(ds.customers).toHaveLength(0);
    expect(ds.subscribers).toHaveLength(0);
    expect(ds.adSpend.every((a) => typeof a.spend === 'number' && typeof a.conversions === 'number')).toBe(true);
  });
});
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/google/normalize.test.ts`
Expected: FAIL — `@/connectors/google/connector` nicht gefunden.

- [ ] **Step 4: `normalizeRows` implementieren**

`src/connectors/google/connector.ts`:
```ts
import type { AdSpend, CanonicalDataset, DailyMetric } from '@/lib/types';
import type { GoogleAdsRow } from './types';

function n(v: string | number | undefined): number {
  return v === undefined ? 0 : Number(v);
}

export function normalizeRows(rows: GoogleAdsRow[]): CanonicalDataset {
  const adSpend: AdSpend[] = [];
  const dailyMetrics: DailyMetric[] = [];

  for (const row of rows) {
    const date = row.segments.date;
    const m = row.metrics;
    adSpend.push({
      date,
      platform: 'google_ads',
      spend: n(m.costMicros) / 1_000_000,
      impressions: n(m.impressions),
      clicks: n(m.clicks),
      conversions: n(m.conversions),
      convValue: n(m.conversionsValue),
    });
    dailyMetrics.push({
      date,
      source: 'google_ads',
      channel: 'default',
      metricKey: 'video_views',
      value: n(m.videoViews),
    });
  }

  return { dailyMetrics, orders: [], customers: [], adSpend, subscribers: [] };
}
```

- [ ] **Step 5: Test ausführen — grün**

Run: `npm test -- tests/connectors/google/normalize.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/connectors/google/types.ts src/connectors/google/connector.ts tests/connectors/google/normalize.test.ts
git commit -m "feat: google ads normalization to canonical ad_spend + video_views"
```

---

### Task 2: `GoogleAdsClient` (OAuth-Refresh + searchStream)

**Files:**
- Create: `src/connectors/google/client.ts`
- Test: `tests/connectors/google/client.test.ts`

**Interfaces:**
- Consumes: `GoogleAdsRow`, `GoogleAdsStreamChunk` aus `./types`; `addDays` aus `@/lib/dates`.
- Produces:
  - `interface GoogleAdsConfig { developerToken; clientId; clientSecret; refreshToken; customerId; loginCustomerId? }`
  - `class GoogleAdsClient` mit Konstruktor `(config: GoogleAdsConfig, fetchImpl?: typeof fetch)`, `getAccessToken(): Promise<string>`, `search(days: number): Promise<GoogleAdsRow[]>` (Token holen → searchStream → Chunks flach).

- [ ] **Step 1: Failing test schreiben**

`tests/connectors/google/client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { GoogleAdsClient } from '@/connectors/google/client';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const config = {
  developerToken: 'DEV', clientId: 'CID', clientSecret: 'SEC',
  refreshToken: 'RT', customerId: '1112223333', loginCustomerId: '9998887777',
};

describe('GoogleAdsClient.search', () => {
  it('holt ein Token und ruft searchStream, flacht Chunks', async () => {
    const token = { access_token: 'AT' };
    const stream = [
      { results: [{ segments: { date: '2026-01-01' }, metrics: { costMicros: '1' } }] },
      { results: [{ segments: { date: '2026-01-02' }, metrics: { costMicros: '2' } }] },
    ];
    const fetchMock = vi.fn().mockResolvedValueOnce(res(token)).mockResolvedValueOnce(res(stream));
    const client = new GoogleAdsClient(config, fetchMock as unknown as typeof fetch);
    const rows = await client.search(30);

    expect(rows.map((r) => r.segments.date)).toEqual(['2026-01-01', '2026-01-02']);

    // 1. Call: Token-Endpoint mit Refresh-Grant
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    const tokenBody = JSON.parse((tokenInit as RequestInit).body as string);
    expect(tokenBody).toMatchObject({ grant_type: 'refresh_token', client_id: 'CID', refresh_token: 'RT' });

    // 2. Call: searchStream
    const [searchUrl, searchInit] = fetchMock.mock.calls[1];
    expect(searchUrl).toBe('https://googleads.googleapis.com/v17/customers/1112223333/googleAds:searchStream');
    expect((searchInit as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer AT',
      'developer-token': 'DEV',
      'login-customer-id': '9998887777',
    });
    expect(JSON.parse((searchInit as RequestInit).body as string).query).toMatch(/SELECT segments\.date/);
  });

  it('wirft bei Auth-Fehler', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ error: 'invalid_grant' }, 400));
    const client = new GoogleAdsClient(config, fetchMock as unknown as typeof fetch);
    await expect(client.search(7)).rejects.toThrow(/auth failed: 400/);
  });

  it('wirft bei searchStream-Fehler', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ access_token: 'AT' }))
      .mockResolvedValueOnce(res({ error: {} }, 403));
    const client = new GoogleAdsClient(config, fetchMock as unknown as typeof fetch);
    await expect(client.search(7)).rejects.toThrow(/searchStream failed: 403/);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/google/client.test.ts`
Expected: FAIL — `@/connectors/google/client` nicht gefunden.

- [ ] **Step 3: `GoogleAdsClient` implementieren**

`src/connectors/google/client.ts`:
```ts
import { addDays } from '@/lib/dates';
import type { GoogleAdsRow, GoogleAdsStreamChunk } from './types';

const VERSION = 'v17';

export interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId?: string;
}

export class GoogleAdsClient {
  constructor(
    private readonly config: GoogleAdsConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getAccessToken(): Promise<string> {
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

  async search(days: number): Promise<GoogleAdsRow[]> {
    const token = await this.getAccessToken();
    const today = new Date().toISOString().slice(0, 10);
    const start = addDays(today, -(days - 1));
    const query =
      `SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, ` +
      `metrics.conversions, metrics.conversions_value, metrics.video_views ` +
      `FROM customer WHERE segments.date BETWEEN '${start}' AND '${today}'`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'developer-token': this.config.developerToken,
      'Content-Type': 'application/json',
    };
    if (this.config.loginCustomerId) {
      headers['login-customer-id'] = this.config.loginCustomerId;
    }

    const res = await this.fetchImpl(
      `https://googleads.googleapis.com/${VERSION}/customers/${this.config.customerId}/googleAds:searchStream`,
      { method: 'POST', headers, body: JSON.stringify({ query }) },
    );
    if (!res.ok) {
      throw new Error(`Google Ads searchStream failed: ${res.status} ${await res.text()}`);
    }
    const chunks = (await res.json()) as GoogleAdsStreamChunk[];
    return chunks.flatMap((c) => c.results ?? []);
  }
}
```

- [ ] **Step 4: Test ausführen — grün**

Run: `npm test -- tests/connectors/google/client.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/google/client.ts tests/connectors/google/client.test.ts
git commit -m "feat: google ads api client (oauth refresh + searchStream)"
```

---

### Task 3: Transaktionaler Write (zwei Tabellen), CLI-Skript & Konfiguration

**Files:**
- Create: `src/connectors/google/write.ts`, `scripts/sync-google.ts`
- Modify: `package.json` (Script `sync:google`), `.env.example` (GOOGLE_ADS_*)
- Test: `tests/connectors/google/write.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset` aus `@/lib/types`; `pool` aus `@/lib/db`; `GoogleAdsClient`/`GoogleAdsConfig` (Task 2), `normalizeRows` (Task 1).
- Produces: `writeGoogleAds(data: CanonicalDataset): Promise<void>` — Transaktion `DELETE ad_spend WHERE platform='google_ads'` + `DELETE daily_metrics WHERE source='google_ads'` + gebündelte Inserts in beide; wirft bei `data.adSpend.length === 0` **ohne** zu löschen.

- [ ] **Step 1: Failing integration test schreiben**

`tests/connectors/google/write.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { writeGoogleAds } from '@/connectors/google/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  orders: [], customers: [], subscribers: [],
  adSpend: [
    { date: '2026-05-01', platform: 'google_ads', spend: 70, impressions: 13000, clicks: 150, conversions: 5, convValue: 500 },
    { date: '2026-05-02', platform: 'google_ads', spend: 85, impressions: 15000, clicks: 170, conversions: 6, convValue: 610 },
  ],
  dailyMetrics: [
    { date: '2026-05-01', source: 'google_ads', channel: 'default', metricKey: 'video_views', value: 600 },
    { date: '2026-05-02', source: 'google_ads', channel: 'default', metricKey: 'video_views', value: 650 },
  ],
};

describe('writeGoogleAds (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt nur Google-Quellen, lässt andere Plattformen/Quellen unberührt', async () => {
    const before = await loadDataset();
    const otherAds = before.adSpend.filter((a) => a.platform !== 'google_ads').length;
    const otherDm = before.dailyMetrics.filter((m) => m.source !== 'google_ads').length;
    const ordersBefore = before.orders.length;

    await writeGoogleAds(sample);
    const after = await loadDataset();

    const gAds = after.adSpend.filter((a) => a.platform === 'google_ads');
    const gVv = after.dailyMetrics.filter((m) => m.source === 'google_ads');
    expect(gAds.map((a) => a.date).sort()).toEqual(['2026-05-01', '2026-05-02']);
    expect(gVv.map((m) => m.value).sort((x, y) => x - y)).toEqual([600, 650]);
    expect(after.adSpend.filter((a) => a.platform !== 'google_ads').length).toBe(otherAds);
    expect(after.dailyMetrics.filter((m) => m.source !== 'google_ads').length).toBe(otherDm);
    expect(after.orders.length).toBe(ordersBefore);
  });

  it('bricht bei 0 ad_spend-Zeilen ab, ohne zu löschen', async () => {
    await expect(writeGoogleAds({ ...sample, adSpend: [] }))
      .rejects.toThrow(/0 ad_spend rows/i);
    const after = await loadDataset();
    expect(after.adSpend.filter((a) => a.platform === 'google_ads').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/google/write.test.ts`
Expected: FAIL — `@/connectors/google/write` nicht gefunden.

- [ ] **Step 3: `writeGoogleAds` implementieren**

`src/connectors/google/write.ts`:
```ts
import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { AdSpend, CanonicalDataset, DailyMetric } from '@/lib/types';

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

async function insertDailyMetrics(client: PoolClient, rows: DailyMetric[]): Promise<void> {
  for (const part of chunk(rows, CHUNK)) {
    const values: unknown[] = [];
    const tuples = part.map((m, i) => {
      const b = i * 5;
      values.push(m.date, m.source, m.channel, m.metricKey, m.value);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    await client.query(
      `INSERT INTO daily_metrics(date, source, channel, metric_key, value) VALUES ${tuples.join(',')}`,
      values,
    );
  }
}

export async function writeGoogleAds(data: CanonicalDataset): Promise<void> {
  if (data.adSpend.length === 0) {
    throw new Error('Google Ads sync: 0 ad_spend rows — aborting without deleting.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ad_spend WHERE platform = 'google_ads'`);
    await client.query(`DELETE FROM daily_metrics WHERE source = 'google_ads'`);
    await insertAdSpend(client, data.adSpend);
    if (data.dailyMetrics.length > 0) await insertDailyMetrics(client, data.dailyMetrics);
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
```

- [ ] **Step 4: Test ausführen — grün**

Run: `npm test -- tests/connectors/google/write.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: CLI-Skript implementieren**

`scripts/sync-google.ts`:
```ts
import { GoogleAdsClient } from '../src/connectors/google/client';
import { normalizeRows } from '../src/connectors/google/connector';
import { writeGoogleAds } from '../src/connectors/google/write';
import { pool } from '../src/lib/db';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
    throw new Error('Missing GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN / GOOGLE_ADS_CUSTOMER_ID in environment.');
  }
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const days = parseDays(process.argv);

  const client = new GoogleAdsClient({ developerToken, clientId, clientSecret, refreshToken, customerId, loginCustomerId });
  console.log(`Fetching Google Ads report (last ${days} days)…`);
  const rows = await client.search(days);
  console.log(`Fetched ${rows.length} day rows.`);

  const data = normalizeRows(rows);
  console.log(`Normalized → ${data.adSpend.length} ad_spend + ${data.dailyMetrics.length} video_views rows (google_ads).`);

  await writeGoogleAds(data);
  console.log('Wrote google_ads ad_spend + video_views to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: `package.json`-Script ergänzen**

In `package.json` unter `"scripts"` ergänzen (nach `"sync:tiktok"`):
```json
    "sync:google": "tsx scripts/sync-google.ts",
```

- [ ] **Step 7: `.env.example` ergänzen**

An `.env.example` anhängen:
```
GOOGLE_ADS_DEVELOPER_TOKEN=your-developer-token
GOOGLE_ADS_CLIENT_ID=your-oauth-client-id
GOOGLE_ADS_CLIENT_SECRET=your-oauth-client-secret
GOOGLE_ADS_REFRESH_TOKEN=your-refresh-token
GOOGLE_ADS_CUSTOMER_ID=1112223333
GOOGLE_ADS_LOGIN_CUSTOMER_ID=9998887777
```

- [ ] **Step 8: Volle Suite ausführen — grün**

Run: `npm test`
Expected: PASS (alle bisherigen Tests + 9 neue Google-Tests; Integrationstests benötigen die laufende DB; Vitest läuft seriell via `fileParallelism: false`).

- [ ] **Step 9: Commit**

```bash
git add src/connectors/google/write.ts scripts/sync-google.ts tests/connectors/google/write.test.ts package.json .env.example
git commit -m "feat: google ads sync CLI with transactional ad_spend + video_views replace"
```

- [ ] **Step 10: Live-Verifikation (aufgeschoben — sobald Developer-Token + OAuth + Customer-ID vorliegen)**

```bash
# .env mit echten GOOGLE_ADS_* Werten füllen (NICHT committen); DB läuft:
docker compose up -d db && npm run migrate   # falls nötig
npm run sync:google
```
Erwartet: „Fetched N day rows / Normalized → N ad_spend + N video_views". Danach `/api/kpis` gegenchecken (SEE Impressions/CPM/Video Views, DO ROAS/CAC enthalten Google). **Stichprobe:** Spend/Impressions im Dashboard ≈ Google Ads UI im selben Zeitraum (Micros korrekt umgerechnet). Häufige Fehler: `403` = developer-token nicht freigegeben oder fehlende `login-customer-id`; `401`/`invalid_grant` = Refresh-Token abgelaufen → erneuern, erneut syncen.

---

## Definition of Done

- `npm test` grün inkl. 9 neuer Google-Tests (normalize 4, client 3, write 2).
- `npm run sync:google [--days N]` lädt echte Google-Ads-Daten in `ad_spend` (platform='google_ads') + `daily_metrics` video_views (source='google_ads'), lässt andere Plattformen/Quellen unberührt, ist wiederholbar.
- `spend` korrekt aus Micros umgerechnet; 0-Zeilen-Abbruch greift.
- Keine Secrets im Repo.

## Verifizierte Spec-Abdeckung (Self-Review)

- OAuth2 Refresh-Token-Grant → access_token: Task 2 ✓
- searchStream-Endpoint (customers/<id>:searchStream) + GAQL-Body + Header (Bearer/developer-token/login-customer-id): Task 2 ✓
- Chunk-Flattening (kein Paging): Task 2 ✓
- Mapping ad_spend inkl. **cost_micros/1.000.000** + Number()-Cast: Task 1 ✓
- video_views → daily_metrics source=google_ads: Task 1 ✓
- Zwei-Tabellen-Transaktion, selektiver Replace (platform=google_ads / source=google_ads), 0-Zeilen-Abbruch: Task 3 ✓
- On-Demand-CLI `sync:google --days`, kein Scheduler, kein Schema-Change: Task 3 ✓
- Secrets nur in `.env` (`.env.example` als Vorlage): Task 3 ✓
- Live-Verifikation (aufgeschoben) inkl. Micros-Stichprobe + 403/401-Hinweis: Task 3 Step 10 ✓
