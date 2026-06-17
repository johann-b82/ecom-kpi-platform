# KPI-Plattform V1 (Fundament + Seed-Daten) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine lauffähige KPI-Plattform, die E-Commerce-Kennzahlen entlang SEE–THINK–DO–CARE aus einem kanonischen Datenmodell berechnet und in einem Dashboard (Übersicht + Phasen-Drilldown) anzeigt — befüllt mit deterministischen Seed-Daten.

**Architecture:** Connectoren (in V1 nur der Seed-Generator) schreiben in ein kanonisches Postgres-Schema. Eine KPI-Engine aus reinen Funktionen liest einen `CanonicalDataset` und berechnet je Phase die Kennzahlen samt Delta zur Vorperiode. Eine Next.js-API liefert die aggregierten KPIs; das Dashboard (Tremor) rendert sie. Seed- und Live-Daten teilen dasselbe Schema und dieselbe Pipeline.

**Tech Stack:** Next.js 14 (App Router) · TypeScript · Postgres (`pg`) · Tremor (`@tremor/react`) + Tailwind · Vitest · Docker / docker-compose · `tsx` für Skripte.

## Global Constraints

- Stack fix: **Next.js + TypeScript + Postgres + Tremor**, ein Repo, Lauf via **docker-compose** (App + Postgres).
- KPI-Auswahl und Formeln **exakt wie in der Spec** (`docs/superpowers/specs/2026-06-17-kpi-plattform-design.md`) — keine zusätzlichen KPIs.
- KPIs ohne Quelle zeigen **`available: false` → „N/A — Quelle nicht verbunden"**; niemals erfundene Werte.
- **V1-Scope:** eine Funnel-Übersicht + Phasen-Detailansicht. **Kein** Login/Multi-User, **kein** Dashboard-Builder, **kein** Alerting.
- **TDD** verpflichtend für KPI-Engine und Seed-Generator: Test zuerst, dann Implementierung.
- Seed-Daten **deterministisch** (geseedeter PRNG), damit Tests stabile Werte haben.
- Kanonische Identifier (verbindlich für alle Tasks):
  - `Source = 'shopware'|'ga4'|'google_ads'|'meta_ads'|'tiktok_ads'|'klaviyo'|'seed'`
  - `daily_metrics.metric_key ∈ {sessions, pageviews, bounced_sessions, returning_users, total_users, add_to_carts, checkouts_started, video_views}`
  - Ads-Metriken (impressions/clicks/spend/conversions/conv_value) liegen in `ad_spend`, **nicht** in `daily_metrics`.
  - `Phase = 'see'|'think'|'do'|'care'`, `KpiUnit = 'number'|'currency'|'percent'|'ratio'` (percent-Werte sind Brüche 0..1).

---

## File Structure

```
ecom-platform/
  package.json, tsconfig.json, next.config.mjs, vitest.config.ts
  tailwind.config.ts, postcss.config.mjs, .env.example
  Dockerfile, docker-compose.yml, .dockerignore
  db/schema.sql
  scripts/migrate.ts            # wendet schema.sql an
  scripts/seed.ts               # generiert + schreibt Seed-Daten
  src/lib/types.ts              # kanonische Typen + DateRange + CanonicalDataset
  src/lib/dates.ts              # addDays, daysBetween
  src/lib/db.ts                 # pg Pool
  src/kpi/types.ts              # Kpi, PhaseKpis, Phase, KpiUnit
  src/kpi/helpers.ts            # inRange, metricSum, metricPresent, ratio, kpi()
  src/kpi/see.ts, think.ts, do.ts, care.ts
  src/kpi/index.ts              # computeKpis, withDelta, previousRange, PHASES
  src/kpi/repository.ts         # loadDataset, loadDailySeries
  src/connectors/connector.ts   # Connector-Interface
  src/connectors/seed/generator.ts  # deterministischer Seed-Generator
  src/app/layout.tsx, globals.css
  src/app/page.tsx              # Funnel-Übersicht
  src/app/phase/[phase]/page.tsx# Drilldown
  src/app/api/kpis/route.ts     # liefert PhaseKpis[]
  src/components/KpiCard.tsx, PhaseColumn.tsx, Filters.tsx, NaBadge.tsx
  tests/                        # spiegelt src/ (vitest)
```

---

### Task 1: Projekt-Scaffold, Tooling & kanonische Typen

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `vitest.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `.env.example`, `.dockerignore`
- Create: `src/lib/types.ts`, `src/lib/dates.ts`
- Test: `tests/lib/dates.test.ts`

**Interfaces:**
- Produces: kanonische Typen `DateRange`, `Source`, `AdPlatform`, `DailyMetric`, `Order`, `Customer`, `AdSpend`, `Subscriber`, `CanonicalDataset`; Datums-Helfer `addDays(date,days): string`, `daysBetween(a,b): number`.

- [ ] **Step 1: package.json anlegen**

```json
{
  "name": "ecom-kpi-platform",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "test": "vitest run",
    "migrate": "tsx scripts/migrate.ts",
    "seed": "tsx scripts/seed.ts"
  },
  "dependencies": {
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1",
    "pg": "8.12.0",
    "@tremor/react": "3.18.0"
  },
  "devDependencies": {
    "typescript": "5.5.4",
    "@types/node": "20.14.0",
    "@types/react": "18.3.3",
    "@types/pg": "8.11.6",
    "tsx": "4.16.2",
    "vitest": "2.0.5",
    "@testing-library/react": "16.0.0",
    "jsdom": "24.1.1",
    "tailwindcss": "3.4.7",
    "postcss": "8.4.40",
    "autoprefixer": "10.4.19"
  }
}
```

- [ ] **Step 2: Konfigdateien anlegen**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2021",
    "lib": ["dom", "dom.iterable", "ES2021"],
    "module": "esnext",
    "moduleResolution": "bundler",
    "jsx": "preserve",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "resolveJsonModule": true,
    "incremental": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] },
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

`next.config.mjs`:
```js
/** @type {import('next').NextConfig} */
const nextConfig = {};
export default nextConfig;
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { environment: 'node', include: ['tests/**/*.test.{ts,tsx}'] },
});
```

`tailwind.config.ts`:
```ts
import type { Config } from 'tailwindcss';

