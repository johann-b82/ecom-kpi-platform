# TikTok-Ads-Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** TikTok-Werbedaten (Reporting) über einen On-Demand-CLI-Sync in `ad_spend` (platform='tiktok_ads') und `daily_metrics` `video_views` (source='tiktok_ads') laden, sodass SEE und DO auch TikTok-Zahlen enthalten.

**Architecture:** Drei isolierte Einheiten nach dem `Connector`-Muster (wie Meta): `client.ts` (Access-Token-Auth + Report-Fetch inkl. Paginierung + Body-`code`-Fehlerprüfung), `connector.ts` (`normalizeReport()` → `CanonicalDataset`, rein), `write.ts` (transaktionaler Replace beider TikTok-Quellen). CLI `scripts/sync-tiktok.ts` mit `--days`. Engine/API/UI unverändert.

**Tech Stack:** TypeScript · `fetch` (in Tests injiziert) · `pg` · `tsx` · Vitest. Keine neue Dependency. Baut auf V1 + Shopware + GA4 + Klaviyo + Meta.

## Global Constraints

- Auth: Header `Access-Token: <TIKTOK_ACCESS_TOKEN>` (NICHT Bearer). API-Version `v1.3`. Basis `https://business-api.tiktok.com`.
- Endpoint: `GET /open_api/v1.3/report/integrated/get/?advertiser_id&report_type=BASIC&data_level=AUCTION_ADVERTISER&dimensions=["stat_time_day"]&metrics=[…]&start_date&end_date&page&page_size=1000`. Array-Params als JSON-String.
- **TikTok-Fehler im Body:** Antwort meist `HTTP 200` mit `{ code, message, data }`. **`code !== 0` = Fehler** → werfen. Zusätzlich `res.ok` prüfen.
- Paginierung: `page` ab 1; weiter, solange `page < data.page_info.total_page`.
- `time`: `start_date` = `${days-1}` Tage vor heute, `end_date` = heute (ISO `YYYY-MM-DD`), Default `days=180`.
- Mapping → `ad_spend` (platform='tiktok_ads'): `date`←`dimensions.stat_time_day[0:10]`; `spend`/`impressions`/`clicks`←gleichnamige Metriken; `conversions`←`conversion`; `convValue`←Metrik `<TIKTOK_VALUE_METRIC>` (Default `total_complete_payment`, sonst 0).
- Mapping → `daily_metrics` (source='tiktok_ads', channel='default'): `video_views`←Metrik `<TIKTOK_VIDEO_METRIC>` (Default `video_play_actions`, sonst 0).
- Angefragte Metriken: `spend, impressions, clicks, conversion, <TIKTOK_VALUE_METRIC>, <TIKTOK_VIDEO_METRIC>`.
- Alle Zahlen via `Number()`.
- Write = Transaktion `DELETE ad_spend WHERE platform='tiktok_ads'` + `DELETE daily_metrics WHERE source='tiktok_ads'` + gebündelte Inserts in beide. **Bei 0 ad_spend-Zeilen abbrechen ohne DELETE.**
- On-Demand-CLI `npm run sync:tiktok [--days N]`, Default 180. Kein Scheduler, kein Schema-Change.
- Secrets (`TIKTOK_ACCESS_TOKEN`) nur in `.env`/lokal, nie committet.
- Kanonische Typen (aus V1): `AdSpend { date, platform, spend, impressions, clicks, conversions, convValue }`, `DailyMetric { date, source, channel, metricKey, value }`, `CanonicalDataset { dailyMetrics, orders, customers, adSpend, subscribers }`.

---

## File Structure

```
src/connectors/tiktok/
  types.ts        # TikTokReportRow, TikTokReportResponse
  connector.ts    # normalizeReport(rows, opts): CanonicalDataset (rein)
  client.ts       # TikTokClient: fetchReport (paginated, body-code error)
  write.ts        # writeTikTokAds(data): transaktionaler Replace beider TikTok-Quellen
scripts/sync-tiktok.ts         # CLI mit --days
tests/connectors/tiktok/
  normalize.test.ts   # rein, Fixtures inline
  client.test.ts      # gemockter fetch
  write.test.ts       # Integration gegen DB
.env.example        # + TIKTOK_ACCESS_TOKEN, TIKTOK_ADVERTISER_ID, TIKTOK_VALUE_METRIC, TIKTOK_VIDEO_METRIC
package.json        # + "sync:tiktok" script
```

