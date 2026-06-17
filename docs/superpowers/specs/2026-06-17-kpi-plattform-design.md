# KPI-Plattform · SEE–THINK–DO–CARE — Design-Spec

**Datum:** 2026-06-17
**Status:** Genehmigt (Brainstorming abgeschlossen)

## Ziel

Eine Plattform, die E-Commerce-Kennzahlen entlang der Customer Journey
(SEE → THINK → DO → CARE) aus mehreren Quellsystemen zusammenführt und in einem
Dashboard auswertet — visuell und logisch an das KPI-Framework der Vorlage angelehnt.

## Angebundene Systeme (Zielbild)

| Kategorie | System |
|---|---|
| Shop | Shopware 6 (Admin API, OAuth) |
| Web-Analytics | Google Analytics 4 (Data API) |
| Ads | Google Ads, Meta Ads, TikTok Ads |
| E-Mail/CRM | Klaviyo |

**Start-Strategie:** Seed-Daten zuerst. Die Plattform wird mit realistischen
Beispieldaten gegen ein sauberes Datenmodell gebaut; Live-Connectoren docken
Connector für Connector an dasselbe Schema an, sobald Credentials vorliegen.

## Tech-Stack

Next.js + TypeScript (UI + API-Routes), Postgres als kanonische KPI-DB,
Tremor für KPI-Dashboard-Komponenten. Connectoren als TypeScript-Module.
Ein Repo, `docker-compose` (App + Postgres).

## Architektur & Datenfluss

```
Connectoren (Adapter)  →  Kanonische Daten-DB (Postgres)  →  KPI-Engine  →  Dashboard (Tremor)
Shopware/GA4/Ads/Klaviyo   facts + dims, schlankes Modell     reine Funktionen   SEE·THINK·DO·CARE
Seed-Generator ──────────▶ (schreibt dasselbe Schema)
```

**Prinzipien**
- **Connector = Adapter mit einheitlichem Interface:** holt Rohdaten → normalisiert
  ins kanonische Schema. Einzeln testbar, austauschbar.
- **Seed-Generator = nur ein weiterer Connector**, dessen `fetch` Beispieldaten
  erzeugt statt eine API zu rufen → Pipeline ist identisch zu später-live.
- **KPI-Engine = reine Funktionen** (kanonische Daten + Zeitraum → Kennzahlen),
  keine API-/DB-Logik vermischt → per TDD testbar.
- **Dashboard liest nur aggregierte KPIs**, gegliedert nach den vier Phasen.
- KPIs ohne verbundene Quelle zeigen ein **„N/A — Quelle nicht verbunden"-Badge**
  statt erfundener Werte.

## Kanonisches Datenmodell (Postgres)

| Tabelle | Zweck | Kernfelder |
|---|---|---|
| `daily_metrics` | Tagesaggregate je Quelle/Kanal (Long-Format) | `date, source, channel, metric_key, value` |
| `orders` | Bestellkopf | `order_id, customer_id, date, revenue, is_first_order` |
| `customers` | Kundenstamm | `customer_id, first_order_date, last_order_date, orders_count, total_revenue` |
| `ad_spend` | Werbekosten je Plattform/Tag | `date, platform, spend, impressions, clicks, conversions, conv_value` |
| `subscribers` | Newsletter/Klaviyo | `date, source, signups, unsubscribes, nps_score` |

`daily_metrics` ist Long-Format (`metric_key`/`value`), damit neue Roh-Metriken
ohne Schema-Migration aufgenommen werden können. Bestellungen/Kunden bekommen
eigene Tabellen wegen Joins/Kohorten.

## KPI-Definitionen je Phase

### SEE — Awareness
| KPI | Formel | Quelle |
|---|---|---|
| Impressions / Reichweite | Σ impressions | Ads |
| Video Views | Σ video_views | Meta/TikTok |
| CPM | spend / impressions × 1000 | Ads |
| Website-Traffic (gesamt) | Σ sessions | GA4 |
| Ad Recall / Brand Awareness | Meta Brand-Lift (sonst N/A) | Meta Ads |

