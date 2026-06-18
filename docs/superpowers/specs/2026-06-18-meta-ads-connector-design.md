# Meta-Ads-Connector — Design-Spec

**Datum:** 2026-06-18
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Baut auf:** KPI-Plattform V1 + Shopware + GA4 + Klaviyo — Roadmap-Schritt 5 (Ads, Teil 1/3)

## Kontext: Ads = drei Teilprojekte

Google/Meta/TikTok Ads sind unabhängige Connectoren mit völlig verschiedenen APIs.
Jede Plattform bekommt eigenes Spec → Plan → Umsetzung. **Diese Spec: Meta Ads
(zuerst).** TikTok und Google folgen später als eigene Teilprojekte.

## Ziel

Werbedaten aus der Meta Marketing API (Insights) über einen On-Demand-CLI-Sync
in `ad_spend` (Kosten/Impressions/Conversions) und `daily_metrics` `video_views`
laden, sodass SEE (Impressions, CPM, Video Views) und DO (ROAS, CAC) echte
Meta-Zahlen zeigen. Engine, API und UI bleiben unverändert.

## Voraussetzungen / Kontext

- **Kein Live-Zugang aktuell** → Connector gegen die Marketing-API-Spezifikation
  bauen, mit aufgezeichneten Antworten testen; Live-Verifikation aufgeschoben.
- Auth: **System-User-Access-Token** im Header `Authorization: Bearer <META_ACCESS_TOKEN>`.
- Sync-Modell: **On-Demand-CLI** `npm run sync:meta [--days N]`, Default **180**.
- Schreibt **nur** Meta-Quellen: `ad_spend` mit `platform='meta_ads'` und
  `daily_metrics` mit `source='meta_ads'`. Andere Quellen unberührt.
  **Kein Schema-Change. Kein Scheduler. Keine neue Dependency.**
- Graph-API-Version fest: `v21.0`.

## Architektur & Datenfluss

```
npm run sync:meta [--days N]   (Default 180)
   ├─ 1. Auth: Header Authorization: Bearer <META_ACCESS_TOKEN>
   ├─ 2. fetch: GET /v21.0/act_<META_AD_ACCOUNT_ID>/insights
   │            ?level=account&time_increment=1&time_range={since,until}
   │            &fields=spend,impressions,clicks,actions,action_values
   │            → eine Tageszeile je Tag (Paginierung via paging.next falls vorhanden)
   ├─ 3. normalize: Tageszeile → ad_spend[] (platform='meta_ads') + daily_metrics[] (video_views)
   └─ 4. write: TRANSAKTION → DELETE ad_spend WHERE platform='meta_ads';
                              DELETE daily_metrics WHERE source='meta_ads';
                              gebündelte Inserts in beide Tabellen
```

Folgt dem `Connector`-Muster, **befüllt aber zwei Tabellen** (`adSpend` +
`dailyMetrics` video_views) in einer Transaktion.

### Neue Dateien
- `src/connectors/meta/client.ts` — Auth + Insights-Fetch inkl. `paging.next`-Paginierung.
- `src/connectors/meta/connector.ts` — `normalizeInsights(rows, opts): CanonicalDataset`.
- `src/connectors/meta/write.ts` — `writeMetaAds(data)`: transaktionaler Replace beider Meta-Quellen.
- `scripts/sync-meta.ts` — CLI mit `--days`.
- `.env.example` + `package.json`-Script `sync:meta`.
- Env: `META_ACCESS_TOKEN`, `META_AD_ACCOUNT_ID` (numerisch, ergibt `act_<id>`), optional `META_PURCHASE_ACTION_TYPE` (Default `purchase`).

## Feld-Mapping (Meta Insights → kanonisch)

Meta liefert pro Tag eine Zeile mit `date_start` und `actions`/`action_values`
als Listen von `{action_type, value}`. Alle Zahlen via `Number()` (Meta liefert
Strings).

### `ad_spend` (platform='meta_ads')
| Feld | Meta-Quelle |
|---|---|
| `date` | `date_start` → `YYYY-MM-DD` |
| `platform` | `'meta_ads'` |
| `spend` | `spend` |
| `impressions` | `impressions` |
| `clicks` | `clicks` |
| `conversions` | `actions[].value` mit `action_type = <META_PURCHASE_ACTION_TYPE>` (Default `purchase`), sonst 0 |
| `conv_value` | `action_values[].value` mit demselben `action_type`, sonst 0 |

### `daily_metrics` (source='meta_ads')
| `metric_key` | Meta-Quelle |
|---|---|
| `video_views` | `actions[].value` mit `action_type='video_view'` (3-Sek-Views), sonst 0 |

### Entscheidungen
1. Conversions/Conv-Value aus der `purchase`-Action; `action_type` per Env
   überschreibbar (`META_PURCHASE_ACTION_TYPE`, Default `purchase`; manche Konten
   nutzen `offsite_conversion.fb_pixel_purchase`).
2. Video Views = `video_view` (3-Sek-Views), nicht ThruPlay.

## Schreiben (Transaktion, selektiver Replace beider Tabellen)

```sql
BEGIN;
  DELETE FROM ad_spend       WHERE platform = 'meta_ads';
  DELETE FROM daily_metrics  WHERE source   = 'meta_ads';
  INSERT ... (ad_spend)        -- gebündelte Multi-Row-Inserts
  INSERT ... (daily_metrics)   -- video_views
COMMIT;
```
Atomar, idempotent. **Bei 0 ad_spend-Zeilen abbrechen ohne DELETE** (kein
versehentliches Leeren bei API-Problemen).

## Fehlerbehandlung

- Auth/HTTP-Fehler (`190` = ungültiges/abgelaufenes Token, `200`/`10` = fehlende
  Permissions): Status + Meta-`error.message`, Exit ≠ 0.
- Leere Insights (0 Zeilen): sauber abbrechen ohne DELETE.
- Paginierung: `paging.next` folgen, bis keine weitere Seite.

## Tests & Live-Verifikation

- **Unit (TDD, ohne Netz):** `normalizeInsights()` gegen aufgezeichnete
  Insights-Antwort (2–3 Tage) — `date_start`-Mapping, `Number()`-Cast,
  Extraktion von `purchase` aus `actions`/`action_values` (fehlend → 0),
  `video_view` → `daily_metrics`, korrekte `platform`/`source`.
- **Client-Unit:** Insights-Request-Aufbau (act-Pfad, fields, time_range,
  time_increment, Bearer-Header) + `paging.next`-Schleife gegen gemockten `fetch`;
  HTTP-Fehler.
- **Write-Integration:** schreibt Meta-Zeilen in beide Tabellen; prüft, dass
  Google/TikTok-`ad_spend` und Nicht-Meta-`daily_metrics` sowie orders/customers/
  subscribers unberührt bleiben; 0-Zeilen-Abbruch.
- **Live-Verifikation (aufgeschoben):** echter `npm run sync:meta` →
  `/api/kpis` gegenchecken: SEE Impressions/CPM/Video Views, DO ROAS/CAC echt.
  Stichprobe: Spend/Impressions im Dashboard ≈ Meta Ads Manager im selben Zeitraum.
- **Secrets:** Token nur in `.env` (gitignored), nie committet.

## Scope-Grenze

Nur Meta (`ad_spend` platform=meta_ads + `daily_metrics` video_views source=meta_ads).
Kein Schema-Change, kein Scheduler. TikTok und Google Ads sind separate Teilprojekte.
Ad Recall / Brand Awareness (SEE) bleibt N/A (Brand-Lift nicht Teil dieser Spec).
