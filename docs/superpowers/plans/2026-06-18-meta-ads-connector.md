# Meta-Ads-Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Meta-Werbedaten (Insights) über einen On-Demand-CLI-Sync in `ad_spend` (platform='meta_ads') und `daily_metrics` `video_views` (source='meta_ads') laden, sodass SEE (Impressions/CPM/Video Views) und DO (ROAS/CAC) echte Meta-Zahlen zeigen.

**Architecture:** Drei isolierte Einheiten nach dem `Connector`-Muster: `client.ts` (Bearer-Auth + Insights-Fetch inkl. `paging.next`), `connector.ts` (`normalizeInsights()` → `CanonicalDataset`, rein), `write.ts` (transaktionaler Replace **beider** Meta-Quellen). CLI `scripts/sync-meta.ts` mit `--days`. Engine/API/UI unverändert.

**Tech Stack:** TypeScript · `fetch` (in Tests injiziert) · `pg` · `tsx` · Vitest. Keine neue Dependency. Baut auf V1 + Shopware + GA4 + Klaviyo.

## Global Constraints

- Auth: Header `Authorization: Bearer <META_ACCESS_TOKEN>`. Graph-API-Version `v21.0`. Basis `https://graph.facebook.com`.
- Endpoint: `GET /v21.0/act_<META_AD_ACCOUNT_ID>/insights?level=account&time_increment=1&time_range={since,until}&fields=spend,impressions,clicks,actions,action_values&limit=500`. `paging.next` folgen, bis keine weitere Seite.
- `time_range` = `{ since: '${days-1} Tage vor heute', until: 'heute' }` (ISO `YYYY-MM-DD`), Default `days=180`.
- Mapping → `ad_spend` (platform='meta_ads'): `date`←date_start; `spend`/`impressions`/`clicks` direkt; `conversions`←`actions[].value` mit `action_type=<META_PURCHASE_ACTION_TYPE>` (Default `purchase`, sonst 0); `convValue`←`action_values[].value` mit demselben Typ (sonst 0).
- Mapping → `daily_metrics` (source='meta_ads', channel='default'): `video_views`←`actions[].value` mit `action_type='video_view'` (sonst 0).
- Alle Zahlen via `Number()`.
- Write = Transaktion `DELETE ad_spend WHERE platform='meta_ads'` + `DELETE daily_metrics WHERE source='meta_ads'` + gebündelte Inserts in beide. **Bei 0 ad_spend-Zeilen abbrechen ohne DELETE.**
- On-Demand-CLI `npm run sync:meta [--days N]`, Default 180. Kein Scheduler, kein Schema-Change.
- Secrets (`META_ACCESS_TOKEN`) nur in `.env`/lokal, nie committet.
- Kanonische Typen (aus V1): `AdSpend { date, platform, spend, impressions, clicks, conversions, convValue }`, `DailyMetric { date, source, channel, metricKey, value }`, `CanonicalDataset { dailyMetrics, orders, customers, adSpend, subscribers }`.

---

## File Structure

```
src/connectors/meta/
  types.ts        # MetaAction, MetaInsightRow, MetaInsightsResponse
  connector.ts    # normalizeInsights(rows, opts): CanonicalDataset (rein)
  client.ts       # MetaClient: fetchInsights (paginated)
  write.ts        # writeMetaAds(data): transaktionaler Replace beider Meta-Quellen
scripts/sync-meta.ts           # CLI mit --days
tests/connectors/meta/
  normalize.test.ts   # rein, Fixtures inline
  client.test.ts      # gemockter fetch
  write.test.ts       # Integration gegen DB
.env.example        # + META_ACCESS_TOKEN, META_AD_ACCOUNT_ID, META_PURCHASE_ACTION_TYPE
package.json        # + "sync:meta" script
```

---

### Task 1: Meta-Rohtypen & `normalizeInsights` (rein)

**Files:**
- Create: `src/connectors/meta/types.ts`, `src/connectors/meta/connector.ts`
- Test: `tests/connectors/meta/normalize.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset`, `AdSpend`, `DailyMetric` aus `@/lib/types`.
- Produces: Typen `MetaAction`, `MetaInsightRow`, `MetaInsightsResponse`; `normalizeInsights(rows: MetaInsightRow[], opts?: { purchaseActionType?: string }): CanonicalDataset` (befüllt `adSpend` + `dailyMetrics` video_views; `purchaseActionType` Default `'purchase'`).