---

### Task 1: TikTok-Rohtypen & `normalizeReport` (rein)

**Files:**
- Create: `src/connectors/tiktok/types.ts`, `src/connectors/tiktok/connector.ts`
- Test: `tests/connectors/tiktok/normalize.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset`, `AdSpend`, `DailyMetric` aus `@/lib/types`.
- Produces: Typen `TikTokReportRow`, `TikTokReportResponse`; `normalizeReport(rows: TikTokReportRow[], opts?: { valueMetric?: string; videoMetric?: string }): CanonicalDataset` (befüllt `adSpend` + `dailyMetrics` video_views; Defaults `total_complete_payment` / `video_play_actions`).

- [ ] **Step 1: Rohtypen anlegen**

`src/connectors/tiktok/types.ts`:
```ts
export interface TikTokReportRow {
  dimensions: { stat_time_day: string };
  metrics: Record<string, string>;
}
export interface TikTokPageInfo {
  page: number;
  page_size: number;
  total_number: number;
  total_page: number;
}
export interface TikTokReportResponse {
  code: number;
  message: string;
  data?: {
    list: TikTokReportRow[];
    page_info?: TikTokPageInfo;
  };
}
```

- [ ] **Step 2: Failing test schreiben**

`tests/connectors/tiktok/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeReport } from '@/connectors/tiktok/connector';
import type { TikTokReportRow } from '@/connectors/tiktok/types';

const rows: TikTokReportRow[] = [
  {
    dimensions: { stat_time_day: '2026-01-01 00:00:00' },
    metrics: { spend: '120.25', impressions: '60000', clicks: '900', conversion: '15', total_complete_payment: '1800.50', video_play_actions: '3000' },
  },
  {
    dimensions: { stat_time_day: '2026-01-02 00:00:00' },
    metrics: { spend: '90', impressions: '45000', clicks: '700', conversion: '8', video_play_actions: '2200' },
  },
];

function ad(ds: ReturnType<typeof normalizeReport>, date: string) {
  return ds.adSpend.find((a) => a.date === date)!;
}
function vv(ds: ReturnType<typeof normalizeReport>, date: string) {
  return ds.dailyMetrics.find((m) => m.date === date && m.metricKey === 'video_views')!;
}

describe('normalizeReport', () => {
  it('mappt ad_spend inkl. conversion + default value-Metrik, Datum gekürzt', () => {
    const ds = normalizeReport(rows);
    expect(ds.adSpend).toHaveLength(2);
    expect(ad(ds, '2026-01-01')).toMatchObject({
      platform: 'tiktok_ads', spend: 120.25, impressions: 60000, clicks: 900, conversions: 15, convValue: 1800.5,
    });
  });
  it('fehlende value-Metrik → convValue 0', () => {
    expect(ad(normalizeReport(rows), '2026-01-02').convValue).toBe(0);
  });
  it('extrahiert video_views (default Metrik), source tiktok_ads', () => {
    const ds = normalizeReport(rows);
    expect(vv(ds, '2026-01-01')).toMatchObject({ source: 'tiktok_ads', channel: 'default', value: 3000 });
    expect(vv(ds, '2026-01-02').value).toBe(2200);
  });
  it('befüllt nur adSpend + dailyMetrics; Werte numerisch', () => {
    const ds = normalizeReport(rows);
    expect(ds.orders).toHaveLength(0);
    expect(ds.customers).toHaveLength(0);
    expect(ds.subscribers).toHaveLength(0);
    expect(ds.adSpend.every((a) => typeof a.spend === 'number' && typeof a.conversions === 'number')).toBe(true);
  });
  it('nutzt konfigurierbare value-/video-Metriknamen', () => {
    const custom: TikTokReportRow[] = [{
      dimensions: { stat_time_day: '2026-01-03 00:00:00' },
      metrics: { spend: '1', impressions: '1', clicks: '1', conversion: '1', total_purchase_value: '77', video_watched_2s: '50' },
    }];
    const ds = normalizeReport(custom, { valueMetric: 'total_purchase_value', videoMetric: 'video_watched_2s' });
    expect(ad(ds, '2026-01-03').convValue).toBe(77);
    expect(vv(ds, '2026-01-03').value).toBe(50);
  });
});
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/tiktok/normalize.test.ts`
Expected: FAIL — `@/connectors/tiktok/connector` nicht gefunden.

