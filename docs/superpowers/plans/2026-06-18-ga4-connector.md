# GA4-Connector Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Echte GA4-Web-Analytics über einen On-Demand-CLI-Sync ins kanonische Schema laden (7 `daily_metrics`-Keys, `source='ga4'`), sodass THINK-KPIs und die echten DO-Quoten (Conversion Rate, Warenkorbabbruch) befüllt werden.

**Architecture:** Drei isolierte Einheiten nach dem `Connector`-Muster: `client.ts` (Auth via `google-auth-library` + `runReport` per fetch), `connector.ts` (`normalizeReport()` → `CanonicalDataset`, rein), `write.ts` (transaktionaler Replace nur der `source='ga4'`-Zeilen). CLI `scripts/sync-ga4.ts` mit `--days`. Engine/API/UI unverändert.

**Tech Stack:** TypeScript · `google-auth-library` (nur Auth) · `fetch` (in Tests injiziert) · `pg` · `tsx` · Vitest. Baut auf V1 + Shopware-Connector.

## Global Constraints

- Auth: `google-auth-library` `GoogleAuth` (Scope `https://www.googleapis.com/auth/analytics.readonly`); Service-Account-Key über `GOOGLE_APPLICATION_CREDENTIALS` (Pfad). `runReport` per raw fetch.
- Endpoint: `POST https://analyticsdata.googleapis.com/v1beta/properties/{GA4_PROPERTY_ID}:runReport`.
- 7 GA4-Metriken (feste Reihenfolge): `sessions, screenPageViews, totalUsers, newUsers, engagedSessions, addToCarts, checkouts`. Dimension `date`. `dateRanges:[{startDate:'${days-1}daysAgo', endDate:'today'}]`, Default `days=180`.
- Mapping → 7 `metric_key`s: `sessions`←sessions; `pageviews`←screenPageViews; `total_users`←totalUsers; `returning_users`←max(0, totalUsers−newUsers); `bounced_sessions`←max(0, sessions−engagedSessions); `add_to_carts`←addToCarts; `checkouts_started`←checkouts.
- GA4-`date` ist `YYYYMMDD` → `YYYY-MM-DD`; Metrikwerte sind Strings → `Number()`.
- Schreibt nur `daily_metrics` mit `source='ga4'`, `channel='default'`. Write = Transaktion `DELETE WHERE source='ga4'` + gebündelte Inserts. **Bei 0 Zeilen abbrechen ohne DELETE.**
- On-Demand-CLI `npm run sync:ga4 [--days N]`. Kein Scheduler, kein Schema-Change.
- Secrets (Key-Datei, `GA4_PROPERTY_ID`) nur in `.env`/lokal, nie committet.
- Kanonische Typen (aus V1, unverändert): `DailyMetric { date, source, channel, metricKey, value }`, `CanonicalDataset { dailyMetrics, orders, customers, adSpend, subscribers }`.

---

## File Structure

```
src/connectors/ga4/
  types.ts        # Ga4Report/Ga4Row Rohtypen
  connector.ts    # normalizeReport(report): CanonicalDataset (rein)
  client.ts       # Ga4Client: runReport (+ fromEnv auth wiring)
  write.ts        # writeGa4Metrics(data): transaktionaler ga4-Replace
scripts/sync-ga4.ts          # CLI mit --days
tests/connectors/ga4/
  normalize.test.ts   # rein, Fixture inline
  client.test.ts      # gemockter fetch + stub token
  write.test.ts       # Integration gegen DB
.env.example        # + GA4_PROPERTY_ID, GOOGLE_APPLICATION_CREDENTIALS
package.json        # + google-auth-library dep + "sync:ga4" script
```

---

### Task 1: GA4-Rohtypen & `normalizeReport` (rein)

**Files:**
- Create: `src/connectors/ga4/types.ts`, `src/connectors/ga4/connector.ts`
- Test: `tests/connectors/ga4/normalize.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset`, `DailyMetric` aus `@/lib/types`.
- Produces: Typen `Ga4MetricValue`, `Ga4DimensionValue`, `Ga4Row`, `Ga4Report`; `normalizeReport(report: Ga4Report): CanonicalDataset` (nur `dailyMetrics` befüllt; 7 Keys/Zeile; Mapping + Ableitungen + Datums-/Number-Konvertierung).

- [ ] **Step 1: Rohtypen anlegen**

