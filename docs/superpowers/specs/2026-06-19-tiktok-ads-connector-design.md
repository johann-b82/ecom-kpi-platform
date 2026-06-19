# TikTok-Ads-Connector — Design-Spec

**Datum:** 2026-06-19
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Baut auf:** KPI-Plattform V1 + Shopware + GA4 + Klaviyo + Meta — Roadmap-Schritt 6 (Ads, Teil 2/3)

## Ziel

Werbedaten aus der TikTok Marketing API (Reporting) über einen On-Demand-CLI-Sync
in `ad_spend` (platform='tiktok_ads') und `daily_metrics` `video_views`
(source='tiktok_ads') laden, sodass SEE (Impressions, CPM, Video Views) und DO
(ROAS, CAC) auch TikTok-Zahlen enthalten. Engine, API und UI bleiben unverändert.

## Voraussetzungen / Kontext

- **Kein Live-Zugang aktuell** → gegen die API-Spezifikation bauen, mit
  aufgezeichneten Antworten testen; Live-Verifikation aufgeschoben.
- Auth: **Access-Token** im Header `Access-Token: <TIKTOK_ACCESS_TOKEN>` (NICHT Bearer).
- Sync-Modell: **On-Demand-CLI** `npm run sync:tiktok [--days N]`, Default **180**.
- Schreibt **nur** TikTok-Quellen: `ad_spend` `platform='tiktok_ads'` +
  `daily_metrics` `source='tiktok_ads'`. **Kein Schema-Change, kein Scheduler,
  keine neue Dependency.**
- API-Version fest: `v1.3`. Basis `https://business-api.tiktok.com`.

## Architektur & Datenfluss

```
npm run sync:tiktok [--days N]   (Default 180)
   ├─ 1. Auth: Header Access-Token: <TIKTOK_ACCESS_TOKEN>
   ├─ 2. fetch: GET /open_api/v1.3/report/integrated/get/
   │            ?advertiser_id&report_type=BASIC&data_level=AUCTION_ADVERTISER
   │            &dimensions=["stat_time_day"]&metrics=[…]&start_date&end_date&page&page_size
   │            → eine Zeile pro Tag (Paginierung via page/page_info.total_page)
   ├─ 3. normalize: Tageszeile → ad_spend[] (platform='tiktok_ads') + daily_metrics[] (video_views)
   └─ 4. write: TRANSAKTION → DELETE ad_spend WHERE platform='tiktok_ads';
                              DELETE daily_metrics WHERE source='tiktok_ads';
                              gebündelte Inserts in beide Tabellen
```

Folgt dem `Connector`-Muster (wie Meta), **befüllt zwei Tabellen** in einer
Transaktion.

### Neue Dateien
- `src/connectors/tiktok/client.ts` — Auth + Report-Fetch inkl. Paginierung + Body-`code`-Fehlerprüfung.
- `src/connectors/tiktok/connector.ts` — `normalizeReport(rows, opts): CanonicalDataset`.
- `src/connectors/tiktok/write.ts` — `writeTikTokAds(data)`: transaktionaler Replace beider TikTok-Quellen.
- `scripts/sync-tiktok.ts` — CLI mit `--days`.
- `.env.example` + `package.json`-Script `sync:tiktok`.
- Env: `TIKTOK_ACCESS_TOKEN`, `TIKTOK_ADVERTISER_ID`, optional `TIKTOK_VALUE_METRIC` (Default `total_complete_payment`), `TIKTOK_VIDEO_METRIC` (Default `video_play_actions`).

## Feld-Mapping (TikTok Report → kanonisch)

Jede Tageszeile: `dimensions.stat_time_day` + `metrics.{…}`. Alle Zahlen via
`Number()` (TikTok liefert Strings).