- [ ] **Step 4: `normalizeReport` implementieren**

`src/connectors/tiktok/connector.ts`:
```ts
import type { AdSpend, CanonicalDataset, DailyMetric } from '@/lib/types';
import type { TikTokReportRow } from './types';

function num(metrics: Record<string, string>, key: string): number {
  return metrics[key] !== undefined ? Number(metrics[key]) : 0;
}

export function normalizeReport(
  rows: TikTokReportRow[],
  opts: { valueMetric?: string; videoMetric?: string } = {},
): CanonicalDataset {
  const valueMetric = opts.valueMetric ?? 'total_complete_payment';
  const videoMetric = opts.videoMetric ?? 'video_play_actions';
  const adSpend: AdSpend[] = [];
  const dailyMetrics: DailyMetric[] = [];

  for (const row of rows) {
    const date = row.dimensions.stat_time_day.slice(0, 10);
    adSpend.push({
      date,
      platform: 'tiktok_ads',
      spend: num(row.metrics, 'spend'),
      impressions: num(row.metrics, 'impressions'),
      clicks: num(row.metrics, 'clicks'),
      conversions: num(row.metrics, 'conversion'),
      convValue: num(row.metrics, valueMetric),
    });
    dailyMetrics.push({
      date,
      source: 'tiktok_ads',
      channel: 'default',
      metricKey: 'video_views',
      value: num(row.metrics, videoMetric),
    });
  }

  return { dailyMetrics, orders: [], customers: [], adSpend, subscribers: [] };
}
```

- [ ] **Step 5: Test ausführen — grün**

Run: `npm test -- tests/connectors/tiktok/normalize.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/connectors/tiktok/types.ts src/connectors/tiktok/connector.ts tests/connectors/tiktok/normalize.test.ts
git commit -m "feat: tiktok report normalization to canonical ad_spend + video_views"
```

---

### Task 2: `TikTokClient` (Auth + paginiertes Report-Fetch + Body-code-Fehler)

**Files:**
- Create: `src/connectors/tiktok/client.ts`
- Test: `tests/connectors/tiktok/client.test.ts`

**Interfaces:**
- Consumes: `TikTokReportRow`, `TikTokReportResponse` aus `./types`; `addDays` aus `@/lib/dates`.
- Produces: `class TikTokClient` mit Konstruktor `(accessToken: string, advertiserId: string, valueMetric: string, videoMetric: string, fetchImpl?: typeof fetch)`, `fetchReport(days: number): Promise<TikTokReportRow[]>` (paginiert via `page_info.total_page`; wirft bei `res.ok===false` und bei `json.code !== 0`).

- [ ] **Step 1: Failing test schreiben**