`src/connectors/ga4/types.ts`:
```ts
export interface Ga4MetricValue { value: string }
export interface Ga4DimensionValue { value: string }
export interface Ga4Row {
  dimensionValues: Ga4DimensionValue[];
  metricValues: Ga4MetricValue[];
}
export interface Ga4Header { name: string }
export interface Ga4Report {
  dimensionHeaders?: Ga4Header[];
  metricHeaders?: Ga4Header[];
  rows?: Ga4Row[];
}
```

- [ ] **Step 2: Failing test schreiben**

`tests/connectors/ga4/normalize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { normalizeReport } from '@/connectors/ga4/connector';
import type { Ga4Report } from '@/connectors/ga4/types';

const report: Ga4Report = {
  dimensionHeaders: [{ name: 'date' }],
  metricHeaders: [
    { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'totalUsers' },
    { name: 'newUsers' }, { name: 'engagedSessions' }, { name: 'addToCarts' }, { name: 'checkouts' },
  ],
  rows: [
    { dimensionValues: [{ value: '20260101' }], metricValues: [{ value: '1000' }, { value: '3000' }, { value: '800' }, { value: '600' }, { value: '650' }, { value: '120' }, { value: '40' }] },
    { dimensionValues: [{ value: '20260102' }], metricValues: [{ value: '500' }, { value: '1500' }, { value: '400' }, { value: '500' }, { value: '480' }, { value: '60' }, { value: '20' }] },
  ],
};

function val(ds: ReturnType<typeof normalizeReport>, date: string, key: string): number {
  return ds.dailyMetrics.find((m) => m.date === date && m.metricKey === key)!.value;
}

describe('normalizeReport', () => {
  it('erzeugt 7 numerische daily_metrics je Tag, source ga4', () => {
    const ds = normalizeReport(report);
    expect(ds.dailyMetrics).toHaveLength(14); // 2 Tage × 7 Keys
    expect(ds.dailyMetrics.every((m) => m.source === 'ga4' && m.channel === 'default')).toBe(true);
    expect(ds.dailyMetrics.every((m) => typeof m.value === 'number')).toBe(true);
  });
  it('mappt direkte Metriken und konvertiert das Datum', () => {
    const ds = normalizeReport(report);
    expect(val(ds, '2026-01-01', 'sessions')).toBe(1000);
    expect(val(ds, '2026-01-01', 'pageviews')).toBe(3000);
    expect(val(ds, '2026-01-01', 'total_users')).toBe(800);
    expect(val(ds, '2026-01-01', 'add_to_carts')).toBe(120);
    expect(val(ds, '2026-01-01', 'checkouts_started')).toBe(40);
  });
  it('leitet returning_users und bounced_sessions ab (≥0 geklemmt)', () => {
    const ds = normalizeReport(report);
    expect(val(ds, '2026-01-01', 'returning_users')).toBe(200); // 800-600
    expect(val(ds, '2026-01-01', 'bounced_sessions')).toBe(350); // 1000-650
    expect(val(ds, '2026-01-02', 'returning_users')).toBe(0); // max(0, 400-500)
    expect(val(ds, '2026-01-02', 'bounced_sessions')).toBe(20); // 500-480
  });
  it('befüllt nur dailyMetrics', () => {
    const ds = normalizeReport(report);
    expect(ds.orders).toHaveLength(0);
    expect(ds.customers).toHaveLength(0);
    expect(ds.adSpend).toHaveLength(0);
    expect(ds.subscribers).toHaveLength(0);
  });
  it('ist robust gegen leeren Report', () => {
    expect(normalizeReport({}).dailyMetrics).toHaveLength(0);
  });
});
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/ga4/normalize.test.ts`
Expected: FAIL — `@/connectors/ga4/connector` nicht gefunden.

- [ ] **Step 4: `normalizeReport` implementieren**

`src/connectors/ga4/connector.ts`:
```ts
import type { CanonicalDataset, DailyMetric } from '@/lib/types';
import type { Ga4Report } from './types';

function ga4Date(yyyymmdd: string): string {
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}

export function normalizeReport(report: Ga4Report): CanonicalDataset {
  const headers = (report.metricHeaders ?? []).map((h) => h.name);
  const dailyMetrics: DailyMetric[] = [];

  for (const row of report.rows ?? []) {
    const date = ga4Date(row.dimensionValues[0].value);
    const num = (name: string): number => {
      const i = headers.indexOf(name);
      return i < 0 ? 0 : Number(row.metricValues[i]?.value ?? 0);
    };
    const sessions = num('sessions');
    const totalUsers = num('totalUsers');
    const derived: Record<string, number> = {
      sessions,
      pageviews: num('screenPageViews'),
      total_users: totalUsers,
      returning_users: Math.max(0, totalUsers - num('newUsers')),
      bounced_sessions: Math.max(0, sessions - num('engagedSessions')),
      add_to_carts: num('addToCarts'),
      checkouts_started: num('checkouts'),
    };
    for (const [metricKey, value] of Object.entries(derived)) {
      dailyMetrics.push({ date, source: 'ga4', channel: 'default', metricKey, value });
    }
  }

  return { dailyMetrics, orders: [], customers: [], adSpend: [], subscribers: [] };
}
```