- [ ] **Step 1: Rohtypen anlegen**

`src/connectors/meta/types.ts`:
```ts
export interface MetaAction {
  action_type: string;
  value: string;
}
export interface MetaInsightRow {
  date_start: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  actions?: MetaAction[];
  action_values?: MetaAction[];
}
export interface MetaInsightsResponse {
  data: MetaInsightRow[];
  paging?: { next?: string };
}
```

- [ ] **Step 2: Failing test schreiben**

`tests/connectors/meta/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeInsights } from '@/connectors/meta/connector';
import type { MetaInsightRow } from '@/connectors/meta/types';

const rows: MetaInsightRow[] = [
  {
    date_start: '2026-01-01', spend: '100.50', impressions: '50000', clicks: '800',
    actions: [
      { action_type: 'purchase', value: '12' },
      { action_type: 'video_view', value: '2000' },
      { action_type: 'link_click', value: '700' },
    ],
    action_values: [{ action_type: 'purchase', value: '1450.75' }],
  },
  {
    date_start: '2026-01-02', spend: '80', impressions: '40000', clicks: '600',
    actions: [{ action_type: 'video_view', value: '1500' }],
    action_values: [],
  },
];

function ad(ds: ReturnType<typeof normalizeInsights>, date: string) {
  return ds.adSpend.find((a) => a.date === date)!;
}
function vv(ds: ReturnType<typeof normalizeInsights>, date: string) {
  return ds.dailyMetrics.find((m) => m.date === date && m.metricKey === 'video_views')!;
}

describe('normalizeInsights', () => {
  it('mappt ad_spend inkl. purchase-Conversions/Wert', () => {
    const ds = normalizeInsights(rows);
    expect(ds.adSpend).toHaveLength(2);
    expect(ad(ds, '2026-01-01')).toMatchObject({
      platform: 'meta_ads', spend: 100.5, impressions: 50000, clicks: 800, conversions: 12, convValue: 1450.75,
    });
  });
  it('fehlende purchase-Action → conversions/convValue 0', () => {
    const ds = normalizeInsights(rows);
    expect(ad(ds, '2026-01-02')).toMatchObject({ conversions: 0, convValue: 0 });
  });
  it('extrahiert video_view in daily_metrics (source meta_ads)', () => {
    const ds = normalizeInsights(rows);
    expect(vv(ds, '2026-01-01')).toMatchObject({ source: 'meta_ads', channel: 'default', value: 2000 });
    expect(vv(ds, '2026-01-02').value).toBe(1500);
  });
  it('befüllt nur adSpend + dailyMetrics; Werte numerisch', () => {
    const ds = normalizeInsights(rows);
    expect(ds.orders).toHaveLength(0);
    expect(ds.customers).toHaveLength(0);
    expect(ds.subscribers).toHaveLength(0);
    expect(ds.adSpend.every((a) => typeof a.spend === 'number' && typeof a.conversions === 'number')).toBe(true);
  });
  it('nutzt den konfigurierbaren purchaseActionType', () => {
    const custom: MetaInsightRow[] = [{
      date_start: '2026-01-03', spend: '10', impressions: '1', clicks: '1',
      actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '5' }],
      action_values: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '99' }],
    }];
    const ds = normalizeInsights(custom, { purchaseActionType: 'offsite_conversion.fb_pixel_purchase' });
    expect(ad(ds, '2026-01-03')).toMatchObject({ conversions: 5, convValue: 99 });
  });
});
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/meta/normalize.test.ts`
Expected: FAIL — `@/connectors/meta/connector` nicht gefunden.

- [ ] **Step 4: `normalizeInsights` implementieren**

`src/connectors/meta/connector.ts`:
```ts
import type { AdSpend, CanonicalDataset, DailyMetric } from '@/lib/types';
import type { MetaAction, MetaInsightRow } from './types';

function actionValue(actions: MetaAction[] | undefined, type: string): number {
  const a = actions?.find((x) => x.action_type === type);
  return a ? Number(a.value) : 0;
}

export function normalizeInsights(
  rows: MetaInsightRow[],
  opts: { purchaseActionType?: string } = {},
): CanonicalDataset {
  const purchaseType = opts.purchaseActionType ?? 'purchase';
  const adSpend: AdSpend[] = [];
  const dailyMetrics: DailyMetric[] = [];

  for (const row of rows) {
    const date = row.date_start;
    adSpend.push({
      date,
      platform: 'meta_ads',
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      conversions: actionValue(row.actions, purchaseType),
      convValue: actionValue(row.action_values, purchaseType),
    });
    dailyMetrics.push({
      date,
      source: 'meta_ads',
      channel: 'default',
      metricKey: 'video_views',
      value: actionValue(row.actions, 'video_view'),
    });
  }

  return { dailyMetrics, orders: [], customers: [], adSpend, subscribers: [] };
}
```

