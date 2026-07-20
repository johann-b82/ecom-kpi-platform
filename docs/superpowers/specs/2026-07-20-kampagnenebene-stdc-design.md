# Kampagnenebene im STDC-Dashboard — Design (Slice 1)

**Datum:** 2026-07-20
**Status:** Entwurf zur Umsetzung
**Betrifft:** `src/kpi/`, `src/connectors/seed/`, `src/lib/demo-ads.ts`, `db/schema.sql`,
Dashboard `src/app/(shell)/verkauf/dashboard/`, `/hilfe`

## Ziel & Abgrenzung

Das STDC-Dashboard (See/Think/Do/Care, nach Kaushik) soll um eine **Kampagnen-Ansicht**
erweitert werden. Grundprinzip: Jede Kampagne wird **genau einer Ziel-Stage** zugeordnet
und primär in dieser Stage gemessen.

**Slice 1 misst ausschließlich Ad-Performance pro Kampagne** — also Kennzahlen, die
direkt aus den Ad-Plattform-Daten (`ad_spend`) einer Kampagne berechenbar sind. Umsatz-,
Conversion-Rate- und CLV-KPIs kommen aus WooCommerce/GA4-Sessions und sind **nicht**
kampagnen-attribuiert; sie bleiben der Global-Ansicht vorbehalten.

**Explizit nicht in Slice 1** (spätere Folge-Slices):
- Cross-Stage-Matrix (Bleed-/Spillover-Effekte)
- Attributionsmodell (Last-/First-Click, UTM→Bestellung)
- Live-Connector-Kampagnenabruf (Meta/Google/TikTok `level=campaign`)

**Datenquelle für Slice 1:** die bestehenden **Demo-/Seed-Daten**. Schema und Normalizer
werden so entworfen, dass Live-Connectors sie später nur noch befüllen müssen.

## Ausgangslage (Ist-Zustand)

- Dashboard ist eine Next.js/React-App (App Router), KPIs serverseitig in `src/kpi/`
  (`see.ts`/`think.ts`/`do.ts`/`care.ts`) über einen `CanonicalDataset` berechnet.
- `ad_spend` hat `PRIMARY KEY (date, platform)` — **keine Kampagnen-Dimension**.
- Meta/Google/TikTok-Connectors und der Seed-Generator schreiben je **eine Zeile pro
  Plattform/Tag** (z.B. `platform: 'meta_ads'`), Kampagnen kollabiert.
- Globale Ad-KPIs summieren bereits über `ad_spend` (`see.ts`, `verkauf/marketing.ts`).
- Demo-Ads sind über Einstellungen ein/ausschaltbar (`enableDemoAds`/`disableDemoAds`,
  `is_demo = true`).

## Entwurf

### 1. Datenmodell & Stage-Ableitung

**Schema (`db/schema.sql`):** `ad_spend` bekommt zwei Spalten und einen neuen PK.

```sql
ALTER TABLE ad_spend ADD COLUMN IF NOT EXISTS campaign_id   TEXT NOT NULL DEFAULT '__account__';
ALTER TABLE ad_spend ADD COLUMN IF NOT EXISTS campaign_name TEXT;
-- PK von (date, platform) auf (date, platform, campaign_id) umstellen.
```

- Zeilen werden **kampagnen-granular** statt plattform-aggregiert.
- `campaign_id`-Default `'__account__'` deckt Zeilen ohne Kampagnen-Zuordnung ab
  (z.B. echte Connector-Daten in Slice 1) → PK bleibt eindeutig, keine Altdaten-Migration
  nötig.
- **Invariante:** Die Summe der Kampagnenzeilen einer Plattform pro Tag = der bisherige
  Plattform-Tageswert. Dadurch bleibt die Global-Ansicht **unverändert korrekt**; an
  `see.ts`/`do.ts`/`marketing.ts` ist keine Änderung nötig.

**Stage-Ableitung** — reine Funktion in neuer Datei `src/kpi/campaigns.ts`:

```
campaignStage(name: string): Phase | null
```

Regelwerk (Präfix-/Enthält-Regeln, case-insensitive):