### THINK — Consideration
| KPI | Formel | Quelle |
|---|---|---|
| Sessions | Σ sessions | GA4 |
| Seiten / Sitzung | pageviews / sessions | GA4 |
| Bounce Rate | bounced_sessions / sessions | GA4 |
| Wiederkehrende Besucher | returning_users / total_users | GA4 |
| Add-to-Cart-Rate | add_to_carts / sessions | GA4 |
| Newsletter-Anmeldungen | Σ signups | Klaviyo |

### DO — Conversion
| KPI | Formel | Quelle |
|---|---|---|
| Conversion Rate | orders / sessions | Shopware + GA4 |
| Warenkorbwert (AOV) | revenue / orders | Shopware |
| Umsatz / Revenue | Σ revenue | Shopware |
| ROAS | conv_value / ad_spend | Ads + Shopware |
| CAC | ad_spend / neue Kunden | Ads + Shopware |
| Warenkorbabbruchrate | 1 − (orders / checkouts_started) | GA4 + Shopware |

### CARE — Loyalty
| KPI | Formel | Quelle |
|---|---|---|
| Wiederkaufrate / Repeat Rate | Kunden mit ≥2 Bestellungen / alle Kunden | Shopware |
| Customer Lifetime Value (CLV) | Ø Umsatz/Kunde × Ø Bestellungen (Kohorte) | Shopware |
| Wiederkaufintervall | Ø Tage zwischen Bestellungen | Shopware |
| NPS / Zufriedenheit | Umfrage/Klaviyo (sonst N/A) | Klaviyo |
| Retention Rate | aktive Kunden Periode / Vorperiode | Shopware |
| Churn Rate | 1 − Retention | Shopware |

## Dashboard / UI

Spiegelt die Vorlage visuell: dunkles Theme, grüne Akzente, vier Phasen-Spalten,
Leserichtung links→rechts (Reichweite → Loyalität).

- **Funnel-Übersicht (eine Seite):** je Phase eine „Hero"-KPI groß, übrige KPIs
  kompakt; KPI-Karten (Tremor) mit Wert, Trendpfeil + Δ % vs. Vorperiode, Sparkline.
- **Globale Filter:** Zeitraum (heute / 7 / 30 / 90 Tage / custom) und
  Kanal-/Quellen-Filter — wirken auf alle Phasen.
- **Funnel-Verbindung:** dezente Übergänge zwischen Spalten („jede Phase zahlt
  auf die nächste ein").
- **Phasen-Detail (Drilldown):** Klick auf eine Phase öffnet Zeitreihen-Charts
  und Kanal-Breakdown (z. B. ROAS pro Ads-Plattform).
- **N/A-Badges** für nicht verbundene Quellen.

**Scope-Grenze V1 (bewusst):** eine Funnel-Übersicht + Phasen-Detailansicht.
Kein Login/Multi-User, kein Dashboard-Builder, kein Alerting (YAGNI).

## Connector-Muster

```ts
interface Connector {
  source: string;                            // "shopware" | "ga4" | "google_ads" | …
  fetch(range: DateRange): Promise<RawData>; // holt Rohdaten (live)
  normalize(raw: RawData): CanonicalRecords; // → kanonisches Schema
}
```

Der Seed-Generator implementiert dasselbe Interface; sein `fetch` erzeugt
realistische Beispieldaten.

## Inkrementelle Roadmap

1. **Fundament (= V1):** Postgres-Schema, KPI-Engine (alle Formeln, TDD),
   Seed-Generator, Dashboard-Übersicht + Drilldown — lauffähig mit Seed-Daten.
2. **Connector Shopware 6** (Umsatz, AOV, CR, Repeat, CLV, Churn).
3. **Connector GA4** (Sessions, Bounce, ATC, Traffic).
4. **Connector Klaviyo** (Newsletter, Retention-Signale).
5. **Connectoren Google / Meta / TikTok Ads** (Impressions, CPM, ROAS, CAC) —
   gleiches Muster, je ein Schritt.

Jeder Schritt ist für sich abgeschlossen und nutzbar.

## Testing & Docker

- **TDD** für die KPI-Engine: erst Test mit erwartetem Wert aus bekannten
  Seed-Daten, dann Formel. Connectoren: `normalize()` gegen aufgezeichnete
  Beispiel-Rohantworten getestet.
- **Docker:** `docker-compose up` startet App + Postgres; `seed`-Script befüllt
  die DB. Deploy/Verifikation lokal per Docker, Browser-Check der Übersicht.