- [ ] **Step 5: Test ausführen — grün**

Run: `npm test -- tests/connectors/meta/normalize.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/connectors/meta/types.ts src/connectors/meta/connector.ts tests/connectors/meta/normalize.test.ts
git commit -m "feat: meta insights normalization to canonical ad_spend + video_views"
```

---

### Task 2: `MetaClient` (Auth + paginiertes Insights-Fetch)

**Files:**
- Create: `src/connectors/meta/client.ts`
- Test: `tests/connectors/meta/client.test.ts`

**Interfaces:**
- Consumes: `MetaInsightRow`, `MetaInsightsResponse` aus `./types`; `addDays` aus `@/lib/dates`.
- Produces: `class MetaClient` mit Konstruktor `(accessToken: string, adAccountId: string, fetchImpl?: typeof fetch)`, `fetchInsights(days: number): Promise<MetaInsightRow[]>` (paginiert via `paging.next`).

- [ ] **Step 1: Failing test schreiben**

`tests/connectors/meta/client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { MetaClient } from '@/connectors/meta/client';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('MetaClient.fetchInsights', () => {
  it('baut den act-Insights-Request und folgt paging.next', async () => {
    const page1 = { data: [{ date_start: '2026-01-01' }], paging: { next: 'https://graph.facebook.com/next-page' } };
    const page2 = { data: [{ date_start: '2026-01-02' }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(page1))
      .mockResolvedValueOnce(res(page2));
    const client = new MetaClient('TOK', '12345', fetchMock as unknown as typeof fetch);
    const rows = await client.fetchInsights(30);

    expect(rows.map((r) => r.date_start)).toEqual(['2026-01-01', '2026-01-02']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://graph.facebook.com/v21.0/act_12345/insights');
    expect(url).toContain('time_increment=1');
    expect(url).toContain('level=account');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer TOK' });
    // zweiter Call folgt exakt der next-URL
    expect(fetchMock.mock.calls[1][0]).toBe('https://graph.facebook.com/next-page');
  });

  it('wirft bei HTTP-Fehler mit Status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ error: { message: 'bad token' } }, 400));
    const client = new MetaClient('TOK', '12345', fetchMock as unknown as typeof fetch);
    await expect(client.fetchInsights(7)).rejects.toThrow(/insights failed: 400/);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/meta/client.test.ts`
Expected: FAIL — `@/connectors/meta/client` nicht gefunden.

- [ ] **Step 3: `MetaClient` implementieren**

`src/connectors/meta/client.ts`:
```ts
import { addDays } from '@/lib/dates';
import type { MetaInsightRow, MetaInsightsResponse } from './types';

const BASE = 'https://graph.facebook.com';
const VERSION = 'v21.0';

export class MetaClient {
  constructor(
    private readonly accessToken: string,
    private readonly adAccountId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchInsights(days: number): Promise<MetaInsightRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    const since = addDays(today, -(days - 1));
    const params = new URLSearchParams({
      level: 'account',
      time_increment: '1',
      time_range: JSON.stringify({ since, until: today }),
      fields: 'spend,impressions,clicks,actions,action_values',
      limit: '500',
    });
    let url: string | null = `${BASE}/${VERSION}/act_${this.adAccountId}/insights?${params.toString()}`;

    const rows: MetaInsightRow[] = [];
    while (url) {
      const res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`Meta insights failed: ${res.status} ${await res.text()}`);
      }
      const json = (await res.json()) as MetaInsightsResponse;
      rows.push(...json.data);
      url = json.paging?.next ?? null;
    }
    return rows;
  }
}
```

- [ ] **Step 4: Test ausführen — grün**

Run: `npm test -- tests/connectors/meta/client.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/meta/client.ts tests/connectors/meta/client.test.ts
git commit -m "feat: meta marketing api client (insights, paginated)"
```

---

