# Kampagnenebene STDC-Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eine Kampagnen-Ansicht ins STDC-Dashboard bauen, die jede Kampagne in ihrer Ziel-Stage (SEE/THINK/DO/CARE) mit ad-nativen Kennzahlen misst — Stage per Namenskonvention, Daten aus den bestehenden Demo-/Seed-Ad-Daten.

**Architecture:** `ad_spend` wird kampagnen-granular (neue Spalten `campaign_id`/`campaign_name`, PK erweitert). Reine Funktionen in `src/kpi/campaigns.ts` leiten Stage aus dem Namen ab, listen Kampagnen und rechnen ad-native KPIs. Der Seed-Generator splittet die Plattform-Tagessummen deterministisch auf benannte Kampagnen (Summe bleibt exakt → Global-Ansicht unverändert). Das Dashboard bekommt einen Global↔Kampagne-Selektor; bei Auswahl ersetzt eine Detailsicht das 4-Spalten-Layout.

**Tech Stack:** Next.js App Router (Server Components), React Client Component für den Selektor, TypeScript, Supabase/Postgres, Vitest (+ @testing-library/react, jsdom), Tailwind (ERP-Amber-Designsystem).

## Global Constraints

- **Design:** Akzent nur über `--brand`/`brand`; warme `neutral`-Palette (kein slate/zinc/gray, kein pures Weiß/Schwarz); Uppercase nur via `.anno`; Dark-Mode (`dark:`) Pflicht für alles Neue. (Projekt-CLAUDE.md / `docs/design/design-system.md`)
- **Deployment:** Nie lokal starten. Deploy ausschließlich auf die VPS (`root@194.164.204.249`, https://budp.lumeapps.de). Automatisierte Tests (`npx vitest`) laufen lokal.
- **Doku-Pflicht:** Funktionsänderung → `/hilfe` (`src/lib/help/content.ts`) mitpflegen; Datenmodell-Änderung → Admin-Seite `datenmodell`. Registry-Test `tests/lib/help-content.test.ts` muss grün bleiben.
- **Invariante:** Summe der Kampagnen-Werte je (date, platform) = bisheriger Plattform-Tageswert. Die globalen KPI-Funktionen (`see.ts`/`do.ts`/`verkauf/marketing.ts`) summieren über `ad_spend` und dürfen sich NICHT verhalten ändern.
- **Attribution:** Slice 1 misst nur Ad-Performance. Umsatz-/Session-/CLV-KPIs sind nicht kampagnen-attribuiert. Kein Live-Connector-Kampagnenabruf, keine Cross-Stage-Matrix.

---

### Task 1: AdSpend-Kampagnenfelder + Stage-Ableitung

**Files:**
- Modify: `src/lib/types.ts:17-20` (AdSpend um optionale Kampagnenfelder erweitern)
- Create: `src/kpi/campaigns.ts`
- Test: `tests/kpi/campaigns.test.ts`

**Interfaces:**
- Consumes: `Phase` aus `src/kpi/types.ts`; `AdSpend`, `DateRange` aus `src/lib/types.ts`.
- Produces: `campaignStage(name: string): Phase | null`; `AdSpend` trägt `campaignId?: string` und `campaignName?: string`.

- [ ] **Step 1: Failing test schreiben**

`tests/kpi/campaigns.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { campaignStage } from '@/kpi/campaigns';

describe('campaignStage', () => {
  it('leitet die Stage aus dem Kampagnennamen ab (case-insensitive)', () => {
    expect(campaignStage('Prospecting_Video')).toBe('see');
    expect(campaignStage('awareness_reels')).toBe('see');
    expect(campaignStage('Traffic_Discovery')).toBe('think');
    expect(campaignStage('Retargeting_Q3')).toBe('do');
    expect(campaignStage('Conversion_Catalog')).toBe('do');
    expect(campaignStage('Newsletter_Reactivation')).toBe('care');
  });
  it('liefert null, wenn keine Regel greift', () => {
    expect(campaignStage('Brandkampagne 2026')).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run tests/kpi/campaigns.test.ts`
Expected: FAIL („Cannot find module '@/kpi/campaigns'").

- [ ] **Step 3: AdSpend erweitern**

`src/lib/types.ts`, AdSpend-Interface (aktuell Zeilen 17-20) ersetzen durch:

```ts
export interface AdSpend {
  date: string; platform: AdPlatform; spend: number; impressions: number;
  clicks: number; conversions: number; convValue: number;
  campaignId?: string; campaignName?: string;
}
```

- [ ] **Step 4: `src/kpi/campaigns.ts` anlegen (nur Stage-Teil)**

```ts
import type { AdSpend, DateRange } from '@/lib/types';
import type { Kpi, Phase } from './types';
import { inRange, ratio, kpi } from './helpers';

// Kampagne → Ziel-Stage per Namenskonvention. Erste passende Regel gewinnt.
const STAGE_RULES: { stage: Phase; patterns: string[] }[] = [
  { stage: 'see',   patterns: ['prospecting', 'awareness', 'video'] },
  { stage: 'think', patterns: ['consideration', 'traffic'] },
  { stage: 'do',    patterns: ['retargeting', 'conversion', 'sales'] },
  { stage: 'care',  patterns: ['newsletter', 'reactivation', 'loyalty'] },
];

export function campaignStage(name: string): Phase | null {
  const n = name.toLowerCase();
  for (const rule of STAGE_RULES) {
    if (rule.patterns.some((p) => n.includes(p))) return rule.stage;
  }
  return null;
}
```

(Die Imports `AdSpend`, `DateRange`, `inRange`, `ratio`, `kpi` werden in Task 2/3 verwendet — schon jetzt setzen, damit die Datei über die Tasks stabil bleibt. `Kpi`/`Phase` ebenso.)

- [ ] **Step 5: Test laufen lassen — muss bestehen**

Run: `npx vitest run tests/kpi/campaigns.test.ts`
Expected: PASS (2 Tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/types.ts src/kpi/campaigns.ts tests/kpi/campaigns.test.ts
git commit -m "feat(kampagnen): AdSpend-Kampagnenfelder + Stage-Ableitung per Namenskonvention"
```

---

### Task 2: `listCampaigns` + `CampaignSummary`

**Files:**
- Modify: `src/kpi/campaigns.ts`
- Test: `tests/kpi/campaigns.test.ts`

**Interfaces:**
- Consumes: `campaignStage`, `inRange`, `AdSpend`, `DateRange`.
- Produces: `interface CampaignSummary { id; name; platform; stage: Phase|null; spend; impressions; clicks; firstDate; lastDate }`; `listCampaigns(adSpend: AdSpend[], range: DateRange): CampaignSummary[]` (absteigend nach Spend sortiert).

- [ ] **Step 1: Failing test ergänzen**

An `tests/kpi/campaigns.test.ts` anhängen:

```ts
import { listCampaigns } from '@/kpi/campaigns';

const rows = [
  { date: '2026-01-01', platform: 'meta_ads' as const, spend: 100, impressions: 1000, clicks: 20, conversions: 2, convValue: 300, campaignId: 'm1', campaignName: 'Prospecting_Video' },
  { date: '2026-01-03', platform: 'meta_ads' as const, spend: 200, impressions: 3000, clicks: 40, conversions: 5, convValue: 700, campaignId: 'm1', campaignName: 'Prospecting_Video' },
  { date: '2026-01-02', platform: 'meta_ads' as const, spend: 500, impressions: 4000, clicks: 60, conversions: 9, convValue: 1500, campaignId: 'm2', campaignName: 'Retargeting_DPA' },
  { date: '2026-02-01', platform: 'meta_ads' as const, spend: 999, impressions: 9, clicks: 9, conversions: 9, convValue: 9, campaignId: 'm2', campaignName: 'Retargeting_DPA' },
];
const range = { start: '2026-01-01', end: '2026-01-31' };

describe('listCampaigns', () => {
  it('aggregiert je Kampagne im Zeitraum und sortiert nach Spend', () => {
    const list = listCampaigns(rows, range);
    expect(list.map((c) => c.id)).toEqual(['m2', 'm1']); // 500 vor 300
    const m1 = list.find((c) => c.id === 'm1')!;
    expect(m1.spend).toBe(300);          // 100 + 200
    expect(m1.impressions).toBe(4000);
    expect(m1.clicks).toBe(60);
    expect(m1.firstDate).toBe('2026-01-01');
    expect(m1.lastDate).toBe('2026-01-03');
    expect(m1.stage).toBe('see');
    const m2 = list.find((c) => c.id === 'm2')!;
    expect(m2.spend).toBe(500);          // Zeile vom 2026-02-01 ist außerhalb des Range
    expect(m2.stage).toBe('do');
  });
  it('Zeilen ohne Kampagnenfelder landen als unzugeordnet', () => {
    const anon = [{ date: '2026-01-05', platform: 'google_ads' as const, spend: 50, impressions: 500, clicks: 5, conversions: 1, convValue: 60 }];
    const [c] = listCampaigns(anon, range);
    expect(c.id).toBe('__account__');
    expect(c.stage).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run tests/kpi/campaigns.test.ts`
Expected: FAIL („listCampaigns is not a function").

- [ ] **Step 3: `listCampaigns` + `CampaignSummary` implementieren**

An `src/kpi/campaigns.ts` anhängen:

```ts
export interface CampaignSummary {
  id: string;
  name: string;
  platform: AdSpend['platform'];
  stage: Phase | null;
  spend: number;
  impressions: number;
  clicks: number;
  firstDate: string;
  lastDate: string;
}

const UNASSIGNED = '(unzugeordnet)';

export function listCampaigns(adSpend: AdSpend[], range: DateRange): CampaignSummary[] {
  const byId = new Map<string, CampaignSummary>();
  for (const r of adSpend) {
    if (!inRange(r.date, range)) continue;
    const id = r.campaignId ?? '__account__';
    const name = r.campaignName ?? UNASSIGNED;
    let s = byId.get(id);
    if (!s) {
      s = { id, name, platform: r.platform, stage: campaignStage(name),
        spend: 0, impressions: 0, clicks: 0, firstDate: r.date, lastDate: r.date };
      byId.set(id, s);
    }
    s.spend += r.spend;
    s.impressions += r.impressions;
    s.clicks += r.clicks;
    if (r.date < s.firstDate) s.firstDate = r.date;
    if (r.date > s.lastDate) s.lastDate = r.date;
  }
  return [...byId.values()].sort((a, b) => b.spend - a.spend);
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npx vitest run tests/kpi/campaigns.test.ts`
Expected: PASS (4 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/kpi/campaigns.ts tests/kpi/campaigns.test.ts
git commit -m "feat(kampagnen): listCampaigns aggregiert Kampagnen je Zeitraum"
```

---

### Task 3: `campaignKpis` (ad-native KPIs je Stage)

**Files:**
- Modify: `src/kpi/campaigns.ts`
- Test: `tests/kpi/campaigns.test.ts`

**Interfaces:**
- Consumes: `kpi`, `ratio` aus `helpers.ts`; `Kpi`, `Phase`; `AdSpend`.
- Produces: `campaignKpis(rows: AdSpend[], stage: Phase | null): Kpi[]`. Stage bestimmt das Karten-Set: see→[impressions, cpm, clicks, ctr]; think→[clicks, ctr, cpc]; do→[conversions, roas, cac_ads, conv_value]; care→[conversions, conv_value]; null→[impressions, clicks, conversions, conv_value].

- [ ] **Step 1: Failing test ergänzen**

An `tests/kpi/campaigns.test.ts` anhängen:

```ts
import { campaignKpis } from '@/kpi/campaigns';

const doRows = [{ date: '2026-01-01', platform: 'meta_ads' as const, spend: 200,
  impressions: 10000, clicks: 100, conversions: 40, convValue: 800,
  campaignId: 'm2', campaignName: 'Retargeting_DPA' }];

describe('campaignKpis', () => {
  it('DO zeigt Conversions, ROAS, CAC (Ad), Conversion-Wert', () => {
    const ks = campaignKpis(doRows, 'do');
    const by = (k: string) => ks.find((x) => x.key === k)!;
    expect(ks.map((k) => k.key)).toEqual(['conversions', 'roas', 'cac_ads', 'conv_value']);
    expect(by('roas').value).toBeCloseTo(4);        // 800 / 200
    expect(by('cac_ads').value).toBeCloseTo(5);     // 200 / 40
    expect(by('conversions').value).toBe(40);
  });
  it('SEE zeigt Impressions, CPM, Klicks, CTR', () => {
    const ks = campaignKpis(doRows, 'see');
    const by = (k: string) => ks.find((x) => x.key === k)!;
    expect(ks.map((k) => k.key)).toEqual(['impressions', 'cpm', 'clicks', 'ctr']);
    expect(by('cpm').value).toBeCloseTo(20);        // 200 / 10000 * 1000
    expect(by('ctr').value).toBeCloseTo(0.01);      // 100 / 10000
  });
  it('markiert KPI als nicht verfügbar bei Division durch Null', () => {
    const empty = [{ date: '2026-01-01', platform: 'meta_ads' as const, spend: 0,
      impressions: 0, clicks: 0, conversions: 0, convValue: 0 }];
    const roas = campaignKpis(empty, 'do').find((k) => k.key === 'roas')!;
    expect(roas.available).toBe(false);
    expect(roas.value).toBeNull();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run tests/kpi/campaigns.test.ts`
Expected: FAIL („campaignKpis is not a function").

- [ ] **Step 3: `campaignKpis` implementieren**

An `src/kpi/campaigns.ts` anhängen:

```ts
export function campaignKpis(rows: AdSpend[], stage: Phase | null): Kpi[] {
  const spend = rows.reduce((s, a) => s + a.spend, 0);
  const impressions = rows.reduce((s, a) => s + a.impressions, 0);
  const clicks = rows.reduce((s, a) => s + a.clicks, 0);
  const conversions = rows.reduce((s, a) => s + a.conversions, 0);
  const convValue = rows.reduce((s, a) => s + a.convValue, 0);
  const cpm = ratio(spend, impressions);

  const impr = kpi('impressions', 'Impressions', 'see', impressions, 'number');
  const cpmK = kpi('cpm', 'CPM', 'see', cpm === null ? null : cpm * 1000, 'currency');
  const clk  = kpi('clicks', 'Klicks', 'see', clicks, 'number');
  const ctr  = kpi('ctr', 'CTR', 'see', ratio(clicks, impressions), 'percent');
  const cpc  = kpi('cpc', 'CPC', 'think', ratio(spend, clicks), 'currency');
  const conv = kpi('conversions', 'Conversions', 'do', conversions, 'number');
  const roas = kpi('roas', 'ROAS', 'do', ratio(convValue, spend), 'ratio');
  const cac  = kpi('cac_ads', 'CAC (Ad-Conversions)', 'do', ratio(spend, conversions), 'currency');
  const cv   = kpi('conv_value', 'Conversion-Wert', 'do', convValue, 'currency');

  switch (stage) {
    case 'see':   return [impr, cpmK, clk, ctr];
    case 'think': return [clk, ctr, cpc];
    case 'do':    return [conv, roas, cac, cv];
    case 'care':  return [conv, cv];
    default:      return [impr, clk, conv, cv]; // unzugeordnet: Roh-Ad-Kennzahlen
  }
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npx vitest run tests/kpi/campaigns.test.ts`
Expected: PASS (7 Tests).

- [ ] **Step 5: Commit**

```bash
git add src/kpi/campaigns.ts tests/kpi/campaigns.test.ts
git commit -m "feat(kampagnen): campaignKpis liefert stage-passende ad-native KPIs"
```

---

### Task 4: Seed-Generator splittet auf benannte Kampagnen

**Files:**
- Modify: `src/connectors/seed/generator.ts:17` (DEMO_CAMPAIGNS + splitTotal), `:45-51` (Split-Loop)
- Test: `tests/connectors/seed.test.ts`

**Interfaces:**
- Consumes: `AdPlatform`.
- Produces: `splitTotal(total: number, weights: number[], round: boolean): number[]` (Summe exakt = total); `generateSeedData` erzeugt pro (date, platform) mehrere `adSpend`-Zeilen mit `campaignId`/`campaignName`.

- [ ] **Step 1: Failing test ergänzen**

An `tests/connectors/seed.test.ts` anhängen:

```ts
import { splitTotal } from '@/connectors/seed/generator';

describe('splitTotal', () => {
  it('erhält die Summe exakt (Rundungsrest auf die letzte Kampagne)', () => {
    const parts = splitTotal(100, [0.4, 0.3, 0.3], true);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts.length).toBe(3);
  });
  it('erhält auch Float-Summen exakt', () => {
    const parts = splitTotal(10.5, [0.5, 0.5], false);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(10.5, 10);
  });
});

describe('generateSeedData Kampagnen', () => {
  it('splittet den Plattform-Spend je Tag verlustfrei auf Kampagnen (Invariante)', () => {
    const data = generateSeedData({ start: '2026-01-01', end: '2026-01-10' });
    // Gruppiere nach date+platform und prüfe: mehrere Kampagnen, alle mit Namen.
    const metaRows = data.adSpend.filter((a) => a.platform === 'meta_ads' && a.date === '2026-01-01');
    expect(metaRows.length).toBeGreaterThan(1);
    expect(metaRows.every((r) => !!r.campaignName)).toBe(true);
    // Stage-Abdeckung: mindestens SEE, DO und CARE unter den Demo-Kampagnen.
    const names = data.adSpend.map((r) => r.campaignName!);
    expect(names.some((n) => /Prospecting/.test(n))).toBe(true);   // see
    expect(names.some((n) => /Retargeting/.test(n))).toBe(true);   // do
    expect(names.some((n) => /Newsletter/.test(n))).toBe(true);    // care
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run tests/connectors/seed.test.ts`
Expected: FAIL („splitTotal is not a function" bzw. `metaRows.length` = 1).

- [ ] **Step 3: `splitTotal` + `DEMO_CAMPAIGNS` einfügen**

In `src/connectors/seed/generator.ts` direkt unter `const PLATFORMS` (Zeile 17) einfügen:

```ts
// Verteilt eine Tagessumme deterministisch auf Kampagnen. Die letzte Kampagne
// absorbiert den Rundungsrest, sodass die Summe EXAKT erhalten bleibt — die
// globalen KPIs (die über alle ad_spend-Zeilen summieren) ändern sich dadurch nicht.
export function splitTotal(total: number, weights: number[], round: boolean): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  const out: number[] = [];
  let acc = 0;
  for (let i = 0; i < weights.length; i++) {
    if (i === weights.length - 1) { out.push(total - acc); }
    else {
      const raw = (total * weights[i]) / sum;
      const v = round ? Math.round(raw) : raw;
      out.push(v); acc += v;
    }
  }
  return out;
}

// Demo-Kampagnen je Plattform — Namen folgen der Stage-Konvention (siehe src/kpi/campaigns.ts).
const DEMO_CAMPAIGNS: Record<AdPlatform, { id: string; name: string; weight: number }[]> = {
  google_ads: [
    { id: 'g-prospecting', name: 'Prospecting_Search', weight: 0.4 },
    { id: 'g-traffic',     name: 'Traffic_Discovery',  weight: 0.3 },
    { id: 'g-retargeting', name: 'Retargeting_Q3',     weight: 0.3 },
  ],
  meta_ads: [
    { id: 'm-prospecting', name: 'Prospecting_Video',       weight: 0.5 },
    { id: 'm-retargeting', name: 'Retargeting_DPA',         weight: 0.3 },
    { id: 'm-newsletter',  name: 'Newsletter_Reactivation', weight: 0.2 },
  ],
  tiktok_ads: [
    { id: 't-awareness',  name: 'Awareness_Spark',    weight: 0.7 },
    { id: 't-conversion', name: 'Conversion_Catalog', weight: 0.3 },
  ],
};
```

- [ ] **Step 4: Split-Loop einbauen**

In `generateSeedData` den `for (const platform of PLATFORMS)`-Block (aktuell Zeilen 45-51) ersetzen durch:

```ts
    for (const platform of PLATFORMS) {
      const impressions = Math.round((30_000 + r() * 20_000) * trend);
      const spend = Math.round((150 + r() * 120) * trend);
      const clicks = Math.round(impressions * (0.01 + r() * 0.01));
      const conversions = Math.round(clicks * (0.03 + r() * 0.02));
      const convValue = conversions * (60 + r() * 40);
      const camps = DEMO_CAMPAIGNS[platform];
      const w = camps.map((c) => c.weight);
      const sp = splitTotal(spend, w, true);
      const im = splitTotal(impressions, w, true);
      const cl = splitTotal(clicks, w, true);
      const cv = splitTotal(conversions, w, true);
      const vv = splitTotal(convValue, w, false);
      camps.forEach((c, k) => {
        adSpend.push({ date, platform, spend: sp[k], impressions: im[k], clicks: cl[k],
          conversions: cv[k], convValue: vv[k], campaignId: c.id, campaignName: c.name });
      });
    }
```

(Wichtig: die fünf `r()`-Aufrufe in gleicher Reihenfolge belassen — so bleiben die nachfolgenden Zufallswerte, z. B. subscribers, deterministisch unverändert.)

- [ ] **Step 5: Tests laufen lassen — müssen bestehen**

Run: `npx vitest run tests/connectors/seed.test.ts`
Expected: PASS (alle, inkl. bestehender Determinismus-Tests).

- [ ] **Step 6: Commit**

```bash
git add src/connectors/seed/generator.ts tests/connectors/seed.test.ts
git commit -m "feat(kampagnen): Seed-Generator splittet Plattform-Spend verlustfrei auf Demo-Kampagnen"
```

---

### Task 5: Kampagnenspalten durch die DB-Schicht ziehen

**Files:**
- Modify: `db/schema.sql:495` (ALTER ad_spend — nach dem is_demo-ALTER)
- Modify: `src/lib/demo-ads.ts:21-32` (INSERT-Tupel + ON CONFLICT)
- Modify: `src/kpi/repository.ts:14` (loadDataset-Select um Kampagnenfelder)

**Interfaces:**
- Consumes: `AdSpend.campaignId`/`campaignName` (Task 1), Seed-Ausgabe (Task 4).
- Produces: `ad_spend` hat `campaign_id TEXT NOT NULL DEFAULT '__account__'` + `campaign_name TEXT`, PK `(date, platform, campaign_id)`; `loadDataset` liefert `campaignId`/`campaignName` mit.

- [ ] **Step 1: Schema-Migration ergänzen**

In `db/schema.sql` direkt nach der Zeile `ALTER TABLE ad_spend ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false;` (Zeile 496) einfügen:

```sql
-- Kampagnenebene (Phase 3): ad_spend wird kampagnen-granular. Bestehende und
-- nicht zugeordnete Zeilen tragen '__account__' → PK bleibt eindeutig, Summen
-- (Global-KPIs) bleiben unverändert.
ALTER TABLE ad_spend ADD COLUMN IF NOT EXISTS campaign_id   TEXT NOT NULL DEFAULT '__account__';
ALTER TABLE ad_spend ADD COLUMN IF NOT EXISTS campaign_name TEXT;
ALTER TABLE ad_spend DROP CONSTRAINT IF EXISTS ad_spend_pkey;
ALTER TABLE ad_spend ADD PRIMARY KEY (date, platform, campaign_id);
```

- [ ] **Step 2: Demo-INSERT auf Kampagnenspalten umstellen**

In `src/lib/demo-ads.ts` den Block Zeilen 20-32 ersetzen durch:

```ts
    for (let i = 0; i < adSpend.length; i += CHUNK) {
      const part = adSpend.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const tuples = part.map((a, j) => {
        const b = j * 9;
        values.push(a.date, a.platform, a.spend, a.impressions, a.clicks, a.conversions, a.convValue, a.campaignId, a.campaignName);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},true)`;
      });
      await client.query(
        `INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value, campaign_id, campaign_name, is_demo)
         VALUES ${tuples.join(',')}
         ON CONFLICT (date, platform, campaign_id) DO NOTHING`,
        values,
      );
    }
```

- [ ] **Step 3: loadDataset-Select erweitern**

In `src/kpi/repository.ts` die `ad_spend`-Select-Zeile (Zeile 14) ersetzen durch:

```ts
    supabase.from('ad_spend').select('date, platform, spend, impressions, clicks, conversions, convValue:conv_value, campaignId:campaign_id, campaignName:campaign_name'),
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: keine Fehler (die neuen optionalen Felder passen zu `AdSpend`; `a.campaignName` kann `undefined` sein → als NULL eingefügt).

- [ ] **Step 5: Bestehende Unit-Tests laufen lassen**

Run: `npx vitest run tests/connectors/seed.test.ts tests/kpi/campaigns.test.ts`
Expected: PASS. (DB-gebundene Tests wie `tests/lib/demo-ads.test.ts` / `tests/db/**` laufen erst gegen die Datenbank auf der VPS — die 16 RLS-Fehler auf diesem Host sind laut Projektnotiz erwartet, kein Regressionssignal.)

- [ ] **Step 6: Commit**

```bash
git add db/schema.sql src/lib/demo-ads.ts src/kpi/repository.ts
git commit -m "feat(kampagnen): campaign_id/campaign_name durch Schema, Demo-Insert und loadDataset"
```

---

### Task 6: Global↔Kampagne-Selektor + Dashboard-Verzweigung

**Files:**
- Create: `src/components/CampaignSelector.tsx`
- Modify: `src/app/(shell)/verkauf/dashboard/page.tsx` (Selektor im Header, Verzweigung)

**Interfaces:**
- Consumes: `CampaignSummary`, `listCampaigns`, `campaignKpis` (Tasks 2/3), `PHASE_META` aus `@/kpi/index`, `inRange` aus `@/kpi/helpers`.
- Produces: `CampaignSelector`-Client-Component; Dashboard rendert bei `?campaign=<id>` die Detailsicht (Task 7) statt der 4 Spalten.

- [ ] **Step 1: `CampaignSelector` anlegen**

`src/components/CampaignSelector.tsx`:

```tsx
'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CampaignSummary } from '@/kpi/campaigns';
import { PHASE_META } from '@/kpi/index';
import type { Phase } from '@/kpi/types';

const STAGES: Phase[] = ['see', 'think', 'do', 'care'];

export function CampaignSelector(
  { campaigns, active, basePath }:
  { campaigns: CampaignSummary[]; active?: string; basePath: string },
) {
  const router = useRouter();
  const params = useSearchParams();

  const go = (campaign: string) => {
    const q = new URLSearchParams(params.toString());
    if (campaign === '') q.delete('campaign');
    else q.set('campaign', campaign);
    router.push(`${basePath}?${q.toString()}`);
  };

  const byStage = (s: Phase | null) => campaigns.filter((c) => c.stage === s);

  return (
    <select
      aria-label="Ansicht: Global oder Kampagne"
      value={active ?? ''}
      onChange={(e) => go(e.target.value)}
      className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100"
    >
      <option value="">Global (alle Kampagnen)</option>
      {STAGES.map((s) => {
        const items = byStage(s);
        if (!items.length) return null;
        return (
          <optgroup key={s} label={PHASE_META[s].title}>
            {items.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </optgroup>
        );
      })}
      {byStage(null).length > 0 && (
        <optgroup label="Unzugeordnet">
          {byStage(null).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </optgroup>
      )}
    </select>
  );
}
```

- [ ] **Step 2: Dashboard verdrahten**

`src/app/(shell)/verkauf/dashboard/page.tsx` vollständig ersetzen durch:

```tsx
import { loadDataset } from '@/kpi/repository';
import { computeKpis, previousRange } from '@/kpi/index';
import { resolveRange } from '@/lib/range';
import { ecomSalesFacts, marginTotals } from '@/verkauf/repository';
import { adPlatformEfficiency } from '@/verkauf/marketing';
import { PhaseColumn } from '@/components/PhaseColumn';
import { Filters } from '@/components/Filters';
import { MarketingMargin } from '@/components/MarketingMargin';
import { CampaignSelector } from '@/components/CampaignSelector';
import { CampaignDetail } from '@/components/CampaignDetail';
import { listCampaigns, campaignKpis } from '@/kpi/campaigns';
import { inRange } from '@/kpi/helpers';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export default async function VerkaufDashboardPage({ searchParams }:
  { searchParams: { days?: string; start?: string; end?: string; campaign?: string } }) {
  const end = new Date().toISOString().slice(0, 10);
  const { range } = resolveRange(searchParams.days, end, { start: searchParams.start, end: searchParams.end });
  const supabase = createClient();
  const [dataset, factsCurrent, factsPrevious, marginCur, marginPrev] = await Promise.all([
    loadDataset(supabase),
    ecomSalesFacts(range),
    ecomSalesFacts(previousRange(range)),
    marginTotals(range),
    marginTotals(previousRange(range)),
  ]);
  const phases = computeKpis(dataset, range, { current: factsCurrent, previous: factsPrevious });
  const efficiency = adPlatformEfficiency(
    dataset.adSpend.filter((a) => a.date >= range.start && a.date <= range.end));

  const campaigns = listCampaigns(dataset.adSpend, range);
  const selected = searchParams.campaign
    ? campaigns.find((c) => c.id === searchParams.campaign)
    : undefined;

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-bold tracking-tight">Verkauf · E-Commerce</h2>
          <CampaignSelector campaigns={campaigns} active={searchParams.campaign} basePath="/verkauf/dashboard" />
        </div>
        <Filters range={range} basePath="/verkauf/dashboard" />
      </header>
      {selected ? (
        <CampaignDetail
          summary={selected}
          kpis={campaignKpis(
            dataset.adSpend.filter((a) => a.campaignId === selected.id && inRange(a.date, range)),
            selected.stage,
          )}
        />
      ) : (
        <>
          <MarketingMargin current={marginCur} previous={marginPrev} efficiency={efficiency} />
          <div className="mt-6 flex gap-4">
            {phases.map((p) => <PhaseColumn key={p.phase} phase={p} />)}
          </div>
        </>
      )}
    </div>
  );
}
```

(Bekannte, akzeptierte Slice-1-Grenze: Ein Klick auf einen Zeitraum-Button in `Filters` setzt `?campaign` zurück auf Global, weil `Filters` die URL neu aufbaut. Für Slice 1 in Ordnung — wird in der Doku erwähnt.)

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: Fehler nur wegen des noch fehlenden `CampaignDetail`-Moduls (in Task 7 angelegt) — sonst keine. Falls du Task 7 vor dem Typecheck ziehen willst, ist auch das ok.

- [ ] **Step 4: Commit**

```bash
git add src/components/CampaignSelector.tsx src/app/\(shell\)/verkauf/dashboard/page.tsx
git commit -m "feat(kampagnen): Global-Kampagne-Selektor + Dashboard-Verzweigung"
```

---

### Task 7: Kampagnen-Detailsicht (Kopfzeile + Stage-Spalte + Hinweis)

**Files:**
- Create: `src/components/CampaignDetail.tsx`
- Test: `tests/components/campaign-detail.test.tsx`

**Interfaces:**
- Consumes: `CampaignSummary`, `Kpi`, `PHASE_META`, `formatDeDate`, `KpiCard`, `campaignKpis` (im Test).
- Produces: `CampaignDetail({ summary: CampaignSummary; kpis: Kpi[] })` (Server Component).

- [ ] **Step 1: Failing test schreiben**

`tests/components/campaign-detail.test.tsx`:

```tsx
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { CampaignDetail } from '@/components/CampaignDetail';
import { campaignKpis, type CampaignSummary } from '@/kpi/campaigns';

afterEach(cleanup);

const summary: CampaignSummary = {
  id: 'm-retargeting', name: 'Retargeting_DPA', platform: 'meta_ads', stage: 'do',
  spend: 1200, impressions: 50000, clicks: 800, firstDate: '2026-01-01', lastDate: '2026-01-31',
};

describe('CampaignDetail', () => {
  it('zeigt Name, Stage, Spend, ROAS und den Attributions-Hinweis', () => {
    const rows = [{ date: '2026-01-10', platform: 'meta_ads' as const, spend: 1200,
      impressions: 50000, clicks: 800, conversions: 40, convValue: 3600,
      campaignId: 'm-retargeting', campaignName: 'Retargeting_DPA' }];
    render(<CampaignDetail summary={summary} kpis={campaignKpis(rows, 'do')} />);
    expect(screen.getByText('Retargeting_DPA')).toBeTruthy();
    expect(screen.getByText('DO')).toBeTruthy();
    expect(screen.getByText('ROAS')).toBeTruthy();
    expect(screen.getByText(/nicht kampagnen-attribuiert/)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Test laufen lassen — muss fehlschlagen**

Run: `npx vitest run tests/components/campaign-detail.test.tsx`
Expected: FAIL („Cannot find module '@/components/CampaignDetail'").

- [ ] **Step 3: `CampaignDetail` implementieren**

`src/components/CampaignDetail.tsx`:

```tsx
import type { CampaignSummary } from '@/kpi/campaigns';
import type { Kpi } from '@/kpi/types';
import { PHASE_META } from '@/kpi/index';
import { formatDeDate } from '@/lib/dates';
import { KpiCard } from './KpiCard';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-300 bg-neutral-100 p-3 dark:border-neutral-700 dark:bg-neutral-800/40">
      <div className="anno text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{value}</div>
    </div>
  );
}

export function CampaignDetail({ summary, kpis }: { summary: CampaignSummary; kpis: Kpi[] }) {
  const stageTitle = summary.stage ? PHASE_META[summary.stage].title : 'Unzugeordnet';
  const ctr = summary.impressions ? (summary.clicks / summary.impressions) * 100 : null;
  const [hero, ...rest] = kpis;

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{summary.name}</h3>
        <span className="anno rounded bg-brand/10 px-2 py-0.5 text-brand">{stageTitle}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Spend" value={`${summary.spend.toLocaleString('de-DE')} €`} />
        <Stat label="Laufzeit" value={`${formatDeDate(summary.firstDate)} – ${formatDeDate(summary.lastDate)}`} />
        <Stat label="Impressions" value={summary.impressions.toLocaleString('de-DE')} />
        <Stat label="Klicks" value={summary.clicks.toLocaleString('de-DE')} />
        <Stat label="CTR" value={ctr === null ? '—' : `${ctr.toFixed(2)} %`} />
      </div>
      <p className="anno mt-4 text-neutral-500 dark:text-neutral-400">{stageTitle} · Ad-Performance dieser Kampagne</p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-md">
        {hero && <KpiCard kpi={hero} hero />}
        {rest.map((k) => <KpiCard key={k.key} kpi={k} />)}
      </div>
      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
        Hinweis: Umsatz-, Conversion-Rate- und CLV-Kennzahlen sind nicht kampagnen-attribuiert
        und erscheinen nur in der Global-Ansicht.
      </p>
    </div>
  );
}
```

- [ ] **Step 4: Test laufen lassen — muss bestehen**

Run: `npx vitest run tests/components/campaign-detail.test.tsx`
Expected: PASS.

- [ ] **Step 5: Voll-Typecheck (jetzt ist CampaignDetail vorhanden)**

Run: `npx tsc --noEmit`
Expected: keine Fehler.

- [ ] **Step 6: Commit**

```bash
git add src/components/CampaignDetail.tsx tests/components/campaign-detail.test.tsx
git commit -m "feat(kampagnen): Kampagnen-Detailsicht mit Kopfzeile, Stage-Spalte und Attributions-Hinweis"
```

---

### Task 8: Hilfe & Datenmodell dokumentieren

**Files:**
- Modify: `src/lib/help/content.ts` (Abschnitt in der `verkauf`-Seite; Note in der `datenmodell`-Seite)
- Test: `tests/lib/help-content.test.ts` (muss grün bleiben — kein neuer Code, nur Ausführung)

**Interfaces:**
- Consumes: bestehende `DocPage`/`DocSection`/`DocBlock`-Struktur.
- Produces: dokumentierte Kampagnen-Ansicht inkl. Namensregel-Tabelle; `ad_spend`-Kampagnenspalten im Datenmodell.

- [ ] **Step 1: Kampagnen-Abschnitt in die `verkauf`-Hilfeseite einfügen**

In `src/lib/help/content.ts`, in der `verkauf`-Seite (`slug: 'verkauf'`) als **neuen letzten Eintrag** im `sections`-Array (direkt nach dem Abschnitt „Kosten & Deckungsbeitrag", vor dem schließenden `],` der Seite) einfügen:

```ts
      {
        heading: 'STDC-Dashboard & Kampagnen-Ansicht',
        blocks: [
          { type: 'p', text: 'Unter Verkauf → Dashboard liegen die Marketing-KPIs nach dem STDC-Modell (See/Think/Do/Care). Über den Umschalter „Global ↔ Kampagne" oben lässt sich von der Gesamtsicht auf eine einzelne Kampagne wechseln.' },
          { type: 'p', text: 'Jede Kampagne wird genau einer Ziel-Stage zugeordnet — abgeleitet aus ihrem Namen. Die Kampagnen-Detailsicht zeigt nur ad-native Kennzahlen (Spend, Impressions, CPM, Klicks, CTR, ROAS, CAC, Conversion-Wert). Umsatz-, Conversion-Rate- und CLV-Kennzahlen sind nicht kampagnen-attribuiert und bleiben der Global-Ansicht vorbehalten.' },
          { type: 'table', head: ['Kampagnenname enthält', 'Stage'], rows: [
            ['Prospecting, Awareness, Video', 'SEE (Awareness)'],
            ['Consideration, Traffic', 'THINK (Consideration)'],
            ['Retargeting, Conversion, Sales', 'DO (Conversion)'],
            ['Newsletter, Reactivation, Loyalty', 'CARE (Loyalty)'],
          ] },
          { type: 'note', text: 'Greift keine Regel, erscheint die Kampagne unter „Unzugeordnet". Benenne Kampagnen nach dieser Konvention, damit sie automatisch der richtigen Stage zugeordnet werden. Der Zeitraum-Umschalter setzt die Ansicht auf Global zurück.' },
        ],
      },
```

- [ ] **Step 2: `ad_spend`-Kampagnenspalten im Datenmodell dokumentieren**

In `src/lib/help/content.ts`, in der `datenmodell`-Seite (`slug: 'datenmodell'`) als **neuen letzten Eintrag** im `sections`-Array (nach dem Abschnitt „Kosten (order_costs, channel_costs)") einfügen:

```ts
      {
        heading: 'Marketing (ad_spend)',
        blocks: [
          { type: 'p', text: 'ad_spend hält die täglichen Ad-Kennzahlen je Plattform und Kampagne (Meta/Google/TikTok). Seit der Kampagnenebene ist die Tabelle kampagnen-granular.' },
          { type: 'table', head: ['Feld', 'Zweck'], rows: [
            ['date, platform', 'Tag + Ad-Plattform'],
            ['campaign_id', 'Kampagnen-ID (Teil des Primärschlüssels; „__account__" für nicht zugeordnete Zeilen)'],
            ['campaign_name', 'Kampagnenname — Basis der Stage-Ableitung (siehe Modul-Hilfe Verkauf)'],
            ['spend, impressions, clicks, conversions, conv_value', 'Kennzahlen; Summe je (date, platform) entspricht dem Plattform-Tageswert'],
            ['is_demo', 'markiert Demo-Daten (über Einstellungen ein/ausschaltbar)'],
          ] },
        ],
      },
```

- [ ] **Step 3: Registry-/Content-Test laufen lassen**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS (Struktur unverändert gültig, jede App hat weiterhin eine Hilfeseite).

- [ ] **Step 4: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(kampagnen): Kampagnen-Ansicht + Namensregeln in Hilfe und Datenmodell"
```

---

## Abschluss-Verifikation (nach allen Tasks)

- [ ] **Voller Testlauf:** `npx vitest run` — grün (bekannte DB/RLS-Fehler auf diesem Host ignorieren, siehe Projektnotiz).
- [ ] **Typecheck:** `npx tsc --noEmit` — keine Fehler.
- [ ] **Deploy auf die VPS** (nicht lokal — Projekt-CLAUDE.md): auf `root@194.164.204.249` bauen/migrieren (führt die `ad_spend`-ALTERs aus) und Demo-Ads bei Bedarf neu aktivieren (schreibt die Kampagnen-Zeilen).
- [ ] **Browser-Durchklick (selbst, vor Handoff):**
  - Dashboard Global — Zahlen unverändert gegenüber vorher (Invariante).
  - Selektor öffnen — Kampagnen nach Stage gruppiert; eine DO-Kampagne wählen → Kopfzeile (Spend/Laufzeit/Impr/Klicks/CTR) + ROAS/CAC/Conversions/Conv-Wert + Hinweis-Chip.
  - Eine SEE-Kampagne wählen → Impressions/CPM/Klicks/CTR.
  - Demo-Toggle in Einstellungen aus → echte Daten unter „Unzugeordnet"; wieder an → Demo-Kampagnen zurück.
  - Dark-Mode prüfen.

## Self-Review (gegen die Spec)

- **Spec §1 Datenmodell + Stage-Ableitung** → Tasks 1, 5. ✓
- **Spec §2 Navigation/UI (Selektor, Detailsicht, Stage-Spalte, Hinweis, Übersicht im Dropdown)** → Tasks 6, 7. ✓
- **Spec §3 Demo-Daten schaltbar** → Tasks 4, 5. ✓
- **Spec §4 Repository-Helfer (listCampaigns, campaignKpis)** → Tasks 2, 3, 5. ✓
- **Spec Tests (Stage, listCampaigns, campaignKpis, Invarianz)** → Tasks 1-4 (Invarianz via `splitTotal`-Exaktheit + Seed-Test). ✓
- **Spec Doku (Hilfe-Namensregeln, Datenmodell)** → Task 8. ✓
- Typkonsistenz `campaignStage`/`listCampaigns`/`campaignKpis`/`CampaignSummary`/`splitTotal` über Tasks 1-7 geprüft — Signaturen stimmen überein. ✓
- Keine Platzhalter; jeder Code-Step enthält den vollständigen Code. ✓