| Muster (Kampagnenname enthält) | Stage |
|--------------------------------|-------|
| `Prospecting`, `Awareness`, `Video` | `see` |
| `Consideration`, `Traffic` | `think` |
| `Retargeting`, `Conversion`, `Sales` | `do` |
| `Newsletter`, `Reactivation`, `Loyalty` | `care` |
| kein Treffer | `null` („unzugeordnet") |

Das Regelwerk ist eine einzelne Tabelle in `campaigns.ts`, leicht erweiterbar.

### 2. Navigation & UI

**Umschalter im Dashboard-Header** (`verkauf/dashboard/page.tsx`): Dropdown
„**Global** ↔ Kampagne" neben den bestehenden `Filters`. Zustand über URL-Param
`?campaign=<id>` (konsistent mit `?days`/`?start`/`?end`, server-gerendert).

**Global gewählt (Default):** heutiges Dashboard, unverändert.

**Kampagne gewählt:** Das 4-Spalten-Layout wird ersetzt durch eine fokussierte
Detailsicht:

1. **Kopf-Zeile** (die einzigen neuen Kennzahlen): Spend · Laufzeit (erster–letzter
   Datentag im Zeitraum) · Impressions · Clicks · CTR.
   *Bewusst nicht:* Frequency (braucht Reach/Unique — nicht gespeichert),
   Budget-Auslastung (kein Budget in den Daten). Werden nicht versprochen, solange die
   Datenquelle sie nicht hergibt.

2. **Eine Stage-Spalte** — die Ziel-Stage der Kampagne, gerendert wie eine `PhaseColumn`,
   mit **ad-nativen KPIs** (aus den `ad_spend`-Zeilen der Kampagne):
   - **SEE:** Impressions, CPM, Clicks, CTR
   - **THINK:** Clicks, CTR, CPC
   - **DO:** Conversions, ROAS (`conv_value/spend`), CAC (`spend/conversions`), Conv-Wert
   - **CARE:** Conversions, Conv-Wert (ad-seitig dünn — ehrlich als das, was vorliegt)

   Eigenes KPI-Set statt Wiederverwendung der globalen Stage-KPIs, weil letztere u.a.
   Conversion Rate & AOV aus WooCommerce/GA4 zeigen, die nicht kampagnen-attribuierbar
   sind.

3. **Hinweis-Chip:** „Umsatz-/Session-KPIs sind nicht kampagnen-attribuiert" — damit die
   Lücke nicht als Bug gelesen wird.

4. **Kampagnen-Selektor = Übersichtsliste:** Das Dropdown listet Kampagnen **gruppiert
   nach Stage** (SEE/THINK/DO/CARE + „unzugeordnet"), je mit Name, Spend, Status. Damit
   ist die „Kampagnenübersicht" ohne separate Seite mitgeliefert.

### 3. Demo-Daten (weiterhin über Einstellungen schaltbar)

Der Demo-Toggle in den Einstellungen bleibt **unverändert**. Demo-Kampagnen sind Teil der
Demo-Daten (`is_demo = true`).

- **Seed-Generator** (`src/connectors/seed/generator.ts`): pro Plattform 2–3 **benannte
  Kampagnen** nach Konvention (z.B. `Prospecting_Video` → SEE, `Retargeting_Q3` → DO,
  `Newsletter_Reactivation` → CARE). Der Plattform-Tagesbetrag wird **deterministisch**
  auf die Kampagnen aufgeteilt → Summe unverändert (schützt Invariante aus §1).
- **`demo-ads.ts`:** `INSERT`-Tupel bekommt `campaign_id`/`campaign_name`; `ON CONFLICT`
  wandert auf `(date, platform, campaign_id)`. `enableDemoAds`/`disableDemoAds` sonst
  unverändert.
- **Demo an** → Kampagnen-Dropdown zeigt die benannten Demo-Kampagnen.
- **Demo aus** → alle Demo-Zeilen weg; echte Connector-Daten tragen (in Slice 1) keinen
  Kampagnennamen → erscheinen unter „unzugeordnet". Konsistent, kein Fehlerzustand.

### 4. Repository-Helfer (`src/kpi/repository.ts` + `campaigns.ts`)

- `loadDataset` lädt zusätzlich `campaign_id`/`campaign_name`.
- `listCampaigns(adSpend, range)` → `{ id, name, platform, stage, spend, firstDate,
  lastDate }[]`, gruppierbar nach Stage — speist Dropdown **und** Übersicht.
- `campaignKpis(adSpendRows, stage)` → stage-passendes ad-natives Karten-Set aus den
  gefilterten Zeilen.

## Tests (Vitest, lokal, reine Funktionen — keine DB)

1. `campaignStage()` — jede Regel trifft + Fallback `null` bei keinem Treffer.
2. `listCampaigns()` — Gruppierung nach Stage, Spend-Summe je Kampagne, Laufzeit-Grenzen
   (firstDate/lastDate).
3. `campaignKpis()` — ROAS/CAC/CPM/CTR/CPC-Rechnung inkl. Division durch Null
   (→ nicht verfügbar statt Absturz/`Infinity`).
4. **Invarianz-Test:** Summe der Kampagnen-`spend` pro Plattform/Tag = alter
   Plattform-Tageswert (schützt die Global-Ansicht).

## Dokumentation (CLAUDE.md-Pflicht)

- `/hilfe` KPI-Seite (`src/lib/help/content.ts`): **Namensregel-Tabelle** aus §1 +
  Erklärung der Kampagnen-Ansicht (Global↔Kampagne, ad-native KPIs, warum Umsatz-KPIs
  fehlen).
- Admin-Seite `datenmodell`: neue `ad_spend`-Spalten `campaign_id`/`campaign_name`
  dokumentieren.
- Registry-Test `tests/lib/help-content.test.ts` bleibt grün (keine neue App).

## Verifikation vor Handoff

1. `npx vitest` grün (inkl. neuer Tests + Invarianz-Test).
2. Deploy auf die VPS (`root@194.164.204.249`, **nicht** lokal — Projekt-CLAUDE.md).
3. Im Browser selbst durchklicken: Global↔Kampagne-Dropdown, Detailsicht je Stage,
   Demo-Toggle an/aus.

## Offene Punkte für Folge-Slices

- Live-Connector-Kampagnenabruf (`level=campaign`) für Meta/Google/TikTok.
- Attributionsmodell (UTM→Bestellung) für voll-Funnel-KPIs pro Kampagne.
- Cross-Stage-Matrix für bewusst stage-übergreifende Kampagnen.
- Manuelle Übersteuerung des Stage-Tags (falls Namenskonvention nicht reicht).