- [ ] **Step 5: Test ausführen — grün**

Run: `npm test -- tests/connectors/ga4/normalize.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/connectors/ga4/types.ts src/connectors/ga4/connector.ts tests/connectors/ga4/normalize.test.ts
git commit -m "feat: ga4 report normalization to canonical daily_metrics"
```

---

### Task 2: `Ga4Client` (Auth + runReport)

**Files:**
- Create: `src/connectors/ga4/client.ts`
- Modify: `package.json` (Dependency `google-auth-library`)
- Test: `tests/connectors/ga4/client.test.ts`

**Interfaces:**
- Consumes: `Ga4Report` aus `./types`.
- Produces:
  - `const GA4_METRICS` (7 Namen, feste Reihenfolge).
  - `type TokenProvider = () => Promise<string>`.
  - `class Ga4Client` mit Konstruktor `(propertyId: string, getToken: TokenProvider, fetchImpl?: typeof fetch)`, `runReport(days: number): Promise<Ga4Report>`, und statisch `Ga4Client.fromEnv(propertyId): Ga4Client` (verdrahtet `google-auth-library`).

- [ ] **Step 1: Dependency installieren**

```bash
npm install google-auth-library@9
```
Erwartet: `package.json` listet `google-auth-library` unter `dependencies`.

- [ ] **Step 2: Failing test schreiben**

`tests/connectors/ga4/client.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { Ga4Client } from '@/connectors/ga4/client';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('Ga4Client.runReport', () => {
  it('ruft den Property-Report mit Datum-Dimension und 7 Metriken auf', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ rows: [], metricHeaders: [] }));
    const client = new Ga4Client('12345', async () => 'TOK', fetchMock as unknown as typeof fetch);
    await client.runReport(30);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/12345:runReport');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer TOK' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.dimensions).toEqual([{ name: 'date' }]);
    expect(body.metrics.map((m: { name: string }) => m.name)).toEqual([
      'sessions', 'screenPageViews', 'totalUsers', 'newUsers', 'engagedSessions', 'addToCarts', 'checkouts',
    ]);
    expect(body.dateRanges).toEqual([{ startDate: '29daysAgo', endDate: 'today' }]);
  });

  it('wirft bei HTTP-Fehler mit Status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ error: { message: 'nope' } }, 403));
    const client = new Ga4Client('12345', async () => 'TOK', fetchMock as unknown as typeof fetch);
    await expect(client.runReport(7)).rejects.toThrow(/runReport failed: 403/);
  });
});
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/ga4/client.test.ts`
Expected: FAIL — `@/connectors/ga4/client` nicht gefunden.

- [ ] **Step 4: `Ga4Client` implementieren**