`tests/connectors/tiktok/client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { TikTokClient } from '@/connectors/tiktok/client';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const row = (d: string) => ({ dimensions: { stat_time_day: d }, metrics: { spend: '1' } });

describe('TikTokClient.fetchReport', () => {
  it('baut den Report-Request, sendet Access-Token, paginiert über total_page', async () => {
    const page1 = { code: 0, message: 'OK', data: { list: [row('2026-01-01 00:00:00')], page_info: { page: 1, page_size: 1000, total_number: 2, total_page: 2 } } };
    const page2 = { code: 0, message: 'OK', data: { list: [row('2026-01-02 00:00:00')], page_info: { page: 2, page_size: 1000, total_number: 2, total_page: 2 } } };
    const fetchMock = vi.fn().mockResolvedValueOnce(res(page1)).mockResolvedValueOnce(res(page2));
    const client = new TikTokClient('TOK', 'ADV1', 'total_complete_payment', 'video_play_actions', fetchMock as unknown as typeof fetch);
    const rows = await client.fetchReport(30);

    expect(rows.map((r) => r.dimensions.stat_time_day)).toEqual(['2026-01-01 00:00:00', '2026-01-02 00:00:00']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/');
    expect(url).toContain('advertiser_id=ADV1');
    expect(url).toContain('report_type=BASIC');
    expect(decodeURIComponent(url as string)).toContain('"total_complete_payment"');
    expect(decodeURIComponent(url as string)).toContain('"video_play_actions"');
    expect((init as RequestInit).headers).toMatchObject({ 'Access-Token': 'TOK' });
  });

  it('wirft bei Body-Fehler (code !== 0)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ code: 40105, message: 'Access token is invalid', data: {} }));
    const client = new TikTokClient('TOK', 'ADV1', 'total_complete_payment', 'video_play_actions', fetchMock as unknown as typeof fetch);
    await expect(client.fetchReport(7)).rejects.toThrow(/error code 40105.*Access token is invalid/);
  });

  it('wirft bei echtem HTTP-Fehler', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({}, 500));
    const client = new TikTokClient('TOK', 'ADV1', 'total_complete_payment', 'video_play_actions', fetchMock as unknown as typeof fetch);
    await expect(client.fetchReport(7)).rejects.toThrow(/HTTP 500/);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/tiktok/client.test.ts`
Expected: FAIL — `@/connectors/tiktok/client` nicht gefunden.

- [ ] **Step 3: `TikTokClient` implementieren**

`src/connectors/tiktok/client.ts`:
```ts
import { addDays } from '@/lib/dates';
import type { TikTokReportRow, TikTokReportResponse } from './types';

const BASE = 'https://business-api.tiktok.com';
const VERSION = 'v1.3';

export class TikTokClient {
  constructor(
    private readonly accessToken: string,
    private readonly advertiserId: string,
    private readonly valueMetric: string,
    private readonly videoMetric: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchReport(days: number): Promise<TikTokReportRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = addDays(today, -(days - 1));
    const metrics = ['spend', 'impressions', 'clicks', 'conversion', this.valueMetric, this.videoMetric];

    const rows: TikTokReportRow[] = [];
    let page = 1;
    for (;;) {
      const params = new URLSearchParams({
        advertiser_id: this.advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_ADVERTISER',
        dimensions: JSON.stringify(['stat_time_day']),
        metrics: JSON.stringify(metrics),
        start_date: startDate,
        end_date: today,
        page: String(page),
        page_size: '1000',
      });
      const url = `${BASE}/open_api/${VERSION}/report/integrated/get/?${params.toString()}`;
      const res = await this.fetchImpl(url, { headers: { 'Access-Token': this.accessToken } });
      if (!res.ok) {
        throw new Error(`TikTok report HTTP ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as TikTokReportResponse;
      if (json.code !== 0) {
        throw new Error(`TikTok report error code ${json.code}: ${json.message}`);
      }
      rows.push(...(json.data?.list ?? []));
      const totalPage = json.data?.page_info?.total_page ?? 1;
      if (page >= totalPage) break;
      page += 1;
    }
    return rows;
  }
}
```

- [ ] **Step 4: Test ausführen — grün**

Run: `npm test -- tests/connectors/tiktok/client.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/tiktok/client.ts tests/connectors/tiktok/client.test.ts
git commit -m "feat: tiktok marketing api client (report, paginated, body-code errors)"
```

---

### Task 3: Transaktionaler Write (zwei Tabellen), CLI-Skript & Konfiguration

**Files:**
- Create: `src/connectors/tiktok/write.ts`, `scripts/sync-tiktok.ts`
- Modify: `package.json` (Script `sync:tiktok`), `.env.example` (TIKTOK_*)
- Test: `tests/connectors/tiktok/write.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset` aus `@/lib/types`; `pool` aus `@/lib/db`; `TikTokClient` (Task 2), `normalizeReport` (Task 1).
- Produces: `writeTikTokAds(data: CanonicalDataset): Promise<void>` — Transaktion `DELETE ad_spend WHERE platform='tiktok_ads'` + `DELETE daily_metrics WHERE source='tiktok_ads'` + gebündelte Inserts in beide; wirft bei `data.adSpend.length === 0` **ohne** zu löschen.

- [ ] **Step 1: Failing integration test schreiben**

`tests/connectors/tiktok/write.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { writeTikTokAds } from '@/connectors/tiktok/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  orders: [], customers: [], subscribers: [],
  adSpend: [
    { date: '2026-05-01', platform: 'tiktok_ads', spend: 40, impressions: 9000, clicks: 110, conversions: 2, convValue: 180 },
    { date: '2026-05-02', platform: 'tiktok_ads', spend: 55, impressions: 11000, clicks: 130, conversions: 3, convValue: 240 },
  ],
  dailyMetrics: [
    { date: '2026-05-01', source: 'tiktok_ads', channel: 'default', metricKey: 'video_views', value: 700 },
    { date: '2026-05-02', source: 'tiktok_ads', channel: 'default', metricKey: 'video_views', value: 750 },
  ],
};

