# Klaviyo-Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Newsletter-Anmeldungen/-Abmeldungen aus Klaviyo über einen On-Demand-CLI-Sync in die kanonische `subscribers`-Tabelle laden (`source='klaviyo'`), sodass THINK `newsletter_signups` echte Zahlen zeigt.

**Architecture:** Drei isolierte Einheiten nach dem `Connector`-Muster: `client.ts` (Header-Auth + Metrik-Discovery `listMetrics`/`resolveMetricId` + `metricAggregate` per fetch), `connector.ts` (`normalizeAggregates()` → `CanonicalDataset`, rein), `write.ts` (transaktionaler Replace nur der `source='klaviyo'`-Zeilen). CLI `scripts/sync-klaviyo.ts` mit `--days`. Engine/API/UI unverändert.

**Tech Stack:** TypeScript · `fetch` (in Tests injiziert) · `pg` · `tsx` · Vitest. Keine neue Dependency. Baut auf V1 + Shopware + GA4.

## Global Constraints

- Auth: Header `Authorization: Klaviyo-API-Key <KLAVIYO_API_KEY>` + Pflicht-Header `revision: 2024-10-15`. Basis-URL `https://a.klaviyo.com`.
- Metrik-Discovery: `GET /api/metrics` → `data[].id` + `data[].attributes.name`; konfigurierte Namen (Env, Defaults `Subscribed to List` / `Unsubscribed`) zu IDs auflösen. **Unbekannter Name → Abbruch mit Auflistung der verfügbaren Metriknamen.**
- Aggregate: `POST /api/metric-aggregates` mit `attributes: { metric_id, measurements:['count'], interval:'day', timezone:'Europe/Berlin', filter:[greater-or-equal(datetime,…), less-than(datetime,…)], page_size:500 }`. Antwort: `data.attributes.dates[]` index-aligned mit `data.attributes.data[0].measurements.count[]`.
- Mapping → `subscribers`-Record je Tag (Vereinigung beider Datumslisten): `date` (Bucket `YYYY-MM-DD`), `source:'klaviyo'`, `signups` (Signup-Count, fehlender Tag → 0), `unsubscribes` (Unsub-Count → 0), `npsScore: null`.
- Counts via `Number()`; `date` = Bucket-ISO `[0:10]`.
- Schreibt nur `subscribers` mit `source='klaviyo'`. Write = Transaktion `DELETE WHERE source='klaviyo'` + gebündelte Inserts. **Bei 0 Zeilen abbrechen ohne DELETE.**
- On-Demand-CLI `npm run sync:klaviyo [--days N]`, Default 180. Kein Scheduler, kein Schema-Change.
- Secrets (`KLAVIYO_API_KEY`) nur in `.env`/lokal, nie committet.
- Kanonische Typen (aus V1): `Subscriber { date, source, signups, unsubscribes, npsScore: number | null }`, `CanonicalDataset { dailyMetrics, orders, customers, adSpend, subscribers }`.

---

## File Structure

```
src/connectors/klaviyo/
  types.ts        # KlaviyoMetric, KlaviyoAggregateAttributes
  connector.ts    # normalizeAggregates(signups, unsubs): CanonicalDataset (rein)
  client.ts       # KlaviyoClient: listMetrics, resolveMetricId, metricAggregate
  write.ts        # writeKlaviyoSubscribers(data): transaktionaler klaviyo-Replace
scripts/sync-klaviyo.ts        # CLI mit --days
tests/connectors/klaviyo/
  normalize.test.ts   # rein, Fixtures inline
  client.test.ts      # gemockter fetch
  write.test.ts       # Integration gegen DB
.env.example        # + KLAVIYO_API_KEY, KLAVIYO_SIGNUP_METRIC, KLAVIYO_UNSUB_METRIC
package.json        # + "sync:klaviyo" script
```

---

### Task 1: Klaviyo-Rohtypen & `normalizeAggregates` (rein)