export default {
  content: [
    './src/**/*.{ts,tsx}',
    './node_modules/@tremor/**/*.{js,ts,jsx,tsx}',
  ],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

`postcss.config.mjs`:
```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

`.env.example`:
```
DATABASE_URL=postgres://kpi:kpi@localhost:5432/kpi
```

`.dockerignore`:
```
node_modules
.next
.git
```

- [ ] **Step 3: Datums-Helfer testen (failing test)**

`tests/lib/dates.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { addDays, daysBetween } from '@/lib/dates';

describe('dates', () => {
  it('addDays addiert und subtrahiert über Monatsgrenzen', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
  it('daysBetween zählt inklusive Differenz in Tagen', () => {
    expect(daysBetween('2026-01-01', '2026-01-08')).toBe(7);
  });
});
```

- [ ] **Step 4: Test ausführen — muss fehlschlagen**

Run: `npm install && npm test -- tests/lib/dates.test.ts`
Expected: FAIL — Modul `@/lib/dates` nicht gefunden.

- [ ] **Step 5: Datums-Helfer implementieren**

`src/lib/dates.ts`:
```ts
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  return Math.round(
    (Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86_400_000,
  );
}
```

- [ ] **Step 6: Kanonische Typen anlegen**

`src/lib/types.ts`:
```ts
export interface DateRange { start: string; end: string; } // ISO 'YYYY-MM-DD', inklusiv

export type Source =
  | 'shopware' | 'ga4' | 'google_ads' | 'meta_ads' | 'tiktok_ads' | 'klaviyo' | 'seed';
export type AdPlatform = 'google_ads' | 'meta_ads' | 'tiktok_ads';

export interface DailyMetric {
  date: string; source: Source; channel: string; metricKey: string; value: number;
}
export interface Order {
  orderId: string; customerId: string; date: string; revenue: number; isFirstOrder: boolean;
}
export interface Customer {
  customerId: string; firstOrderDate: string; lastOrderDate: string;
  ordersCount: number; totalRevenue: number;
}
export interface AdSpend {
  date: string; platform: AdPlatform; spend: number; impressions: number;
  clicks: number; conversions: number; convValue: number;
}
export interface Subscriber {
  date: string; source: Source; signups: number; unsubscribes: number; npsScore: number | null;
}

export interface CanonicalDataset {
  dailyMetrics: DailyMetric[];
  orders: Order[];
  customers: Customer[];
  adSpend: AdSpend[];
  subscribers: Subscriber[];
}
```

- [ ] **Step 7: Tests ausführen — müssen grün sein**

Run: `npm test -- tests/lib/dates.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 8: Commit**

```bash
git add package.json tsconfig.json next.config.mjs vitest.config.ts tailwind.config.ts postcss.config.mjs .env.example .dockerignore src/lib/dates.ts src/lib/types.ts tests/lib/dates.test.ts
git commit -m "feat: project scaffold, tooling and canonical types"
```

---

### Task 2: Postgres-Schema, DB-Verbindung & Migration (Docker)

**Files:**
- Create: `db/schema.sql`, `src/lib/db.ts`, `scripts/migrate.ts`, `Dockerfile`, `docker-compose.yml`
- Test: `tests/lib/schema.test.ts`

**Interfaces:**
- Consumes: nichts.
- Produces: `pool` (pg `Pool`) aus `src/lib/db.ts`; angewendetes Schema mit Tabellen `daily_metrics`, `orders`, `customers`, `ad_spend`, `subscribers`.

- [ ] **Step 1: Schema schreiben**

`db/schema.sql`:
```sql
CREATE TABLE IF NOT EXISTS daily_metrics (
  date        DATE        NOT NULL,
  source      TEXT        NOT NULL,
  channel     TEXT        NOT NULL DEFAULT 'default',
  metric_key  TEXT        NOT NULL,
  value       DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (date, source, channel, metric_key)
);

CREATE TABLE IF NOT EXISTS customers (
  customer_id      TEXT PRIMARY KEY,
  first_order_date DATE NOT NULL,
  last_order_date  DATE NOT NULL,
  orders_count     INTEGER NOT NULL,
  total_revenue    DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  order_id      TEXT PRIMARY KEY,
  customer_id   TEXT NOT NULL,
  date          DATE NOT NULL,
  revenue       DOUBLE PRECISION NOT NULL,
  is_first_order BOOLEAN NOT NULL
);
CREATE INDEX IF NOT EXISTS orders_date_idx ON orders (date);

CREATE TABLE IF NOT EXISTS ad_spend (
  date        DATE NOT NULL,
  platform    TEXT NOT NULL,
  spend       DOUBLE PRECISION NOT NULL,
  impressions BIGINT NOT NULL,
  clicks      BIGINT NOT NULL,
  conversions BIGINT NOT NULL,
  conv_value  DOUBLE PRECISION NOT NULL,
  PRIMARY KEY (date, platform)
);

CREATE TABLE IF NOT EXISTS subscribers (
  date         DATE NOT NULL,
  source       TEXT NOT NULL,
  signups      INTEGER NOT NULL,
  unsubscribes INTEGER NOT NULL,
  nps_score    DOUBLE PRECISION,
  PRIMARY KEY (date, source)
);
```

- [ ] **Step 2: DB-Pool implementieren**

`src/lib/db.ts`:
```ts
import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://kpi:kpi@localhost:5432/kpi';

export const pool = new Pool({ connectionString });
```

- [ ] **Step 3: Migrationsskript implementieren**

`scripts/migrate.ts`:
```ts
import { readFileSync } from 'node:fs';
import { pool } from '../src/lib/db';

async function main() {
  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('Schema applied.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 4: Docker-Setup schreiben**

`Dockerfile`:
```dockerfile
FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

`docker-compose.yml`:
```yaml
services:
  db:
    image: postgres:16
    environment:
      POSTGRES_USER: kpi
      POSTGRES_PASSWORD: kpi
      POSTGRES_DB: kpi
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U kpi"]
      interval: 3s
      timeout: 3s
      retries: 10
  app:
    build: .
    environment:
      DATABASE_URL: postgres://kpi:kpi@db:5432/kpi
    ports: ["3000:3000"]
    depends_on:
      db:
        condition: service_healthy
    volumes:
      - .:/app
      - /app/node_modules
```

- [ ] **Step 5: Integrations-Smoke-Test schreiben (failing)**

`tests/lib/schema.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';

describe('schema (integration, benötigt laufende DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('alle kanonischen Tabellen existieren und sind abfragbar', async () => {
    for (const table of ['daily_metrics', 'orders', 'customers', 'ad_spend', 'subscribers']) {
      const res = await pool.query(`SELECT count(*)::int AS c FROM ${table}`);
      expect(res.rows[0].c).toBeGreaterThanOrEqual(0);
    }
  });
});
```

- [ ] **Step 6: DB starten, migrieren, Test ausführen**

Run:
```bash
docker compose up -d db
npm run migrate
npm test -- tests/lib/schema.test.ts
```
Expected: zuerst (ohne Migration) FAIL „relation does not exist"; nach `npm run migrate` PASS.

- [ ] **Step 7: Commit**

```bash
git add db/schema.sql src/lib/db.ts scripts/migrate.ts Dockerfile docker-compose.yml tests/lib/schema.test.ts
git commit -m "feat: canonical postgres schema, db pool, migration and docker setup"
```

---

### Task 3: KPI-Typen & Helfer

**Files:**
- Create: `src/kpi/types.ts`, `src/kpi/helpers.ts`
- Test: `tests/kpi/helpers.test.ts`

**Interfaces:**
- Consumes: Typen aus `@/lib/types`.
- Produces:
  - Typen `Phase`, `KpiUnit`, `Kpi`, `PhaseKpis`.
  - `inRange(date, range): boolean`
  - `metricSum(metrics, key, range): number`
  - `metricPresent(metrics, key, range): boolean`
  - `ratio(n, d): number | null`  (null bei Nenner 0)
  - `kpi(key, label, phase, value, unit): Kpi`  (`available=false`, wenn value null/NaN/∞)

- [ ] **Step 1: KPI-Typen anlegen**

`src/kpi/types.ts`:
```ts
export type Phase = 'see' | 'think' | 'do' | 'care';
export type KpiUnit = 'number' | 'currency' | 'percent' | 'ratio';

export interface Kpi {
  key: string;
  label: string;
  phase: Phase;
  value: number | null;   // null => nicht verfügbar
  unit: KpiUnit;
  available: boolean;
  deltaPct: number | null; // Veränderung vs. Vorperiode in Prozentpunkten der Differenz
}

export interface PhaseKpis {
  phase: Phase;
  title: string;     // 'SEE'
  subtitle: string;  // 'Awareness'
  kpis: Kpi[];
}
```

- [ ] **Step 2: Helfer-Tests schreiben (failing)**

`tests/kpi/helpers.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { inRange, metricSum, metricPresent, ratio, kpi } from '@/kpi/helpers';
import type { DailyMetric } from '@/lib/types';

const range = { start: '2026-01-01', end: '2026-01-07' };
const m = (date: string, metricKey: string, value: number): DailyMetric =>
  ({ date, source: 'ga4', channel: 'default', metricKey, value });

describe('kpi helpers', () => {
  it('inRange ist inklusiv an beiden Enden', () => {
    expect(inRange('2026-01-01', range)).toBe(true);
    expect(inRange('2026-01-07', range)).toBe(true);
    expect(inRange('2025-12-31', range)).toBe(false);
  });
  it('metricSum summiert nur passenden key im Zeitraum', () => {
    const data = [m('2026-01-02', 'sessions', 10), m('2026-01-03', 'sessions', 5), m('2026-01-09', 'sessions', 99)];
    expect(metricSum(data, 'sessions', range)).toBe(15);
  });
  it('metricPresent erkennt Vorhandensein im Zeitraum', () => {
    expect(metricPresent([m('2026-01-02', 'sessions', 0)], 'sessions', range)).toBe(true);
    expect(metricPresent([], 'sessions', range)).toBe(false);
  });
  it('ratio gibt null bei Nenner 0', () => {
    expect(ratio(4, 2)).toBe(2);
    expect(ratio(4, 0)).toBeNull();
  });
  it('kpi markiert null-Werte als nicht verfügbar', () => {
    expect(kpi('x', 'X', 'see', null, 'number').available).toBe(false);
    expect(kpi('x', 'X', 'see', 5, 'number').available).toBe(true);
  });
});
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/kpi/helpers.test.ts`
Expected: FAIL — `@/kpi/helpers` nicht gefunden.

- [ ] **Step 4: Helfer implementieren**

`src/kpi/helpers.ts`:
```ts
import type { DailyMetric, DateRange } from '@/lib/types';
import type { Kpi, KpiUnit, Phase } from './types';

export function inRange(date: string, range: DateRange): boolean {
  return date >= range.start && date <= range.end;
}

export function metricSum(metrics: DailyMetric[], key: string, range: DateRange): number {
  return metrics
    .filter((m) => m.metricKey === key && inRange(m.date, range))
    .reduce((acc, m) => acc + m.value, 0);
}

export function metricPresent(metrics: DailyMetric[], key: string, range: DateRange): boolean {
  return metrics.some((m) => m.metricKey === key && inRange(m.date, range));
}

export function ratio(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}

export function kpi(
  key: string, label: string, phase: Phase, value: number | null, unit: KpiUnit,
): Kpi {
  const available = value !== null && Number.isFinite(value);
  return { key, label, phase, value: available ? value : null, unit, available, deltaPct: null };
}
```

- [ ] **Step 5: Tests ausführen — grün**

Run: `npm test -- tests/kpi/helpers.test.ts`
Expected: PASS (5 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/kpi/types.ts src/kpi/helpers.ts tests/kpi/helpers.test.ts
git commit -m "feat: kpi types and computation helpers"
```

---

### Task 4: SEE- & THINK-KPIs

**Files:**
- Create: `src/kpi/see.ts`, `src/kpi/think.ts`
- Test: `tests/kpi/see.test.ts`, `tests/kpi/think.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset`, `DateRange`, Helfer aus Task 3.
- Produces: `seeKpis(data, range): Kpi[]`, `thinkKpis(data, range): Kpi[]`.

- [ ] **Step 1: SEE-Test schreiben (failing)**

`tests/kpi/see.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { seeKpis } from '@/kpi/see';
import type { CanonicalDataset } from '@/lib/types';

const range = { start: '2026-01-01', end: '2026-01-02' };
const empty: CanonicalDataset = { dailyMetrics: [], orders: [], customers: [], adSpend: [], subscribers: [] };

describe('seeKpis', () => {
  it('berechnet CPM und Reichweite aus ad_spend', () => {
    const data: CanonicalDataset = {
      ...empty,
      adSpend: [
        { date: '2026-01-01', platform: 'meta_ads', spend: 100, impressions: 50_000, clicks: 0, conversions: 0, convValue: 0 },
        { date: '2026-01-02', platform: 'google_ads', spend: 100, impressions: 50_000, clicks: 0, conversions: 0, convValue: 0 },
      ],
      dailyMetrics: [
        { date: '2026-01-01', source: 'ga4', channel: 'default', metricKey: 'sessions', value: 800 },
        { date: '2026-01-01', source: 'meta_ads', channel: 'default', metricKey: 'video_views', value: 1200 },
      ],
    };
    const kpis = seeKpis(data, range);
    const by = (k: string) => kpis.find((x) => x.key === k)!;
    expect(by('impressions').value).toBe(100_000);
    expect(by('cpm').value).toBeCloseTo(2.0); // 200 / 100000 * 1000
    expect(by('traffic').value).toBe(800);
    expect(by('video_views').value).toBe(1200);
  });
  it('markiert KPIs ohne Quelle als nicht verfügbar', () => {
    const kpis = seeKpis(empty, range);
    expect(kpis.find((x) => x.key === 'ad_recall')!.available).toBe(false);
    expect(kpis.find((x) => x.key === 'impressions')!.available).toBe(false);
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/kpi/see.test.ts`
Expected: FAIL — `@/kpi/see` nicht gefunden.

- [ ] **Step 3: SEE implementieren**

`src/kpi/see.ts`:
```ts
import type { CanonicalDataset, DateRange } from '@/lib/types';
import type { Kpi } from './types';
import { inRange, metricSum, metricPresent, ratio, kpi } from './helpers';

export function seeKpis(data: CanonicalDataset, range: DateRange): Kpi[] {
  const ads = data.adSpend.filter((a) => inRange(a.date, range));
  const hasAds = ads.length > 0;
  const impressions = ads.reduce((s, a) => s + a.impressions, 0);
  const spend = ads.reduce((s, a) => s + a.spend, 0);
  const cpm = ratio(spend, impressions);

  return [
    kpi('impressions', 'Impressions / Reichweite', 'see', hasAds ? impressions : null, 'number'),
    kpi('video_views', 'Video Views', 'see',
      metricPresent(data.dailyMetrics, 'video_views', range) ? metricSum(data.dailyMetrics, 'video_views', range) : null, 'number'),
    kpi('cpm', 'CPM', 'see', cpm === null ? null : cpm * 1000, 'currency'),
    kpi('traffic', 'Website-Traffic (gesamt)', 'see',
      metricPresent(data.dailyMetrics, 'sessions', range) ? metricSum(data.dailyMetrics, 'sessions', range) : null, 'number'),
    kpi('ad_recall', 'Ad Recall / Brand Awareness', 'see', null, 'percent'), // keine Quelle in V1
  ];
}
```

- [ ] **Step 4: SEE-Test grün**

Run: `npm test -- tests/kpi/see.test.ts`
Expected: PASS.

- [ ] **Step 5: THINK-Test schreiben (failing)**

`tests/kpi/think.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { thinkKpis } from '@/kpi/think';
import type { CanonicalDataset, DailyMetric } from '@/lib/types';

const range = { start: '2026-01-01', end: '2026-01-01' };
const m = (metricKey: string, value: number): DailyMetric =>
  ({ date: '2026-01-01', source: 'ga4', channel: 'default', metricKey, value });

describe('thinkKpis', () => {
  it('berechnet Quoten aus GA4-Metriken und Anmeldungen', () => {
    const data: CanonicalDataset = {
      dailyMetrics: [m('sessions', 1000), m('pageviews', 3000), m('bounced_sessions', 400),
        m('returning_users', 250), m('total_users', 1000), m('add_to_carts', 120)],
      orders: [], customers: [], adSpend: [],
      subscribers: [{ date: '2026-01-01', source: 'klaviyo', signups: 42, unsubscribes: 3, npsScore: null }],
    };
    const by = (k: string) => thinkKpis(data, range).find((x) => x.key === k)!;
    expect(by('sessions').value).toBe(1000);
    expect(by('pages_per_session').value).toBeCloseTo(3.0);
    expect(by('bounce_rate').value).toBeCloseTo(0.4);
    expect(by('returning_visitors').value).toBeCloseTo(0.25);
    expect(by('atc_rate').value).toBeCloseTo(0.12);
    expect(by('newsletter_signups').value).toBe(42);
  });
});
```

- [ ] **Step 6: THINK implementieren**

`src/kpi/think.ts`:
```ts
import type { CanonicalDataset, DateRange } from '@/lib/types';
import type { Kpi } from './types';
import { inRange, metricSum, metricPresent, ratio, kpi } from './helpers';

export function thinkKpis(data: CanonicalDataset, range: DateRange): Kpi[] {
  const dm = data.dailyMetrics;
  const sessions = metricSum(dm, 'sessions', range);
  const subs = data.subscribers.filter((s) => inRange(s.date, range));
  const signups = subs.reduce((s, r) => s + r.signups, 0);

  return [
    kpi('sessions', 'Sessions', 'think',
      metricPresent(dm, 'sessions', range) ? sessions : null, 'number'),
    kpi('pages_per_session', 'Seiten / Sitzung', 'think',
      ratio(metricSum(dm, 'pageviews', range), sessions), 'number'),
    kpi('bounce_rate', 'Bounce Rate', 'think',
      ratio(metricSum(dm, 'bounced_sessions', range), sessions), 'percent'),
    kpi('returning_visitors', 'Wiederkehrende Besucher', 'think',
      ratio(metricSum(dm, 'returning_users', range), metricSum(dm, 'total_users', range)), 'percent'),
    kpi('atc_rate', 'Add-to-Cart-Rate', 'think',
      ratio(metricSum(dm, 'add_to_carts', range), sessions), 'percent'),
    kpi('newsletter_signups', 'Newsletter-Anmeldungen', 'think',
      subs.length > 0 ? signups : null, 'number'),
  ];
}
```

- [ ] **Step 7: Beide Tests grün**

Run: `npm test -- tests/kpi/see.test.ts tests/kpi/think.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/kpi/see.ts src/kpi/think.ts tests/kpi/see.test.ts tests/kpi/think.test.ts
git commit -m "feat: SEE and THINK phase kpis"
```

---

### Task 5: DO-KPIs

**Files:**
- Create: `src/kpi/do.ts`
- Test: `tests/kpi/do.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset`, `DateRange`, Helfer.
- Produces: `doKpis(data, range): Kpi[]`.

- [ ] **Step 1: Test schreiben (failing)**

`tests/kpi/do.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { doKpis } from '@/kpi/do';
import type { CanonicalDataset } from '@/lib/types';

const range = { start: '2026-01-01', end: '2026-01-01' };

describe('doKpis', () => {
  it('berechnet Conversion, AOV, Umsatz, ROAS, CAC, Abbruchrate', () => {
    const data: CanonicalDataset = {
      dailyMetrics: [
        { date: '2026-01-01', source: 'ga4', channel: 'default', metricKey: 'sessions', value: 1000 },
        { date: '2026-01-01', source: 'ga4', channel: 'default', metricKey: 'checkouts_started', value: 50 },
      ],
      orders: [
        { orderId: 'o1', customerId: 'c1', date: '2026-01-01', revenue: 100, isFirstOrder: true },
        { orderId: 'o2', customerId: 'c2', date: '2026-01-01', revenue: 300, isFirstOrder: true },
      ],
      customers: [],
      adSpend: [{ date: '2026-01-01', platform: 'google_ads', spend: 200, impressions: 0, clicks: 0, conversions: 0, convValue: 800 }],
      subscribers: [],
    };
    const by = (k: string) => doKpis(data, range).find((x) => x.key === k)!;
    expect(by('conversion_rate').value).toBeCloseTo(0.002); // 2 / 1000
    expect(by('aov').value).toBeCloseTo(200);               // 400 / 2
    expect(by('revenue').value).toBe(400);
    expect(by('roas').value).toBeCloseTo(4);                // 800 / 200
    expect(by('cac').value).toBeCloseTo(100);               // 200 / 2 Neukunden
    expect(by('cart_abandonment').value).toBeCloseTo(0.96); // 1 - 2/50
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/kpi/do.test.ts`
Expected: FAIL — `@/kpi/do` nicht gefunden.

- [ ] **Step 3: DO implementieren**

`src/kpi/do.ts`:
```ts
import type { CanonicalDataset, DateRange } from '@/lib/types';
import type { Kpi } from './types';
import { inRange, metricSum, ratio, kpi } from './helpers';

export function doKpis(data: CanonicalDataset, range: DateRange): Kpi[] {
  const orders = data.orders.filter((o) => inRange(o.date, range));
  const orderCount = orders.length;
  const revenue = orders.reduce((s, o) => s + o.revenue, 0);
  const newCustomers = orders.filter((o) => o.isFirstOrder).length;

  const sessions = metricSum(data.dailyMetrics, 'sessions', range);
  const checkouts = metricSum(data.dailyMetrics, 'checkouts_started', range);

  const ads = data.adSpend.filter((a) => inRange(a.date, range));
  const hasAds = ads.length > 0;
  const spend = ads.reduce((s, a) => s + a.spend, 0);
  const convValue = ads.reduce((s, a) => s + a.convValue, 0);

  return [
    kpi('conversion_rate', 'Conversion Rate', 'do', ratio(orderCount, sessions), 'percent'),
    kpi('aov', 'Warenkorbwert (AOV)', 'do', ratio(revenue, orderCount), 'currency'),
    kpi('revenue', 'Umsatz / Revenue', 'do', orderCount > 0 ? revenue : null, 'currency'),
    kpi('roas', 'ROAS', 'do', hasAds ? ratio(convValue, spend) : null, 'ratio'),
    kpi('cac', 'CAC', 'do', hasAds ? ratio(spend, newCustomers) : null, 'currency'),
    kpi('cart_abandonment', 'Warenkorbabbruchrate', 'do',
      checkouts > 0 ? 1 - orderCount / checkouts : null, 'percent'),
  ];
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- tests/kpi/do.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/kpi/do.ts tests/kpi/do.test.ts
git commit -m "feat: DO phase kpis"
```

---

### Task 6: CARE-KPIs

**Files:**
- Create: `src/kpi/care.ts`
- Test: `tests/kpi/care.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset`, `DateRange`, Helfer, `daysBetween` aus `@/lib/dates`.
- Produces: `careKpis(data, range): Kpi[]`. Nutzt **Lifetime-Daten** (volle `orders`/`customers`), nicht nur den Zeitraum: „aktiv" = Kunde mit Bestellung im Zeitraum.

- [ ] **Step 1: Test schreiben (failing)**

`tests/kpi/care.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { careKpis } from '@/kpi/care';
import type { CanonicalDataset } from '@/lib/types';

const range = { start: '2026-02-01', end: '2026-02-28' };

// c1: Bestandskunde (vor Zeitraum + im Zeitraum) → retained, repeat
// c2: Neukunde nur im Zeitraum
// c3: war vor Zeitraum aktiv, im Zeitraum NICHT → churned
const data: CanonicalDataset = {
  dailyMetrics: [], adSpend: [],
  subscribers: [
    { date: '2026-02-10', source: 'klaviyo', signups: 0, unsubscribes: 0, npsScore: 40 },
    { date: '2026-02-20', source: 'klaviyo', signups: 0, unsubscribes: 0, npsScore: 60 },
  ],
  customers: [
    { customerId: 'c1', firstOrderDate: '2026-01-01', lastOrderDate: '2026-02-15', ordersCount: 3, totalRevenue: 300 },
    { customerId: 'c2', firstOrderDate: '2026-02-05', lastOrderDate: '2026-02-05', ordersCount: 1, totalRevenue: 50 },
    { customerId: 'c3', firstOrderDate: '2026-01-02', lastOrderDate: '2026-01-20', ordersCount: 1, totalRevenue: 80 },
  ],
  orders: [
    { orderId: 'o1', customerId: 'c1', date: '2026-01-01', revenue: 100, isFirstOrder: true },
    { orderId: 'o2', customerId: 'c1', date: '2026-02-15', revenue: 200, isFirstOrder: false },
    { orderId: 'o3', customerId: 'c2', date: '2026-02-05', revenue: 50, isFirstOrder: true },
    { orderId: 'o4', customerId: 'c3', date: '2026-01-20', revenue: 80, isFirstOrder: true },
  ],
};

describe('careKpis', () => {
  const by = (k: string) => careKpis(data, range).find((x) => x.key === k)!;
  it('Repeat Rate über aktive Kunden', () => {
    // aktiv im Zeitraum: c1, c2 → repeat (>=2 Bestellungen): nur c1 → 0.5
    expect(by('repeat_rate').value).toBeCloseTo(0.5);
  });
  it('CLV = Ø Lifetime-Umsatz aktiver Kunden', () => {
    expect(by('clv').value).toBeCloseTo(175); // (300 + 50) / 2
  });
  it('Retention/Churn gegen Vorperioden-Kunden', () => {
    // vor Zeitraum aktiv: c1, c3 → im Zeitraum wieder: nur c1 → Retention 0.5, Churn 0.5
    expect(by('retention').value).toBeCloseTo(0.5);
    expect(by('churn').value).toBeCloseTo(0.5);
  });
  it('NPS = Ø der vorhandenen Scores', () => {
    expect(by('nps').value).toBeCloseTo(50); // (40 + 60) / 2
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/kpi/care.test.ts`
Expected: FAIL — `@/kpi/care` nicht gefunden.

- [ ] **Step 3: CARE implementieren**

`src/kpi/care.ts`:
```ts
import type { CanonicalDataset, DateRange } from '@/lib/types';
import type { Kpi } from './types';
import { inRange, ratio, kpi } from './helpers';
import { daysBetween } from '@/lib/dates';

export function careKpis(data: CanonicalDataset, range: DateRange): Kpi[] {
  const { orders, customers, subscribers } = data;

  const activeIds = new Set(orders.filter((o) => inRange(o.date, range)).map((o) => o.customerId));
  const active = customers.filter((c) => activeIds.has(c.customerId));
  const hasActive = active.length > 0;

  const repeatRate = hasActive
    ? active.filter((c) => c.ordersCount >= 2).length / active.length : null;

  const clv = hasActive
    ? active.reduce((s, c) => s + c.totalRevenue, 0) / active.length : null;

  const multi = active.filter((c) => c.ordersCount >= 2);
  const interval = multi.length
    ? multi.reduce((s, c) => s + daysBetween(c.firstOrderDate, c.lastOrderDate) / (c.ordersCount - 1), 0) / multi.length
    : null;

  const priorIds = new Set(orders.filter((o) => o.date < range.start).map((o) => o.customerId));
  const retained = [...priorIds].filter((id) => activeIds.has(id)).length;
  const retention = priorIds.size ? retained / priorIds.size : null;
  const churn = retention === null ? null : 1 - retention;

  const npsRows = subscribers.filter((s) => inRange(s.date, range) && s.npsScore !== null);
  const nps = npsRows.length
    ? npsRows.reduce((s, r) => s + (r.npsScore as number), 0) / npsRows.length : null;

  return [
    kpi('repeat_rate', 'Wiederkaufrate / Repeat Rate', 'care', repeatRate, 'percent'),
    kpi('clv', 'Customer Lifetime Value (CLV)', 'care', clv, 'currency'),
    kpi('repurchase_interval', 'Wiederkaufintervall (Tage)', 'care', interval, 'number'),
    kpi('nps', 'NPS / Zufriedenheit', 'care', nps, 'number'),
    kpi('retention', 'Retention Rate', 'care', retention, 'percent'),
    kpi('churn', 'Churn Rate', 'care', churn, 'percent'),
  ];
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- tests/kpi/care.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/kpi/care.ts tests/kpi/care.test.ts
git commit -m "feat: CARE phase kpis"
```

---

### Task 7: Aggregator (computeKpis, withDelta, previousRange)

**Files:**
- Create: `src/kpi/index.ts`
- Test: `tests/kpi/index.test.ts`

**Interfaces:**
- Consumes: `seeKpis`, `thinkKpis`, `doKpis`, `careKpis`; `Kpi`, `PhaseKpis`; `daysBetween`, `addDays`.
- Produces:
  - `previousRange(range): DateRange` — gleich lange, direkt vorangehende Periode.
  - `withDelta(current: Kpi[], previous: Kpi[]): Kpi[]` — füllt `deltaPct`.
  - `computeKpis(data, range): PhaseKpis[]` — die öffentliche Engine-API (berechnet Vorperiode selbst).

- [ ] **Step 1: Test schreiben (failing)**

`tests/kpi/index.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { computeKpis, previousRange, withDelta } from '@/kpi/index';
import type { CanonicalDataset } from '@/lib/types';
import type { Kpi } from '@/kpi/types';

describe('aggregator', () => {
  it('previousRange liefert gleich lange Vorperiode', () => {
    expect(previousRange({ start: '2026-01-08', end: '2026-01-14' }))
      .toEqual({ start: '2026-01-01', end: '2026-01-07' });
  });

  it('withDelta berechnet prozentuale Veränderung', () => {
    const cur: Kpi[] = [{ key: 'revenue', label: 'U', phase: 'do', value: 120, unit: 'currency', available: true, deltaPct: null }];
    const prev: Kpi[] = [{ key: 'revenue', label: 'U', phase: 'do', value: 100, unit: 'currency', available: true, deltaPct: null }];
    expect(withDelta(cur, prev)[0].deltaPct).toBeCloseTo(20);
  });

  it('computeKpis liefert vier Phasen in Reihenfolge', () => {
    const empty: CanonicalDataset = { dailyMetrics: [], orders: [], customers: [], adSpend: [], subscribers: [] };
    const phases = computeKpis(empty, { start: '2026-01-08', end: '2026-01-14' });
    expect(phases.map((p) => p.phase)).toEqual(['see', 'think', 'do', 'care']);
    expect(phases[0].title).toBe('SEE');
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/kpi/index.test.ts`
Expected: FAIL — `@/kpi/index` nicht gefunden.

- [ ] **Step 3: Aggregator implementieren**

`src/kpi/index.ts`:
```ts
import type { CanonicalDataset, DateRange } from '@/lib/types';
import type { Kpi, PhaseKpis } from './types';
import { addDays, daysBetween } from '@/lib/dates';
import { seeKpis } from './see';
import { thinkKpis } from './think';
import { doKpis } from './do';
import { careKpis } from './care';

const PHASES = [
  { phase: 'see', title: 'SEE', subtitle: 'Awareness', fn: seeKpis },
  { phase: 'think', title: 'THINK', subtitle: 'Consideration', fn: thinkKpis },
  { phase: 'do', title: 'DO', subtitle: 'Conversion', fn: doKpis },
  { phase: 'care', title: 'CARE', subtitle: 'Loyalty', fn: careKpis },
] as const;

export function previousRange(range: DateRange): DateRange {
  const len = daysBetween(range.start, range.end) + 1;
  const prevEnd = addDays(range.start, -1);
  return { start: addDays(prevEnd, -(len - 1)), end: prevEnd };
}

export function withDelta(current: Kpi[], previous: Kpi[]): Kpi[] {
  const prevByKey = new Map(previous.map((k) => [k.key, k]));
  return current.map((c) => {
    const p = prevByKey.get(c.key);
    const deltaPct =
      c.available && p?.available && p.value
        ? ((c.value! - p.value) / p.value) * 100
        : null;
    return { ...c, deltaPct };
  });
}

export function computeKpis(data: CanonicalDataset, range: DateRange): PhaseKpis[] {
  const prev = previousRange(range);
  return PHASES.map((p) => ({
    phase: p.phase,
    title: p.title,
    subtitle: p.subtitle,
    kpis: withDelta(p.fn(data, range), p.fn(data, prev)),
  }));
}

export type { Kpi, PhaseKpis } from './types';
```

- [ ] **Step 4: Test grün + ganze Engine grün**

Run: `npm test -- tests/kpi`
Expected: PASS (alle KPI-Tests).

- [ ] **Step 5: Commit**

```bash
git add src/kpi/index.ts tests/kpi/index.test.ts
git commit -m "feat: kpi aggregator with delta vs previous period"
```

---

### Task 8: Seed-Generator, Connector-Interface, Repository & Seed-Skript

**Files:**
- Create: `src/connectors/connector.ts`, `src/connectors/seed/generator.ts`, `src/kpi/repository.ts`, `scripts/seed.ts`
- Test: `tests/connectors/seed.test.ts`, `tests/kpi/repository.test.ts`

**Interfaces:**
- Consumes: `CanonicalDataset`, `pool`, `computeKpis`.
- Produces:
  - `Connector` Interface.
  - `generateSeedData(range: DateRange): CanonicalDataset` — **deterministisch**.
  - `loadDataset(): Promise<CanonicalDataset>` und `loadDailySeries(metricKey, range): Promise<{date:string,value:number}[]>` aus `repository.ts`.
  - `scripts/seed.ts` schreibt einen generierten Datensatz in die DB.

- [ ] **Step 1: Connector-Interface anlegen**

`src/connectors/connector.ts`:
```ts
import type { CanonicalDataset, DateRange } from '@/lib/types';

export interface Connector {
  source: string;
  fetch(range: DateRange): Promise<unknown>;
  normalize(raw: unknown): CanonicalDataset;
}
```

- [ ] **Step 2: Seed-Generator-Test schreiben (failing)**

`tests/connectors/seed.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { generateSeedData } from '@/connectors/seed/generator';

const range = { start: '2026-01-01', end: '2026-03-31' };

describe('generateSeedData', () => {
  it('ist deterministisch (gleicher Range → gleiche Werte)', () => {
    const a = generateSeedData(range);
    const b = generateSeedData(range);
    expect(a.orders.length).toBe(b.orders.length);
    expect(a.dailyMetrics[0]).toEqual(b.dailyMetrics[0]);
  });
  it('liefert für jeden Tag GA4-Sessions und Ads-Spend', () => {
    const data = generateSeedData(range);
    const days = 90; // Jan(31)+Feb(28)+Mar(31)
    expect(data.dailyMetrics.filter((m) => m.metricKey === 'sessions').length).toBe(days);
    expect(data.adSpend.length).toBeGreaterThan(0);
  });
  it('Kundenaggregate sind mit Orders konsistent', () => {
    const data = generateSeedData(range);
    const c = data.customers[0];
    const orders = data.orders.filter((o) => o.customerId === c.customerId);
    expect(c.ordersCount).toBe(orders.length);
    expect(c.totalRevenue).toBeCloseTo(orders.reduce((s, o) => s + o.revenue, 0));
  });
});
```

- [ ] **Step 3: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/connectors/seed.test.ts`
Expected: FAIL — `@/connectors/seed/generator` nicht gefunden.

- [ ] **Step 4: Seed-Generator implementieren**

`src/connectors/seed/generator.ts`:
```ts
import type {
  AdPlatform, CanonicalDataset, Customer, DailyMetric, DateRange, Order, Subscriber,
} from '@/lib/types';
import { addDays, daysBetween } from '@/lib/dates';

// Deterministischer PRNG (mulberry32) — stabile Seed-Daten für Tests.
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

const PLATFORMS: AdPlatform[] = ['google_ads', 'meta_ads', 'tiktok_ads'];

export function generateSeedData(range: DateRange): CanonicalDataset {
  const r = rng(20260617);
  const totalDays = daysBetween(range.start, range.end) + 1;
  const dates = Array.from({ length: totalDays }, (_, i) => addDays(range.start, i));

  const dailyMetrics: DailyMetric[] = [];
  const adSpend: CanonicalDataset['adSpend'] = [];
  const subscribers: Subscriber[] = [];
  const orders: Order[] = [];

  // Wachsender Traffic-Trend über die Zeit + leichtes Rauschen.
  dates.forEach((date, i) => {
    const trend = 1 + i / totalDays;
    const sessions = Math.round((800 + r() * 400) * trend);
    const totalUsers = Math.round(sessions * (0.85 + r() * 0.1));
    const m = (metricKey: string, value: number) =>
      dailyMetrics.push({ date, source: 'ga4', channel: 'default', metricKey, value });
    m('sessions', sessions);
    m('total_users', totalUsers);
    m('returning_users', Math.round(totalUsers * (0.25 + r() * 0.1)));
    m('pageviews', Math.round(sessions * (2.5 + r())));
    m('bounced_sessions', Math.round(sessions * (0.35 + r() * 0.15)));
    m('add_to_carts', Math.round(sessions * (0.08 + r() * 0.05)));
    m('checkouts_started', Math.round(sessions * (0.04 + r() * 0.02)));
    dailyMetrics.push({ date, source: 'meta_ads', channel: 'default', metricKey: 'video_views', value: Math.round(2000 * trend + r() * 800) });

    for (const platform of PLATFORMS) {
      const impressions = Math.round((30_000 + r() * 20_000) * trend);
      const spend = Math.round((150 + r() * 120) * trend);
      const clicks = Math.round(impressions * (0.01 + r() * 0.01));
      const conversions = Math.round(clicks * (0.03 + r() * 0.02));
      adSpend.push({ date, platform, spend, impressions, clicks, conversions, convValue: conversions * (60 + r() * 40) });
    }

    subscribers.push({
      date, source: 'klaviyo',
      signups: Math.round(20 + r() * 30), unsubscribes: Math.round(r() * 8),
      npsScore: i % 7 === 0 ? Math.round(30 + r() * 40) : null,
    });
  });

  // Kunden + Bestellungen: fester Stamm, ~30% Wiederkäufer.
  const customerCount = 220;
  const customers: Customer[] = [];
  for (let c = 0; c < customerCount; c++) {
    const customerId = `c${c + 1}`;
    const nOrders = r() < 0.3 ? 2 + Math.floor(r() * 3) : 1;
    const custOrders: Order[] = [];
    for (let o = 0; o < nOrders; o++) {
      const dayIdx = Math.floor(r() * totalDays);
      const revenue = Math.round((40 + r() * 160) * 100) / 100;
      custOrders.push({
        orderId: `${customerId}-o${o + 1}`, customerId, date: dates[dayIdx],
        revenue, isFirstOrder: false,
      });
    }
    custOrders.sort((a, b) => a.date.localeCompare(b.date));
    custOrders[0].isFirstOrder = true;
    orders.push(...custOrders);
    customers.push({
      customerId,
      firstOrderDate: custOrders[0].date,
      lastOrderDate: custOrders[custOrders.length - 1].date,
      ordersCount: custOrders.length,
      totalRevenue: Math.round(custOrders.reduce((s, o) => s + o.revenue, 0) * 100) / 100,
    });
  }

  return { dailyMetrics, orders, customers, adSpend, subscribers };
}
```

- [ ] **Step 5: Seed-Generator-Test grün**

Run: `npm test -- tests/connectors/seed.test.ts`
Expected: PASS (3 Tests).

- [ ] **Step 6: Repository implementieren**

`src/kpi/repository.ts`:
```ts
import { pool } from '@/lib/db';
import type { CanonicalDataset, DateRange } from '@/lib/types';

export async function loadDataset(): Promise<CanonicalDataset> {
  const [dm, ord, cust, ads, subs] = await Promise.all([
    pool.query('SELECT date::text, source, channel, metric_key AS "metricKey", value FROM daily_metrics'),
    pool.query('SELECT order_id AS "orderId", customer_id AS "customerId", date::text, revenue, is_first_order AS "isFirstOrder" FROM orders'),
    pool.query('SELECT customer_id AS "customerId", first_order_date::text AS "firstOrderDate", last_order_date::text AS "lastOrderDate", orders_count AS "ordersCount", total_revenue AS "totalRevenue" FROM customers'),
    pool.query('SELECT date::text, platform, spend, impressions, clicks, conversions, conv_value AS "convValue" FROM ad_spend'),
    pool.query('SELECT date::text, source, signups, unsubscribes, nps_score AS "npsScore" FROM subscribers'),
  ]);
  return {
    dailyMetrics: dm.rows, orders: ord.rows, customers: cust.rows,
    adSpend: ads.rows, subscribers: subs.rows,
  };
}

export async function loadDailySeries(
  metricKey: string, range: DateRange,
): Promise<{ date: string; value: number }[]> {
  const res = await pool.query(
    `SELECT date::text, sum(value) AS value FROM daily_metrics
     WHERE metric_key = $1 AND date BETWEEN $2 AND $3
     GROUP BY date ORDER BY date`,
    [metricKey, range.start, range.end],
  );
  return res.rows.map((r) => ({ date: r.date, value: Number(r.value) }));
}
```

- [ ] **Step 7: Seed-Skript implementieren**

`scripts/seed.ts`:
```ts
import { pool } from '../src/lib/db';
import { generateSeedData } from '../src/connectors/seed/generator';
import { addDays } from '../src/lib/dates';

async function main() {
  // 180 Tage bis „heute" (Argument optional: YYYY-MM-DD als Enddatum).
  const end = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -179), end };
  const data = generateSeedData(range);

  await pool.query('TRUNCATE daily_metrics, orders, customers, ad_spend, subscribers');

  for (const m of data.dailyMetrics) {
    await pool.query(
      'INSERT INTO daily_metrics(date, source, channel, metric_key, value) VALUES($1,$2,$3,$4,$5)',
      [m.date, m.source, m.channel, m.metricKey, m.value],
    );
  }
  for (const c of data.customers) {
    await pool.query(
      'INSERT INTO customers(customer_id, first_order_date, last_order_date, orders_count, total_revenue) VALUES($1,$2,$3,$4,$5)',
      [c.customerId, c.firstOrderDate, c.lastOrderDate, c.ordersCount, c.totalRevenue],
    );
  }
  for (const o of data.orders) {
    await pool.query(
      'INSERT INTO orders(order_id, customer_id, date, revenue, is_first_order) VALUES($1,$2,$3,$4,$5)',
      [o.orderId, o.customerId, o.date, o.revenue, o.isFirstOrder],
    );
  }
  for (const a of data.adSpend) {
    await pool.query(
      'INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [a.date, a.platform, a.spend, a.impressions, a.clicks, a.conversions, a.convValue],
    );
  }
  for (const s of data.subscribers) {
    await pool.query(
      'INSERT INTO subscribers(date, source, signups, unsubscribes, nps_score) VALUES($1,$2,$3,$4,$5)',
      [s.date, s.source, s.signups, s.unsubscribes, s.npsScore],
    );
  }
  console.log(`Seeded ${data.orders.length} orders, ${data.dailyMetrics.length} daily metrics.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 8: Repository-Integrationstest schreiben (failing)**

`tests/kpi/repository.test.ts`:
```ts
import { describe, it, expect, afterAll } from 'vitest';
import { loadDataset } from '@/kpi/repository';
import { computeKpis } from '@/kpi/index';
import { pool } from '@/lib/db';

describe('repository (integration, benötigt geseedete DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('lädt einen nichtleeren Datensatz und berechnet Phasen', async () => {
    const data = await loadDataset();
    expect(data.orders.length).toBeGreaterThan(0);
    const phases = computeKpis(data, { start: '2026-01-01', end: '2026-12-31' });
    expect(phases).toHaveLength(4);
    expect(phases[2].kpis.find((k) => k.key === 'revenue')!.available).toBe(true);
  });
});
```

- [ ] **Step 9: Migrieren, seeden, Integrationstests ausführen**

Run:
```bash
docker compose up -d db
npm run migrate
npm run seed
npm test -- tests/kpi/repository.test.ts
```
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/connectors/connector.ts src/connectors/seed/generator.ts src/kpi/repository.ts scripts/seed.ts tests/connectors/seed.test.ts tests/kpi/repository.test.ts
git commit -m "feat: deterministic seed generator, repository and seed script"
```

---

### Task 9: API-Route `/api/kpis`

**Files:**
- Create: `src/app/api/kpis/route.ts`
- Test: `tests/app/kpis-route.test.ts`

**Interfaces:**
- Consumes: `loadDataset`, `computeKpis`, `addDays`.
- Produces: `GET /api/kpis?days=30` → `{ range, phases: PhaseKpis[] }`. `days ∈ {7,30,90}` (Default 30); ungültige Werte → 30.

- [ ] **Step 1: Test schreiben (failing)**

`tests/app/kpis-route.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/kpi/repository', () => ({
  loadDataset: async () => ({
    dailyMetrics: [{ date: '2026-06-01', source: 'ga4', channel: 'default', metricKey: 'sessions', value: 100 }],
    orders: [{ orderId: 'o1', customerId: 'c1', date: '2026-06-01', revenue: 100, isFirstOrder: true }],
    customers: [{ customerId: 'c1', firstOrderDate: '2026-06-01', lastOrderDate: '2026-06-01', ordersCount: 1, totalRevenue: 100 }],
    adSpend: [], subscribers: [],
  }),
}));

import { GET } from '@/app/api/kpis/route';

describe('GET /api/kpis', () => {
  it('liefert vier Phasen und den aufgelösten Zeitraum', async () => {
    const res = await GET(new Request('http://x/api/kpis?days=30'));
    const body = await res.json();
    expect(body.phases.map((p: any) => p.phase)).toEqual(['see', 'think', 'do', 'care']);
    expect(body.range.start).toBeDefined();
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/app/kpis-route.test.ts`
Expected: FAIL — `@/app/api/kpis/route` nicht gefunden.

- [ ] **Step 3: Route implementieren**

`src/app/api/kpis/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { loadDataset } from '@/kpi/repository';
import { computeKpis } from '@/kpi/index';
import { addDays } from '@/lib/dates';

const ALLOWED = new Set([7, 30, 90]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = Number(url.searchParams.get('days'));
  const days = ALLOWED.has(requested) ? requested : 30;

  const end = url.searchParams.get('end') ?? new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -(days - 1)), end };

  const data = await loadDataset();
  const phases = computeKpis(data, range);
  return NextResponse.json({ range, phases });
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- tests/app/kpis-route.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/kpis/route.ts tests/app/kpis-route.test.ts
git commit -m "feat: /api/kpis route"
```

---

### Task 10: Dashboard-Übersicht (Funnel)

**Files:**
- Create: `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`
- Create: `src/components/KpiCard.tsx`, `src/components/PhaseColumn.tsx`, `src/components/Filters.tsx`, `src/components/NaBadge.tsx`
- Create: `src/lib/format.ts`
- Test: `tests/components/format.test.ts`

**Interfaces:**
- Consumes: `PhaseKpis`, `Kpi`, `loadDataset`, `computeKpis`, `addDays`.
- Produces: `formatValue(kpi): string`; Server-Page `/` mit vier Phasen-Spalten; Client-`Filters` setzt `?days=`.

- [ ] **Step 1: Format-Helfer-Test schreiben (failing)**

`tests/components/format.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatValue } from '@/lib/format';
import type { Kpi } from '@/kpi/types';

const base: Kpi = { key: 'x', label: 'X', phase: 'do', value: 0, unit: 'number', available: true, deltaPct: null };

describe('formatValue', () => {
  it('formatiert Währung, Prozent, Ratio und N/A', () => {
    expect(formatValue({ ...base, unit: 'currency', value: 1234.5 })).toContain('€');
    expect(formatValue({ ...base, unit: 'percent', value: 0.1234 })).toBe('12,3 %');
    expect(formatValue({ ...base, unit: 'ratio', value: 4.2 })).toBe('4,2×');
    expect(formatValue({ ...base, available: false, value: null })).toBe('N/A');
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/components/format.test.ts`
Expected: FAIL — `@/lib/format` nicht gefunden.

- [ ] **Step 3: Format-Helfer implementieren**

`src/lib/format.ts`:
```ts
import type { Kpi } from '@/kpi/types';

const nf = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const cf = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
const pf = new Intl.NumberFormat('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatValue(kpi: Kpi): string {
  if (!kpi.available || kpi.value === null) return 'N/A';
  switch (kpi.unit) {
    case 'currency': return cf.format(kpi.value);
    case 'percent': return `${pf.format(kpi.value * 100)} %`;
    case 'ratio': return `${pf.format(kpi.value)}×`;
    default: return nf.format(kpi.value);
  }
}

export function formatDelta(deltaPct: number | null): string | null {
  if (deltaPct === null) return null;
  const sign = deltaPct >= 0 ? '▲' : '▼';
  return `${sign} ${pf.format(Math.abs(deltaPct))} %`;
}
```

- [ ] **Step 4: Test grün**

Run: `npm test -- tests/components/format.test.ts`
Expected: PASS.

- [ ] **Step 5: Tailwind/Tremor-Layout anlegen**

`src/app/globals.css`:
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { background: #0a0a0a; color: #e5e7eb; }
```

`src/app/layout.tsx`:
```tsx
import './globals.css';
import type { ReactNode } from 'react';

export const metadata = { title: 'KPI-Dashboard · SEE–THINK–DO–CARE' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="de">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 6: NaBadge & KpiCard implementieren**

`src/components/NaBadge.tsx`:
```tsx
export function NaBadge() {
  return (
    <span className="rounded bg-neutral-800 px-2 py-0.5 text-xs text-neutral-400">
      N/A — Quelle nicht verbunden
    </span>
  );
}
```

`src/components/KpiCard.tsx`:
```tsx
import { Card } from '@tremor/react';
import type { Kpi } from '@/kpi/types';
import { formatValue, formatDelta } from '@/lib/format';
import { NaBadge } from './NaBadge';

export function KpiCard({ kpi, hero = false }: { kpi: Kpi; hero?: boolean }) {
  const delta = formatDelta(kpi.deltaPct);
  const up = (kpi.deltaPct ?? 0) >= 0;
  return (
    <Card className="bg-neutral-900 ring-emerald-900/40">
      <p className="text-sm text-neutral-400">{kpi.label}</p>
      {kpi.available ? (
        <p className={hero ? 'mt-1 text-3xl font-semibold text-emerald-400' : 'mt-1 text-xl font-semibold text-neutral-100'}>
          {formatValue(kpi)}
        </p>
      ) : (
        <div className="mt-2"><NaBadge /></div>
      )}
      {delta && (
        <p className={`mt-1 text-xs ${up ? 'text-emerald-500' : 'text-red-400'}`}>{delta}</p>
      )}
    </Card>
  );
}
```

- [ ] **Step 7: PhaseColumn & Filters implementieren**

`src/components/PhaseColumn.tsx`:
```tsx
import Link from 'next/link';
import type { PhaseKpis } from '@/kpi/types';
import { KpiCard } from './KpiCard';

export function PhaseColumn({ phase }: { phase: PhaseKpis }) {
  const [hero, ...rest] = phase.kpis;
  return (
    <div className="flex flex-1 flex-col gap-3">
      <Link href={`/phase/${phase.phase}`} className="rounded-lg border border-emerald-700/50 bg-emerald-950/30 p-3 text-center hover:bg-emerald-950/60">
        <div className="text-lg font-bold tracking-wide text-emerald-400">{phase.title}</div>
        <div className="text-xs text-neutral-400">{phase.subtitle}</div>
      </Link>
      <KpiCard kpi={hero} hero />
      {rest.map((k) => <KpiCard key={k.key} kpi={k} />)}
    </div>
  );
}
```

`src/components/Filters.tsx`:
```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';

const OPTIONS = [
  { days: 7, label: '7 Tage' },
  { days: 30, label: '30 Tage' },
  { days: 90, label: '90 Tage' },
];

export function Filters() {
  const router = useRouter();
  const params = useSearchParams();
  const active = Number(params.get('days')) || 30;
  return (
    <div className="flex gap-2">
      {OPTIONS.map((o) => (
        <button
          key={o.days}
          onClick={() => router.push(`/?days=${o.days}`)}
          className={`rounded px-3 py-1 text-sm ${active === o.days ? 'bg-emerald-600 text-white' : 'bg-neutral-800 text-neutral-300'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 8: Übersichtsseite implementieren**

`src/app/page.tsx`:
```tsx
import { loadDataset } from '@/kpi/repository';
import { computeKpis } from '@/kpi/index';
import { addDays } from '@/lib/dates';
import { PhaseColumn } from '@/components/PhaseColumn';
import { Filters } from '@/components/Filters';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: { days?: string } }) {
  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const end = new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -(days - 1)), end };
  const phases = computeKpis(await loadDataset(), range);

  return (
    <main className="mx-auto max-w-7xl p-6">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-emerald-400">KPI-Dashboard · SEE–THINK–DO–CARE</h1>
          <p className="text-sm text-neutral-400">Steuerung entlang der Customer Journey · {range.start} – {range.end}</p>
        </div>
        <Filters />
      </header>
      <div className="flex gap-4">
        {phases.map((p) => <PhaseColumn key={p.phase} phase={p} />)}
      </div>
    </main>
  );
}
```

- [ ] **Step 9: Visuell verifizieren (Docker + Browser)**

Run:
```bash
docker compose up -d --build
# (einmalig, falls noch nicht geschehen) npm run migrate && npm run seed
```
Dann mit Claude in Chrome `http://localhost:3000` öffnen. Erwartet: vier Spalten SEE/THINK/DO/CARE mit Hero-KPI + Karten, Trendpfeile, `ad_recall` zeigt N/A-Badge; Umschalten 7/30/90 Tage ändert die Werte.

- [ ] **Step 10: Commit**

```bash
git add src/app/layout.tsx src/app/globals.css src/app/page.tsx src/components/ src/lib/format.ts tests/components/format.test.ts
git commit -m "feat: funnel overview dashboard"
```

---

### Task 11: Phasen-Drilldown

**Files:**
- Create: `src/app/phase/[phase]/page.tsx`
- Modify: `src/kpi/index.ts` (Export `PHASE_META` für Titel/Untertitel-Wiederverwendung)
- Test: `tests/kpi/phase-meta.test.ts`

**Interfaces:**
- Consumes: `loadDataset`, `loadDailySeries`, `computeKpis`, `PHASE_META`.
- Produces: Drilldown-Seite `/phase/[phase]` mit den KPI-Karten der Phase + Zeitreihe der Leitmetrik.

- [ ] **Step 1: PHASE_META exportieren + Test (failing)**

`tests/kpi/phase-meta.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { PHASE_META } from '@/kpi/index';

describe('PHASE_META', () => {
  it('enthält Titel und Leitmetrik je Phase', () => {
    expect(PHASE_META.do.title).toBe('DO');
    expect(PHASE_META.see.leadMetric).toBe('sessions');
  });
});
```

- [ ] **Step 2: Test ausführen — muss fehlschlagen**

Run: `npm test -- tests/kpi/phase-meta.test.ts`
Expected: FAIL — `PHASE_META` nicht exportiert.

- [ ] **Step 3: PHASE_META in `src/kpi/index.ts` ergänzen**

Am Ende von `src/kpi/index.ts` hinzufügen:
```ts
export const PHASE_META = {
  see:   { title: 'SEE',   subtitle: 'Awareness',     leadMetric: 'sessions' },
  think: { title: 'THINK', subtitle: 'Consideration', leadMetric: 'sessions' },
  do:    { title: 'DO',    subtitle: 'Conversion',    leadMetric: 'checkouts_started' },
  care:  { title: 'CARE',  subtitle: 'Loyalty',       leadMetric: 'sessions' },
} as const;

export type PhaseKey = keyof typeof PHASE_META;
```

- [ ] **Step 4: Test grün**

Run: `npm test -- tests/kpi/phase-meta.test.ts`
Expected: PASS.

- [ ] **Step 5: Drilldown-Seite implementieren**

`src/app/phase/[phase]/page.tsx`:
```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AreaChart, Card } from '@tremor/react';
import { loadDataset, loadDailySeries } from '@/kpi/repository';
import { computeKpis, PHASE_META, type PhaseKey } from '@/kpi/index';
import { addDays } from '@/lib/dates';
import { KpiCard } from '@/components/KpiCard';

export const dynamic = 'force-dynamic';

export default async function PhasePage({ params }: { params: { phase: string } }) {
  const key = params.phase as PhaseKey;
  if (!(key in PHASE_META)) notFound();
  const meta = PHASE_META[key];

  const end = new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -29), end };

  const [data, series] = await Promise.all([loadDataset(), loadDailySeries(meta.leadMetric, range)]);
  const phase = computeKpis(data, range).find((p) => p.phase === key)!;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <Link href="/" className="text-sm text-emerald-400">← Zur Übersicht</Link>
      <h1 className="mt-2 text-2xl font-bold text-emerald-400">{meta.title} · {meta.subtitle}</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-3">
        {phase.kpis.map((k) => <KpiCard key={k.key} kpi={k} />)}
      </div>

      <Card className="mt-6 bg-neutral-900">
        <p className="text-sm text-neutral-400">Verlauf: {meta.leadMetric} (30 Tage)</p>
        <AreaChart
          className="mt-2 h-72"
          data={series}
          index="date"
          categories={['value']}
          colors={['emerald']}
          showLegend={false}
        />
      </Card>
    </main>
  );
}
```

- [ ] **Step 6: Visuell verifizieren**

Run: `docker compose up -d --build`
Mit Claude in Chrome `http://localhost:3000` öffnen, auf eine Phasenüberschrift klicken. Erwartet: Drilldown mit allen KPI-Karten der Phase + Flächendiagramm der Leitmetrik; „Zur Übersicht" führt zurück.

- [ ] **Step 7: Volltest + Commit**

Run: `npm test`
Expected: alle Unit-Tests grün (Integrationstests benötigen laufende, geseedete DB).
```bash
git add src/app/phase/ src/kpi/index.ts tests/kpi/phase-meta.test.ts
git commit -m "feat: phase drilldown view"
```

---

## Definition of Done (V1)

- `docker compose up -d --build` startet App + Postgres; `npm run migrate && npm run seed` befüllt die DB.
- `http://localhost:3000` zeigt die Funnel-Übersicht mit allen KPIs der vier Phasen, Trend-Deltas und N/A-Badges für nicht verbundene Quellen.
- Klick auf eine Phase öffnet den Drilldown mit Zeitreihe.
- `npm test` ist grün (KPI-Engine, Seed-Generator, Format, Route per Unit-Tests; Schema/Repository per Integrationstest gegen die laufende DB).
- Alle KPIs und Formeln entsprechen der Spec.

## Verifizierte Spec-Abdeckung (Self-Review)

- Architektur Connector→DB→Engine→Dashboard: Tasks 2, 3–7, 8, 10–11 ✓
- Kanonisches Datenmodell (5 Tabellen): Task 2 ✓
- SEE/THINK/DO/CARE-KPIs exakt nach Spec inkl. N/A-Logik: Tasks 4–6, 10 (`formatValue`/`NaBadge`) ✓
- Delta zur Vorperiode (Trendpfeile): Task 7 (`withDelta`), Task 10 (`formatDelta`) ✓
- Seed-Generator als Connector, deterministisch, gleiches Schema: Task 8 ✓
- Dashboard Übersicht + Drilldown, dunkles Theme/grüne Akzente, Zeitraum-Filter: Tasks 10–11 ✓
- Scope-Grenze (kein Login/Builder/Alerting): eingehalten ✓
- TDD + Docker: jede Logik-Task Test-zuerst; Docker in Tasks 2/10/11 ✓