`src/connectors/ga4/client.ts`:
```ts
import { GoogleAuth } from 'google-auth-library';
import type { Ga4Report } from './types';

export const GA4_METRICS = [
  'sessions', 'screenPageViews', 'totalUsers', 'newUsers', 'engagedSessions', 'addToCarts', 'checkouts',
] as const;

export type TokenProvider = () => Promise<string>;

export class Ga4Client {
  constructor(
    private readonly propertyId: string,
    private readonly getToken: TokenProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnv(propertyId: string): Ga4Client {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    const getToken: TokenProvider = async () => {
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (!token.token) throw new Error('GA4 auth: no access token returned');
      return token.token;
    };
    return new Ga4Client(propertyId, getToken);
  }

  async runReport(days: number): Promise<Ga4Report> {
    const token = await this.getToken();
    const body = {
      dateRanges: [{ startDate: `${days - 1}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: GA4_METRICS.map((name) => ({ name })),
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 100000,
    };
    const res = await this.fetchImpl(
      `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      throw new Error(`GA4 runReport failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as Ga4Report;
  }
}
```

- [ ] **Step 5: Test ausführen — grün**

Run: `npm test -- tests/connectors/ga4/client.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/connectors/ga4/client.ts tests/connectors/ga4/client.test.ts
git commit -m "feat: ga4 data api client (google-auth-library + runReport)"
```

---

### Task 3: Transaktionaler Write, CLI-Skript & Konfiguration

**Files:**
- Create: `src/connectors/ga4/write.ts`, `scripts/sync-ga4.ts`
- Modify: `package.json` (Script `sync:ga4`), `.env.example` (GA4_*)
- Test: `tests/connectors/ga4/write.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset` aus `@/lib/types`; `pool` aus `@/lib/db`; `Ga4Client` (Task 2), `normalizeReport` (Task 1).
- Produces: `writeGa4Metrics(data: CanonicalDataset): Promise<void>` — Transaktion `DELETE FROM daily_metrics WHERE source='ga4'` + gebündelte Inserts; wirft bei `data.dailyMetrics.length === 0` **ohne** zu löschen.

- [ ] **Step 1: Failing integration test schreiben**

`tests/connectors/ga4/write.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { writeGa4Metrics } from '@/connectors/ga4/write';
import { loadDataset } from '@/kpi/repository';
import { pool } from '@/lib/db';
import type { CanonicalDataset } from '@/lib/types';

const sample: CanonicalDataset = {
  orders: [], customers: [], adSpend: [], subscribers: [],
  dailyMetrics: [
    { date: '2026-05-01', source: 'ga4', channel: 'default', metricKey: 'sessions', value: 111 },
    { date: '2026-05-01', source: 'ga4', channel: 'default', metricKey: 'pageviews', value: 333 },
  ],
};