**Files:**
- Create: `src/connectors/klaviyo/types.ts`, `src/connectors/klaviyo/connector.ts`
- Test: `tests/connectors/klaviyo/normalize.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset`, `Subscriber` aus `@/lib/types`.
- Produces: Typen `KlaviyoMetric`, `KlaviyoAggregateAttributes`; `normalizeAggregates(signups: KlaviyoAggregateAttributes, unsubs: KlaviyoAggregateAttributes): CanonicalDataset` (nur `subscribers` befüllt; Tag-Vereinigung; fehlender Tag → 0; `npsScore:null`).

- [ ] **Step 1: Rohtypen anlegen**

`src/connectors/klaviyo/types.ts`:
```ts
export interface KlaviyoMetric {
  id: string;
  name: string;
}

export interface KlaviyoMeasurements {
  count?: Array<number | string>;
}

export interface KlaviyoAggregateAttributes {
  dates: string[];
  data: Array<{ measurements: KlaviyoMeasurements }>;
}
```

- [ ] **Step 2: Failing test schreiben**

`tests/connectors/klaviyo/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeAggregates } from '@/connectors/klaviyo/connector';
import type { KlaviyoAggregateAttributes } from '@/connectors/klaviyo/types';

const signups: KlaviyoAggregateAttributes = {
  dates: ['2026-01-01T00:00:00+01:00', '2026-01-02T00:00:00+01:00'],
  data: [{ measurements: { count: [10, 20] } }],
};
const unsubs: KlaviyoAggregateAttributes = {
  dates: ['2026-01-02T00:00:00+01:00', '2026-01-03T00:00:00+01:00'],
  data: [{ measurements: { count: [2, 3] } }],
};

function row(ds: ReturnType<typeof normalizeAggregates>, date: string) {
  return ds.subscribers.find((s) => s.date === date)!;
}

describe('normalizeAggregates', () => {
  it('vereinigt beide Datumslisten, fehlender Tag → 0', () => {
    const ds = normalizeAggregates(signups, unsubs);
    expect(ds.subscribers.map((s) => s.date)).toEqual(['2026-01-01', '2026-01-02', '2026-01-03']);
    expect(row(ds, '2026-01-01')).toMatchObject({ signups: 10, unsubscribes: 0 });
    expect(row(ds, '2026-01-02')).toMatchObject({ signups: 20, unsubscribes: 2 });
    expect(row(ds, '2026-01-03')).toMatchObject({ signups: 0, unsubscribes: 3 });
  });
  it('setzt source klaviyo, npsScore null, Werte numerisch', () => {
    const ds = normalizeAggregates(signups, unsubs);
    expect(ds.subscribers.every((s) => s.source === 'klaviyo' && s.npsScore === null)).toBe(true);
    expect(ds.subscribers.every((s) => typeof s.signups === 'number' && typeof s.unsubscribes === 'number')).toBe(true);
  });
  it('befüllt nur subscribers', () => {
    const ds = normalizeAggregates(signups, unsubs);
    expect(ds.dailyMetrics).toHaveLength(0);
    expect(ds.orders).toHaveLength(0);
    expect(ds.customers).toHaveLength(0);
    expect(ds.adSpend).toHaveLength(0);
  });
  it('ist robust gegen leere measurements', () => {
    const empty: KlaviyoAggregateAttributes = { dates: [], data: [] };
    expect(normalizeAggregates(empty, empty).subscribers).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/klaviyo/normalize.test.ts`
Expected: FAIL — `@/connectors/klaviyo/connector` nicht gefunden.

- [ ] **Step 4: `normalizeAggregates` implementieren**