describe('writeTikTokAds (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt nur TikTok-Quellen, lässt andere Plattformen/Quellen unberührt', async () => {
    const before = await loadDataset();
    const otherAds = before.adSpend.filter((a) => a.platform !== 'tiktok_ads').length;
    const otherDm = before.dailyMetrics.filter((m) => m.source !== 'tiktok_ads').length;
    const ordersBefore = before.orders.length;

    await writeTikTokAds(sample);
    const after = await loadDataset();

    const ttAds = after.adSpend.filter((a) => a.platform === 'tiktok_ads');
    const ttVv = after.dailyMetrics.filter((m) => m.source === 'tiktok_ads');
    expect(ttAds.map((a) => a.date).sort()).toEqual(['2026-05-01', '2026-05-02']);
    expect(ttVv.map((m) => m.value).sort((x, y) => x - y)).toEqual([700, 750]);
    expect(after.adSpend.filter((a) => a.platform !== 'tiktok_ads').length).toBe(otherAds);
    expect(after.dailyMetrics.filter((m) => m.source !== 'tiktok_ads').length).toBe(otherDm);
    expect(after.orders.length).toBe(ordersBefore);
  });

  it('bricht bei 0 ad_spend-Zeilen ab, ohne zu löschen', async () => {
    await expect(writeTikTokAds({ ...sample, adSpend: [] }))
      .rejects.toThrow(/0 ad_spend rows/i);
    const after = await loadDataset();
    expect(after.adSpend.filter((a) => a.platform === 'tiktok_ads').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/tiktok/write.test.ts`
Expected: FAIL — `@/connectors/tiktok/write` nicht gefunden.

- [ ] **Step 3: `writeTikTokAds` implementieren**

`src/connectors/tiktok/write.ts`:
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

export async function writeTikTokAds(data: CanonicalDataset): Promise<void> {
  if (data.adSpend.length === 0) {
    throw new Error('TikTok sync: 0 ad_spend rows — aborting without deleting.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ad_spend WHERE platform = 'tiktok_ads'`);
    await client.query(`DELETE FROM daily_metrics WHERE source = 'tiktok_ads'`);
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

Run: `npm test -- tests/connectors/tiktok/write.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: CLI-Skript implementieren**

`scripts/sync-tiktok.ts`:
```ts
import { TikTokClient } from '../src/connectors/tiktok/client';
import { normalizeReport } from '../src/connectors/tiktok/connector';
import { writeTikTokAds } from '../src/connectors/tiktok/write';
import { pool } from '../src/lib/db';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID;
  if (!accessToken || !advertiserId) {
    throw new Error('Missing TIKTOK_ACCESS_TOKEN / TIKTOK_ADVERTISER_ID in environment.');
  }
  const valueMetric = process.env.TIKTOK_VALUE_METRIC ?? 'total_complete_payment';
  const videoMetric = process.env.TIKTOK_VIDEO_METRIC ?? 'video_play_actions';
  const days = parseDays(process.argv);

  const client = new TikTokClient(accessToken, advertiserId, valueMetric, videoMetric);
  console.log(`Fetching TikTok report (last ${days} days)…`);
  const rows = await client.fetchReport(days);
  console.log(`Fetched ${rows.length} day rows.`);

  const data = normalizeReport(rows, { valueMetric, videoMetric });
  console.log(`Normalized → ${data.adSpend.length} ad_spend + ${data.dailyMetrics.length} video_views rows (tiktok_ads).`);

  await writeTikTokAds(data);
  console.log('Wrote tiktok_ads ad_spend + video_views to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: `package.json`-Script ergänzen**

In `package.json` unter `"scripts"` ergänzen (nach `"sync:meta"`):
```json
    "sync:tiktok": "tsx scripts/sync-tiktok.ts",
```

- [ ] **Step 7: `.env.example` ergänzen**

An `.env.example` anhängen:
```
TIKTOK_ACCESS_TOKEN=your-tiktok-access-token
TIKTOK_ADVERTISER_ID=1234567890
TIKTOK_VALUE_METRIC=total_complete_payment
TIKTOK_VIDEO_METRIC=video_play_actions
```

- [ ] **Step 8: Volle Suite ausführen — grün**

Run: `npm test`
Expected: PASS (alle bisherigen Tests + 10 neue TikTok-Tests; Integrationstests benötigen die laufende DB).

- [ ] **Step 9: Commit**

```bash
git add src/connectors/tiktok/write.ts scripts/sync-tiktok.ts tests/connectors/tiktok/write.test.ts package.json .env.example
git commit -m "feat: tiktok ads sync CLI with transactional ad_spend + video_views replace"
```

- [ ] **Step 10: Live-Verifikation (aufgeschoben — sobald Token + Advertiser-ID vorliegen)**

```bash
# .env mit echten Werten füllen (NICHT committen): TIKTOK_ACCESS_TOKEN, TIKTOK_ADVERTISER_ID; ggf. VALUE/VIDEO-Metriknamen anpassen; DB läuft:
docker compose up -d db && npm run migrate   # falls nötig
npm run sync:tiktok
```
Erwartet: „Fetched N day rows / Normalized → N ad_spend + N video_views". Danach `/api/kpis` gegenchecken (SEE Impressions/CPM/Video Views, DO ROAS/CAC enthalten TikTok). **Stichprobe:** Spend/Impressions im Dashboard ≈ TikTok Ads Manager im selben Zeitraum. Häufiger Fehler: `code != 0` mit Token-/Metrik-Meldung → Token/Advertiser prüfen oder `TIKTOK_VALUE_METRIC`/`TIKTOK_VIDEO_METRIC` an die Kontonamen anpassen, erneut syncen.

---

## Definition of Done

- `npm test` grün inkl. 10 neuer TikTok-Tests (normalize 5, client 3, write 2).
- `npm run sync:tiktok [--days N]` lädt echte TikTok-Reports in `ad_spend` (platform='tiktok_ads') + `daily_metrics` video_views (source='tiktok_ads'), lässt andere Plattformen/Quellen unberührt, ist wiederholbar.
- Body-`code`-Fehler bricht selbstdiagnostisch ab; 0-Zeilen-Abbruch greift.
- Keine Secrets im Repo.

## Verifizierte Spec-Abdeckung (Self-Review)

- Access-Token-Header, v1.3, report/integrated/get-Endpoint + Params: Task 2 ✓
- Body-`code`-Fehlerprüfung (`code !== 0`) + `res.ok`: Task 2 ✓
- Paginierung via `page_info.total_page`: Task 2 ✓
- Mapping ad_spend (spend/impressions/clicks/conversion/value-Metrik) + konfigurierbar: Task 1 (+ CLI Task 3) ✓
- video_views aus konfigurierbarer Metrik → daily_metrics source=tiktok_ads: Task 1 ✓
- `Number()`-Cast überall: Task 1 ✓
- Zwei-Tabellen-Transaktion, selektiver Replace (platform=tiktok_ads / source=tiktok_ads), 0-Zeilen-Abbruch: Task 3 ✓
- On-Demand-CLI `sync:tiktok --days`, kein Scheduler, kein Schema-Change: Task 3 ✓
- Secrets nur in `.env` (`.env.example` als Vorlage): Task 3 ✓
- Live-Verifikation (aufgeschoben): Task 3 Step 10 ✓