describe('writeGa4Metrics (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('ersetzt nur ga4-Zeilen, lässt orders und andere Quellen unberührt', async () => {
    const before = await loadDataset();
    const ordersBefore = before.orders.length;
    const nonGa4Before = before.dailyMetrics.filter((m) => m.source !== 'ga4').length;
    await writeGa4Metrics(sample);
    const after = await loadDataset();
    const ga4 = after.dailyMetrics.filter((m) => m.source === 'ga4');
    expect(ga4.map((m) => m.metricKey).sort()).toEqual(['pageviews', 'sessions']);
    expect(after.dailyMetrics.filter((m) => m.source !== 'ga4').length).toBe(nonGa4Before);
    expect(after.orders.length).toBe(ordersBefore);
  });

  it('bricht bei 0 Zeilen ab, ohne ga4-Daten zu löschen', async () => {
    await expect(writeGa4Metrics({ ...sample, dailyMetrics: [] }))
      .rejects.toThrow(/0 metric rows/i);
    const after = await loadDataset();
    expect(after.dailyMetrics.filter((m) => m.source === 'ga4').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/ga4/write.test.ts`
Expected: FAIL — `@/connectors/ga4/write` nicht gefunden.

- [ ] **Step 3: `writeGa4Metrics` implementieren**

`src/connectors/ga4/write.ts`:
```ts
import type { PoolClient } from 'pg';
import { pool } from '@/lib/db';
import type { CanonicalDataset, DailyMetric } from '@/lib/types';

const CHUNK = 1000;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function insertMetrics(client: PoolClient, metrics: DailyMetric[]): Promise<void> {
  for (const part of chunk(metrics, CHUNK)) {
    const values: unknown[] = [];
    const rows = part.map((m, i) => {
      const b = i * 5;
      values.push(m.date, m.source, m.channel, m.metricKey, m.value);
      return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
    });
    await client.query(
      `INSERT INTO daily_metrics(date, source, channel, metric_key, value) VALUES ${rows.join(',')}`,
      values,
    );
  }
}

export async function writeGa4Metrics(data: CanonicalDataset): Promise<void> {
  if (data.dailyMetrics.length === 0) {
    throw new Error('GA4 sync: 0 metric rows — aborting without deleting.');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`DELETE FROM daily_metrics WHERE source = 'ga4'`);
    await insertMetrics(client, data.dailyMetrics);
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

Run: `npm test -- tests/connectors/ga4/write.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 5: CLI-Skript implementieren**

`scripts/sync-ga4.ts`:
```ts
import { Ga4Client } from '../src/connectors/ga4/client';
import { normalizeReport } from '../src/connectors/ga4/connector';
import { writeGa4Metrics } from '../src/connectors/ga4/write';
import { pool } from '../src/lib/db';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Missing GA4_PROPERTY_ID / GOOGLE_APPLICATION_CREDENTIALS in environment.');
  }
  const days = parseDays(process.argv);

  const client = Ga4Client.fromEnv(propertyId);
  console.log(`Fetching GA4 report (last ${days} days)…`);
  const report = await client.runReport(days);
  console.log(`Fetched ${report.rows?.length ?? 0} day rows.`);

  const data = normalizeReport(report);
  console.log(`Normalized → ${data.dailyMetrics.length} daily_metrics rows (source=ga4).`);

  await writeGa4Metrics(data);
  console.log('Wrote ga4 daily_metrics to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 6: `package.json`-Script ergänzen**

In `package.json` unter `"scripts"` ergänzen (nach `"sync:shopware"`):
```json
    "sync:ga4": "tsx scripts/sync-ga4.ts",
```

- [ ] **Step 7: `.env.example` ergänzen**

An `.env.example` anhängen:
```
GA4_PROPERTY_ID=123456789
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/service-account.json
```

- [ ] **Step 8: Volle Suite ausführen — grün**

Run: `npm test`
Expected: PASS (alle bisherigen Tests + 9 neue GA4-Tests; Integrationstests benötigen die laufende DB).

- [ ] **Step 9: Commit**

```bash
git add src/connectors/ga4/write.ts scripts/sync-ga4.ts tests/connectors/ga4/write.test.ts package.json .env.example
git commit -m "feat: ga4 sync CLI with transactional ga4-source replace"
```

- [ ] **Step 10: Live-Verifikation (manuell, mit Service-Account-Key)**

```bash
# .env mit echten Werten füllen (NICHT committen): GA4_PROPERTY_ID, GOOGLE_APPLICATION_CREDENTIALS (Pfad zur Key-Datei); DB läuft:
docker compose up -d db
npm run migrate          # falls nötig
set -a; source .env; set +a
npm run sync:ga4         # echter Sync gegen die Property
```
Erwartet: „Fetched N day rows / Normalized → 7×N rows". Danach:
```bash
curl -s "http://localhost:3001/api/kpis?days=30" | node -e 'const b=require("/dev/stdin");for(const p of b.phases){if(["think","do"].includes(p.phase))console.log(p.title,p.kpis.map(k=>k.key+"="+(k.available?(typeof k.value==="number"?k.value.toFixed(4):k.value):"N/A")).join(", "))}'
```
Erwartet: THINK (Sessions/Bounce/ATC/wiederkehrend) zeigt echte GA4-Zahlen; DO Conversion Rate = echte Orders / echte Sessions; Warenkorbabbruchrate aus echten Checkouts. **Stichprobe:** Sessions im Dashboard ≈ GA4-Oberfläche für denselben Zeitraum (kleine Abweichungen durch Sampling/Thresholding sind normal). Häufiger Fehlerfall: `403` = Service-Account nicht als Betrachter auf der Property → in GA4 Admin als Betrachter hinzufügen, erneut syncen.

---

## Definition of Done

- `npm test` grün inkl. 9 neuer GA4-Tests (normalize 5, client 2, write 2).
- `npm run sync:ga4 [--days N]` lädt echte GA4-Tagesmetriken in `daily_metrics` (`source='ga4'`), lässt `orders`/`customers` und Nicht-`ga4`-Zeilen unberührt, ist wiederholbar (Replace).
- THINK-KPIs und echte DO-Quoten (Conversion Rate, Warenkorbabbruch) im Dashboard zeigen GA4-basierte Werte; Sessions-Stichprobe plausibel.
- Keine Secrets im Repo.

## Verifizierte Spec-Abdeckung (Self-Review)

- Auth via google-auth-library (Scope analytics.readonly), runReport per fetch: Task 2 ✓
- 7 GA4-Metriken, Dimension date, dateRange `${days-1}daysAgo`..today, Default 180: Task 2 (+ CLI parseDays Task 3) ✓
- Mapping inkl. Ableitungen returning/bounced (≥0) + Datums-/Number-Konvertierung: Task 1 ✓
- Nur `daily_metrics` source=ga4; selektiver Replace; 0-Zeilen-Abbruch ohne DELETE: Task 1 (leere übrige Arrays) + Task 3 ✓
- On-Demand-CLI `sync:ga4 --days`, kein Scheduler, kein Schema-Change: Task 3 ✓
- Secrets nur in `.env` (`.env.example` als Vorlage): Task 3 ✓
- Live-Verifikation inkl. Sessions-Stichprobe + 403-Hinweis: Task 3 Step 10 ✓