`src/connectors/klaviyo/connector.ts`:
```ts
import type { CanonicalDataset, Subscriber } from '@/lib/types';
import type { KlaviyoAggregateAttributes } from './types';

function toMap(agg: KlaviyoAggregateAttributes): Map<string, number> {
  const counts = agg.data[0]?.measurements?.count ?? [];
  const map = new Map<string, number>();
  agg.dates.forEach((iso, i) => {
    map.set(iso.slice(0, 10), Number(counts[i] ?? 0));
  });
  return map;
}

export function normalizeAggregates(
  signups: KlaviyoAggregateAttributes,
  unsubs: KlaviyoAggregateAttributes,
): CanonicalDataset {
  const sMap = toMap(signups);
  const uMap = toMap(unsubs);
  const dates = [...new Set([...sMap.keys(), ...uMap.keys()])].sort();

  const subscribers: Subscriber[] = dates.map((date) => ({
    date,
    source: 'klaviyo',
    signups: sMap.get(date) ?? 0,
    unsubscribes: uMap.get(date) ?? 0,
    npsScore: null,
  }));

  return { dailyMetrics: [], orders: [], customers: [], adSpend: [], subscribers };
}
```

- [ ] **Step 5: Test ausführen — grün**

Run: `npm test -- tests/connectors/klaviyo/normalize.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/connectors/klaviyo/types.ts src/connectors/klaviyo/connector.ts tests/connectors/klaviyo/normalize.test.ts
git commit -m "feat: klaviyo aggregate normalization to canonical subscribers"
```

---

### Task 2: `KlaviyoClient` (Auth + Discovery + Aggregates)

**Files:**
- Create: `src/connectors/klaviyo/client.ts`
- Test: `tests/connectors/klaviyo/client.test.ts`

**Interfaces:**
- Consumes: `KlaviyoMetric`, `KlaviyoAggregateAttributes` aus `./types`; `addDays` aus `@/lib/dates`.
- Produces:
  - `class KlaviyoClient` mit Konstruktor `(apiKey: string, fetchImpl?: typeof fetch)`.
  - `listMetrics(): Promise<KlaviyoMetric[]>`.
  - `resolveMetricId(name: string): Promise<string>` (wirft mit Auflistung, wenn nicht gefunden).
  - `metricAggregate(metricId: string, days: number): Promise<KlaviyoAggregateAttributes>`.

- [ ] **Step 1: Failing test schreiben**

`tests/connectors/klaviyo/client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { KlaviyoClient } from '@/connectors/klaviyo/client';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const metricsBody = {
  data: [
    { id: 'M1', attributes: { name: 'Subscribed to List' } },
    { id: 'M2', attributes: { name: 'Unsubscribed' } },
  ],
};

describe('KlaviyoClient', () => {
  it('listet Metriken und sendet Auth + revision Header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(metricsBody));
    const client = new KlaviyoClient('KEY', fetchMock as unknown as typeof fetch);
    const metrics = await client.listMetrics();
    expect(metrics).toEqual([
      { id: 'M1', name: 'Subscribed to List' },
      { id: 'M2', name: 'Unsubscribed' },
    ]);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://a.klaviyo.com/api/metrics');
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: 'Klaviyo-API-Key KEY',
      revision: '2024-10-15',
    });
  });

  it('löst Metriknamen zu IDs auf', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(metricsBody));
    const client = new KlaviyoClient('KEY', fetchMock as unknown as typeof fetch);
    expect(await client.resolveMetricId('Unsubscribed')).toBe('M2');
  });

  it('wirft mit Auflistung, wenn ein Metrikname fehlt', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(metricsBody));
    const client = new KlaviyoClient('KEY', fetchMock as unknown as typeof fetch);
    await expect(client.resolveMetricId('Nope'))
      .rejects.toThrow(/not found.*Subscribed to List, Unsubscribed/);
  });

  it('baut den Aggregate-Request mit metric_id, interval, timezone, Filter', async () => {
    const aggBody = { data: { attributes: { dates: ['2026-01-01T00:00:00+01:00'], data: [{ measurements: { count: [5] } }] } } };
    const fetchMock = vi.fn().mockResolvedValue(res(aggBody));
    const client = new KlaviyoClient('KEY', fetchMock as unknown as typeof fetch);
    const attrs = await client.metricAggregate('M1', 30);
    expect(attrs.dates).toEqual(['2026-01-01T00:00:00+01:00']);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://a.klaviyo.com/api/metric-aggregates');
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.data.attributes.metric_id).toBe('M1');
    expect(body.data.attributes.interval).toBe('day');
    expect(body.data.attributes.timezone).toBe('Europe/Berlin');
    expect(body.data.attributes.measurements).toEqual(['count']);
    expect(body.data.attributes.filter[0]).toMatch(/^greater-or-equal\(datetime,/);
  });

  it('wirft bei HTTP-Fehler mit Status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ errors: [] }, 401));
    const client = new KlaviyoClient('KEY', fetchMock as unknown as typeof fetch);
    await expect(client.listMetrics()).rejects.toThrow(/failed: 401/);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/klaviyo/client.test.ts`