### `ad_spend` (platform='tiktok_ads')
| Feld | TikTok-Quelle |
|---|---|
| `date` | `dimensions.stat_time_day` → `YYYY-MM-DD` (`[0:10]`) |
| `platform` | `'tiktok_ads'` |
| `spend` | `metrics.spend` |
| `impressions` | `metrics.impressions` |
| `clicks` | `metrics.clicks` |
| `conversions` | `metrics.conversion` |
| `conv_value` | `metrics[<TIKTOK_VALUE_METRIC>]` (Default `total_complete_payment`), sonst 0 |

### `daily_metrics` (source='tiktok_ads')
| `metric_key` | TikTok-Quelle |
|---|---|
| `video_views` | `metrics[<TIKTOK_VIDEO_METRIC>]` (Default `video_play_actions`), sonst 0 |

Angefragte Metriken: `spend, impressions, clicks, conversion, <TIKTOK_VALUE_METRIC>, <TIKTOK_VIDEO_METRIC>`.

### Entscheidungen
1. `conversions` ← `conversion`; `conv_value` ← konfigurierbare Metrik
   (`TIKTOK_VALUE_METRIC`, Default `total_complete_payment`).
2. `video_views` ← konfigurierbare Metrik (`TIKTOK_VIDEO_METRIC`, Default
   `video_play_actions`).
3. Metriknamen per Env überschreibbar (Konten/Versionen variieren); der Live-Lauf
   bestätigt sie — unbekannte Metrik → TikTok-Fehler (`code !== 0`),
   selbstdiagnostisch.

## Schreiben (Transaktion, selektiver Replace beider Tabellen)

```sql
BEGIN;
  DELETE FROM ad_spend       WHERE platform = 'tiktok_ads';
  DELETE FROM daily_metrics  WHERE source   = 'tiktok_ads';
  INSERT ... (ad_spend)        -- gebündelte Multi-Row-Inserts
  INSERT ... (daily_metrics)   -- video_views
COMMIT;
```
Atomar, idempotent. **Bei 0 ad_spend-Zeilen abbrechen ohne DELETE.**

## Fehlerbehandlung

- **TikTok-Eigenheit:** Antwort meist `HTTP 200` mit `{ code, message, data }`.
  **`code !== 0` = Fehler** → Status/`code` + `message` ausgeben, Exit ≠ 0.
  Zusätzlich `res.ok` prüfen (echte HTTP-Fehler).
- Leere Liste (0 Zeilen): sauber abbrechen ohne DELETE.
- Paginierung: `page` ab 1, `page_size=1000`; weiter, solange `page < page_info.total_page`.

## Tests & Live-Verifikation

- **Unit (TDD, ohne Netz):** `normalizeReport()` gegen aufgezeichnete Report-Liste
  (2–3 Tage) — `stat_time_day`-Mapping, `Number()`-Cast, conversion/value/
  video_views (fehlend → 0), konfigurierbare Metriknamen, `platform`/`source`.
- **Client-Unit:** Request-Aufbau (report-Pfad, Params, `Access-Token`-Header),
  Paginierung über `page_info.total_page`, **Body-`code`-Fehler** (`code !== 0`)
  gegen gemockten `fetch`.
- **Write-Integration:** schreibt TikTok-Zeilen in beide Tabellen; prüft, dass
  Meta/Google-`ad_spend` und Nicht-TikTok-`daily_metrics` sowie orders/customers/
  subscribers unberührt bleiben; 0-Zeilen-Abbruch.
- **Live-Verifikation (aufgeschoben):** echter `npm run sync:tiktok` →
  `/api/kpis` gegenchecken; Stichprobe Spend/Impressions ≈ TikTok Ads Manager.
  Häufiger Fehler: `code != 0` mit Token-/Permission-Meldung → Token/Advertiser
  prüfen, ggf. Value-/Video-Metriknamen anpassen, erneut syncen.
- **Secrets:** Token nur in `.env` (gitignored), nie committet.

## Scope-Grenze

Nur TikTok (`ad_spend` platform=tiktok_ads + `daily_metrics` video_views
source=tiktok_ads). Kein Schema-Change, kein Scheduler. Google Ads ist ein
separates Teilprojekt (3/3).