### Task 3: Transaktionaler Write (zwei Tabellen), CLI-Skript & Konfiguration

**Files:**
- Create: `src/connectors/meta/write.ts`, `scripts/sync-meta.ts`
- Modify: `package.json` (Script `sync:meta`), `.env.example` (META_*)
- Test: `tests/connectors/meta/write.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset` aus `@/lib/types`; `pool` aus `@/lib/db`; `MetaClient` (Task 2), `normalizeInsights` (Task 1).
- Produces: `writeMetaAds(data: CanonicalDataset): Promise<void>` — Transaktion `DELETE ad_spend WHERE platform='meta_ads'` + `DELETE daily_metrics WHERE source='meta_ads'` + gebündelte Inserts in beide; wirft bei `data.adSpend.length === 0` **ohne** zu löschen.

- [ ] **Step 1: Failing integration test schreiben**

`tests/connectors/meta/write.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { writeMetaAds } from '@/connectors/meta/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  orders: [], customers: [], subscribers: [],
  adSpend: [
    { date: '2026-05-01', platform: 'meta_ads', spend: 50, impressions: 10000, clicks: 120, conversions: 3, convValue: 300 },
    { date: '2026-05-02', platform: 'meta_ads', spend: 60, impressions: 12000, clicks: 140, conversions: 4, convValue: 420 },
  ],
  dailyMetrics: [
    { date: '2026-05-01', source: 'meta_ads', channel: 'default', metricKey: 'video_views', value: 800 },
    { date: '2026-05-02', source: 'meta_ads', channel: 'default', metricKey: 'video_views', value: 900 },
  ],
};

describe('writeMetaAds (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt nur Meta-Quellen, lässt andere Plattformen/Quellen unberührt', async () => {
    const before = await loadDataset();
    const otherAds = before.adSpend.filter((a) => a.platform !== 'meta_ads').length;
    const otherDm = before.dailyMetrics.filter((m) => m.source !== 'meta_ads').length;
    const ordersBefore = before.orders.length;

    await writeMetaAds(sample);
    const after = await loadDataset();

    const metaAds = after.adSpend.filter((a) => a.platform === 'meta_ads');
    const metaVv = after.dailyMetrics.filter((m) => m.source === 'meta_ads');
    expect(metaAds.map((a) => a.date).sort()).toEqual(['2026-05-01', '2026-05-02']);
    expect(metaVv.map((m) => m.value).sort((x, y) => x - y)).toEqual([800, 900]);
    expect(after.adSpend.filter((a) => a.platform !== 'meta_ads').length).toBe(otherAds);
    expect(after.dailyMetrics.filter((m) => m.source !== 'meta_ads').length).toBe(otherDm);
    expect(after.orders.length).toBe(ordersBefore);
  });

  it('bricht bei 0 ad_spend-Zeilen ab, ohne zu löschen', async () => {
    await expect(writeMetaAds({ ...sample, adSpend: [] }))
      .rejects.toThrow(/0 ad_spend rows/i);
    const after = await loadDataset();
    expect(after.adSpend.filter((a) => a.platform === 'meta_ads').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/meta/write.test.ts`
Expected: FAIL — `@/connectors/meta/write` nicht gefunden.

- [ ] **Step 3: `writeMetaAds` implementieren**

`src/connectors/meta/write.ts`:
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