Expected: FAIL — `@/connectors/klaviyo/client` nicht gefunden.

- [ ] **Step 3: `KlaviyoClient` implementieren**

`src/connectors/klaviyo/client.ts`:
```ts
import { addDays } from '@/lib/dates';
import type { KlaviyoAggregateAttributes, KlaviyoMetric } from './types';

const BASE = 'https://a.klaviyo.com';
const REVISION = '2024-10-15';

export class KlaviyoClient {
  constructor(
    private readonly apiKey: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  private headers(): Record<string, string> {
    return {
      Authorization: `Klaviyo-API-Key ${this.apiKey}`,
      revision: REVISION,
      accept: 'application/json',
      'content-type': 'application/json',
    };
  }

  async listMetrics(): Promise<KlaviyoMetric[]> {
    const res = await this.fetchImpl(`${BASE}/api/metrics`, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(`Klaviyo listMetrics failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { id: string; attributes: { name: string } }[] };
    return json.data.map((m) => ({ id: m.id, name: m.attributes.name }));
  }

  async resolveMetricId(name: string): Promise<string> {
    const metrics = await this.listMetrics();
    const found = metrics.find((m) => m.name === name);
    if (!found) {
      const available = metrics.map((m) => m.name).join(', ');
      throw new Error(`Klaviyo metric "${name}" not found. Available: ${available}`);
    }
    return found.id;
  }

  async metricAggregate(metricId: string, days: number): Promise<KlaviyoAggregateAttributes> {
    const today = new Date().toISOString().slice(0, 10);
    const start = addDays(today, -(days - 1));
    const endExclusive = addDays(today, 1);
    const body = {
      data: {
        type: 'metric-aggregate',
        attributes: {
          metric_id: metricId,
          measurements: ['count'],
          interval: 'day',
          timezone: 'Europe/Berlin',
          filter: [
            `greater-or-equal(datetime,${start}T00:00:00)`,
            `less-than(datetime,${endExclusive}T00:00:00)`,
          ],
          page_size: 500,
        },
      },
    };
    const res = await this.fetchImpl(`${BASE}/api/metric-aggregates`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`Klaviyo metricAggregate failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { data: { attributes: KlaviyoAggregateAttributes } };
    return json.data.attributes;
  }
}
```

- [ ] **Step 4: Test ausführen — grün**

Run: `npm test -- tests/connectors/klaviyo/client.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/connectors/klaviyo/client.ts tests/connectors/klaviyo/client.test.ts
git commit -m "feat: klaviyo api client (metric discovery + aggregates)"
```

---

### Task 3: Transaktionaler Write, CLI-Skript & Konfiguration

**Files:**
- Create: `src/connectors/klaviyo/write.ts`, `scripts/sync-klaviyo.ts`
- Modify: `package.json` (Script `sync:klaviyo`), `.env.example` (KLAVIYO_*)
- Test: `tests/connectors/klaviyo/write.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset` aus `@/lib/types`; `pool` aus `@/lib/db`; `KlaviyoClient` (Task 2), `normalizeAggregates` (Task 1).
- Produces: `writeKlaviyoSubscribers(data: CanonicalDataset): Promise<void>` — Transaktion `DELETE FROM subscribers WHERE source='klaviyo'` + gebündelte Inserts; wirft bei `data.subscribers.length === 0` **ohne** zu löschen.

- [ ] **Step 1: Failing integration test schreiben**

`tests/connectors/klaviyo/write.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { writeKlaviyoSubscribers } from '@/connectors/klaviyo/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  dailyMetrics: [], orders: [], customers: [], adSpend: [],
  subscribers: [
    { date: '2026-05-01', source: 'klaviyo', signups: 7, unsubscribes: 1, npsScore: null },
    { date: '2026-05-02', source: 'klaviyo', signups: 4, unsubscribes: 0, npsScore: null },
  ],
};

describe('writeKlaviyoSubscribers (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt klaviyo-Subscribers, lässt orders und daily_metrics unberührt', async () => {
    const before = await loadDataset();
    const ordersBefore = before.orders.length;
    const dmBefore = before.dailyMetrics.length;
    await writeKlaviyoSubscribers(sample);
    const after = await loadDataset();
    const klaviyo = after.subscribers.filter((s) => s.source === 'klaviyo');
    expect(klaviyo.map((s) => s.date).sort()).toEqual(['2026-05-01', '2026-05-02']);
    expect(klaviyo.every((s) => s.npsScore === null)).toBe(true);
    expect(after.orders.length).toBe(ordersBefore);
    expect(after.dailyMetrics.length).toBe(dmBefore);
  });

  it('bricht bei 0 Zeilen ab, ohne klaviyo-Daten zu löschen', async () => {
    await expect(writeKlaviyoSubscribers({ ...sample, subscribers: [] }))
      .rejects.toThrow(/0 subscriber rows/i);
    const after = await loadDataset();
    expect(after.subscribers.filter((s) => s.source === 'klaviyo').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/klaviyo/write.test.ts`
Expected: FAIL — `@/connectors/klaviyo/write` nicht gefunden.

- [ ] **Step 3: `writeKlaviyoSubscribers` implementieren**

`src/connectors/klaviyo/write.ts`:
```ts
import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { CanonicalDataset, Subscriber } from '@/lib/types';

const CHUNK = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertSubscribers(client: PoolClient, subs: Subscriber[]): Promise<void> {
  for (const part of chunk(subs, CHUNK)) {
    const values: unknown[] = [];
    const rows = part.map((s, i) => {
      const b = i * 5;
      values.push(s.date, s.source, s.signups, s.unsubscribes, s.npsScore);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    await client.query(
      `INSERT INTO subscribers(date, source, signups, unsubscribes, nps_score) VALUES ${rows.join(',')}`,
      values,
    );
  }
}

export async function writeKlaviyoSubscribers(data: CanonicalDataset): Promise<void> {
  if (data.subscribers.length === 0) {
    throw new Error('Klaviyo sync: 0 subscriber rows — aborting without deleting.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM subscribers WHERE source = 'klaviyo'`);
    await insertSubscribers(client, data.subscribers);
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

Run: `npm test -- tests/connectors/klaviyo/write.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: CLI-Skript implementieren**

`scripts/sync-klaviyo.ts`:
```ts
import { KlaviyoClient } from '../src/connectors/klaviyo/client';
import { normalizeAggregates } from '../src/connectors/klaviyo/connector';
import { writeKlaviyoSubscribers } from '../src/connectors/klaviyo/write';
import { pool } from '../src/lib/db';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const apiKey = process.env.KLAVIYO_API_KEY;
  if (!apiKey) {
    throw new Error('Missing KLAVIYO_API_KEY in environment.');
  }
  const signupMetric = process.env.KLAVIYO_SIGNUP_METRIC ?? 'Subscribed to List';
  const unsubMetric = process.env.KLAVIYO_UNSUB_METRIC ?? 'Unsubscribed';
  const days = parseDays(process.argv);

  const client = new KlaviyoClient(apiKey);
  console.log('Resolving Klaviyo metric IDs…');
  const signupId = await client.resolveMetricId(signupMetric);
  const unsubId = await client.resolveMetricId(unsubMetric);

  console.log(`Fetching aggregates (last ${days} days)…`);
  const signupAgg = await client.metricAggregate(signupId, days);
  const unsubAgg = await client.metricAggregate(unsubId, days);

  const data = normalizeAggregates(signupAgg, unsubAgg);
  console.log(`Normalized → ${data.subscribers.length} subscriber day-rows (source=klaviyo).`);

  await writeKlaviyoSubscribers(data);
  console.log('Wrote klaviyo subscribers to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: `package.json`-Script ergänzen**

In `package.json` unter `"scripts"` ergänzen (nach `"sync:ga4"`):
```json
    "sync:klaviyo": "tsx scripts/sync-klaviyo.ts",
```

- [ ] **Step 7: `.env.example` ergänzen**

An `.env.example` anhängen:
```
KLAVIYO_API_KEY=pk_your_private_api_key
KLAVIYO_SIGNUP_METRIC=Subscribed to List
KLAVIYO_UNSUB_METRIC=Unsubscribed
```

- [ ] **Step 8: Volle Suite ausführen — grün**

Run: `npm test`
Expected: PASS (alle bisherigen Tests + 11 neue Klaviyo-Tests; Integrationstests benötigen die laufende DB).

- [ ] **Step 9: Commit**

```bash
git add src/connectors/klaviyo/write.ts scripts/sync-klaviyo.ts tests/connectors/klaviyo/write.test.ts package.json .env.example
git commit -m "feat: klaviyo sync CLI with transactional subscribers replace"
```

- [ ] **Step 10: Live-Verifikation (aufgeschoben — sobald Private API Key vorliegt)**

```bash
# .env mit echtem KLAVIYO_API_KEY füllen (NICHT committen); ggf. KLAVIYO_SIGNUP_METRIC/UNSUB_METRIC an Kontonamen anpassen; DB läuft:
docker compose up -d db && npm run migrate   # falls nötig
npm run sync:klaviyo
```
Erwartet: „Resolving … / Fetched aggregates / Normalized → N rows". Falls ein Metrikname fehlt, listet der Fehler die verfügbaren Metriken — dann den passenden Namen in `.env` setzen und erneut syncen. Danach:
```bash
curl -s "http://localhost:3001/api/kpis?days=30" | node -e 'const b=require("/dev/stdin");const t=b.phases.find(p=>p.phase==="think").kpis.find(k=>k.key==="newsletter_signups");console.log("newsletter_signups =", t.available?t.value:"N/A")'
```
Erwartet: THINK `newsletter_signups` zeigt echte Klaviyo-Zahlen. **Stichprobe:** Anmeldungen im Dashboard ≈ Klaviyo-Metrik im selben Zeitraum.

---

## Definition of Done

- `npm test` grün inkl. 11 neuer Klaviyo-Tests (normalize 4, client 5, write 2).
- `npm run sync:klaviyo [--days N]` lädt echte Anmeldungen/Abmeldungen in `subscribers` (`source='klaviyo'`), lässt andere Quellen unberührt, ist wiederholbar (Replace).
- THINK `newsletter_signups` zeigt nach dem Sync echte Werte; unbekannter Metrikname bricht selbstdiagnostisch ab.
- Keine Secrets im Repo.

## Verifizierte Spec-Abdeckung (Self-Review)

- Header-Auth (Klaviyo-API-Key + revision), Basis-URL: Task 2 ✓
- Metrik-Discovery (Name→ID) + „nicht gefunden"-Abbruch mit Auflistung: Task 2 ✓
- Aggregate-Request (metric_id, interval=day, timezone=Europe/Berlin, Filter, page_size): Task 2 ✓
- Mapping inkl. Tag-Vereinigung (fehlend → 0), `Number()`-Cast, `npsScore:null`: Task 1 ✓
- Nur `subscribers` source=klaviyo; selektiver Replace; 0-Zeilen-Abbruch ohne DELETE: Task 1 (leere übrige Arrays) + Task 3 ✓
- Konfigurierbare Metriknamen (Env, Defaults): Task 3 (CLI) ✓
- On-Demand-CLI `sync:klaviyo --days`, kein Scheduler, kein Schema-Change: Task 3 ✓
- Secrets nur in `.env` (`.env.example` als Vorlage): Task 3 ✓
- Live-Verifikation (aufgeschoben) inkl. Signups-Stichprobe: Task 3 Step 10 ✓