export async function writeMetaAds(data: CanonicalDataset): Promise<void> {
  if (data.adSpend.length === 0) {
    throw new Error('Meta sync: 0 ad_spend rows — aborting without deleting.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM ad_spend WHERE platform = 'meta_ads'`);
    await client.query(`DELETE FROM daily_metrics WHERE source = 'meta_ads'`);
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

Run: `npm test -- tests/connectors/meta/write.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: CLI-Skript implementieren**

`scripts/sync-meta.ts`:
```ts
import { MetaClient } from '../src/connectors/meta/client';
import { normalizeInsights } from '../src/connectors/meta/connector';
import { writeMetaAds } from '../src/connectors/meta/write';
import { pool } from '../src/lib/db';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    throw new Error('Missing META_ACCESS_TOKEN / META_AD_ACCOUNT_ID in environment.');
  }
  const purchaseActionType = process.env.META_PURCHASE_ACTION_TYPE ?? 'purchase';
  const days = parseDays(process.argv);

  const client = new MetaClient(accessToken, adAccountId);
  console.log(`Fetching Meta insights (last ${days} days)…`);
  const rows = await client.fetchInsights(days);
  console.log(`Fetched ${rows.length} day rows.`);

  const data = normalizeInsights(rows, { purchaseActionType });
  console.log(`Normalized → ${data.adSpend.length} ad_spend + ${data.dailyMetrics.length} video_views rows (meta_ads).`);

  await writeMetaAds(data);
  console.log('Wrote meta_ads ad_spend + video_views to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: `package.json`-Script ergänzen**

In `package.json` unter `"scripts"` ergänzen (nach `"sync:klaviyo"`):
```json
    "sync:meta": "tsx scripts/sync-meta.ts",
```

- [ ] **Step 7: `.env.example` ergänzen**

An `.env.example` anhängen:
```
META_ACCESS_TOKEN=your-system-user-access-token
META_AD_ACCOUNT_ID=1234567890
META_PURCHASE_ACTION_TYPE=purchase
```

- [ ] **Step 8: Volle Suite ausführen — grün**

Run: `npm test`
Expected: PASS (alle bisherigen Tests + 9 neue Meta-Tests; Integrationstests benötigen die laufende DB).

- [ ] **Step 9: Commit**

```bash
git add src/connectors/meta/write.ts scripts/sync-meta.ts tests/connectors/meta/write.test.ts package.json .env.example
git commit -m "feat: meta ads sync CLI with transactional ad_spend + video_views replace"
```

- [ ] **Step 10: Live-Verifikation (aufgeschoben — sobald Token + Account-ID vorliegen)**

```bash
# .env mit echten Werten füllen (NICHT committen): META_ACCESS_TOKEN, META_AD_ACCOUNT_ID; DB läuft:
docker compose up -d db && npm run migrate   # falls nötig
npm run sync:meta
```
Erwartet: „Fetched N day rows / Normalized → N ad_spend + N video_views". Danach:
```bash
curl -s "http://localhost:3001/api/kpis?days=30" | node -e 'const b=require("/dev/stdin");for(const p of b.phases){if(["see","do"].includes(p.phase))console.log(p.title,p.kpis.map(k=>k.key+"="+(k.available?k.value:"N/A")).join(", "))}'
```
Erwartet: SEE Impressions/CPM/Video Views und DO ROAS/CAC zeigen echte Meta-Werte (ROAS/CAC mischen Meta-Spend mit Shopware-Conversions/Neukunden, bis weitere Ads-Connectoren folgen). **Stichprobe:** Spend/Impressions im Dashboard ≈ Meta Ads Manager im selben Zeitraum. Häufiger Fehlerfall: `190` = Token abgelaufen → neues System-User-Token, erneut syncen.

---

## Definition of Done

- `npm test` grün inkl. 9 neuer Meta-Tests (normalize 5, client 2, write 2).
- `npm run sync:meta [--days N]` lädt echte Meta-Insights in `ad_spend` (platform='meta_ads') + `daily_metrics` video_views (source='meta_ads'), lässt andere Plattformen/Quellen unberührt, ist wiederholbar (Replace beider Tabellen).
- SEE (Impressions/CPM/Video Views) und DO (ROAS/CAC) zeigen nach dem Sync Meta-basierte Werte; 0-Zeilen-Abbruch greift.
- Keine Secrets im Repo.

## Verifizierte Spec-Abdeckung (Self-Review)

- Bearer-Auth, Graph-API v21.0, act-Insights-Endpoint + fields + time_increment + time_range: Task 2 ✓
- Paginierung via `paging.next`: Task 2 ✓
- Mapping ad_spend (spend/impressions/clicks/purchase-conversions/conv_value) + konfigurierbarer `purchaseActionType`: Task 1 (+ CLI Task 3) ✓
- video_view → daily_metrics source=meta_ads: Task 1 ✓
- `Number()`-Cast überall: Task 1 ✓
- Zwei-Tabellen-Transaktion, selektiver Replace (platform=meta_ads / source=meta_ads), 0-Zeilen-Abbruch: Task 3 ✓
- On-Demand-CLI `sync:meta --days`, kein Scheduler, kein Schema-Change: Task 3 ✓
- Secrets nur in `.env` (`.env.example` als Vorlage): Task 3 ✓
- Live-Verifikation (aufgeschoben) inkl. Spend-Stichprobe + 190-Hinweis: Task 3 Step 10 ✓
