# Google-Ads-Connector — Design-Spec

**Datum:** 2026-06-19
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Baut auf:** KPI-Plattform V1 + Shopware + GA4 + Klaviyo + Meta + TikTok — Roadmap-Schritt 7 (Ads, Teil 3/3 — letzter Connector)

## Ziel

Werbedaten aus der Google Ads API (GAQL/searchStream) über einen On-Demand-CLI-Sync
in `ad_spend` (platform='google_ads') und `daily_metrics` `video_views`
(source='google_ads') laden, sodass SEE (Impressions, CPM, Video Views) und DO
(ROAS, CAC) auch Google-Zahlen enthalten. Engine, API und UI bleiben unverändert.

## Voraussetzungen / Kontext

- **Kein Live-Zugang aktuell** → gegen die API-Spezifikation bauen, mit
  aufgezeichneten Antworten testen; Live-Verifikation aufgeschoben.
- Auth (mehrteilig): **OAuth2 Refresh-Token-Grant** → Access-Token; Requests mit
  Headern `Authorization: Bearer <token>`, `developer-token: <DEV_TOKEN>`,
  optional `login-customer-id: <LOGIN_CUSTOMER_ID>` (Manager-Konten).
- Sync-Modell: **On-Demand-CLI** `npm run sync:google [--days N]`, Default **180**.
- Schreibt **nur** Google-Quellen: `ad_spend` `platform='google_ads'` +
  `daily_metrics` `source='google_ads'`. **Kein Schema-Change, kein Scheduler,
  keine neue Dependency.**
- API-Version fest: `v17`. Basis `https://googleads.googleapis.com`.

## Architektur & Datenfluss

```
npm run sync:google [--days N]   (Default 180)
   ├─ 1. Auth: POST https://oauth2.googleapis.com/token (grant_type=refresh_token, client_id, client_secret, refresh_token) → access_token
   ├─ 2. fetch: POST /v17/customers/<CUSTOMER_ID>/googleAds:searchStream
   │            Header: Authorization Bearer, developer-token, (login-customer-id)
   │            Body: { query: "<GAQL>" }  → Array von Chunks, je results[]
   ├─ 3. normalize: Zeile → ad_spend[] (platform='google_ads') + daily_metrics[] (video_views)
   └─ 4. write: TRANSAKTION → DELETE ad_spend WHERE platform='google_ads';
                              DELETE daily_metrics WHERE source='google_ads';
                              gebündelte Inserts in beide Tabellen
```

Folgt dem `Connector`-Muster, **befüllt zwei Tabellen** in einer Transaktion.
`searchStream` liefert alle Zeilen in einer gestreamten Antwort (mehrere Chunks
mit je `results[]`) → flach zusammenführen, **keine Paginierung**.

### Neue Dateien
- `src/connectors/google/client.ts` — OAuth-Token (Refresh-Grant) + `searchStream` per fetch.
- `src/connectors/google/connector.ts` — `normalizeRows(rows): CanonicalDataset`.
- `src/connectors/google/write.ts` — `writeGoogleAds(data)`: transaktionaler Replace beider Google-Quellen.
- `scripts/sync-google.ts` — CLI mit `--days`.
- `.env.example` + `package.json`-Script `sync:google`.
- Env: `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_REFRESH_TOKEN`, `GOOGLE_ADS_CUSTOMER_ID`, optional `GOOGLE_ADS_LOGIN_CUSTOMER_ID`.

## GAQL-Query

```
SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks,
       metrics.conversions, metrics.conversions_value, metrics.video_views
FROM customer
WHERE segments.date BETWEEN '<start>' AND '<end>'
```
`<start>` = `${days-1}` Tage vor heute, `<end>` = heute (ISO `YYYY-MM-DD`).

## Feld-Mapping (Google Ads → kanonisch)

`searchStream`-Antwort: Array von Chunks; jeder Chunk hat `results[]`, jede Zeile
`{ segments: { date }, metrics: { costMicros, impressions, clicks, conversions, conversionsValue, videoViews } }` (camelCase). Alle Zahlen via `Number()`.

### `ad_spend` (platform='google_ads')
| Feld | Google-Quelle |
|---|---|
| `date` | `segments.date` (`YYYY-MM-DD`) |
| `platform` | `'google_ads'` |
| `spend` | **`Number(metrics.costMicros) / 1_000_000`** (Micros → Währung) |
| `impressions` | `Number(metrics.impressions)` |
| `clicks` | `Number(metrics.clicks)` |
| `conversions` | `Number(metrics.conversions)` |
| `conv_value` | `Number(metrics.conversionsValue)` |

### `daily_metrics` (source='google_ads')
| `metric_key` | Google-Quelle |
|---|---|
| `video_views` | `Number(metrics.videoViews)` |

### Entscheidungen
1. **`spend = cost_micros / 1.000.000`** — Google liefert Kosten in Micros.
2. `video_views` ← `metrics.video_views`.
3. Kein Paging (searchStream streamt alles); Chunks flach zusammenführen.

## Schreiben (Transaktion, selektiver Replace beider Tabellen)

```sql
BEGIN;
  DELETE FROM ad_spend       WHERE platform = 'google_ads';
  DELETE FROM daily_metrics  WHERE source   = 'google_ads';
  INSERT ... (ad_spend)        -- gebündelte Multi-Row-Inserts
  INSERT ... (daily_metrics)   -- video_views
COMMIT;
```
Atomar, idempotent. **Bei 0 ad_spend-Zeilen abbrechen ohne DELETE.**

## Fehlerbehandlung

- OAuth-Token-Fehler (ungültiger/abgelaufener Refresh-Token, falsche Client-Creds):
  Status + Google-Fehlertext, Exit ≠ 0.
- searchStream HTTP-Fehler (`401` Auth, `403` fehlende developer-token-Freigabe/
  Permissions, `400` GAQL-Fehler): Status + `error`-Body, Exit ≠ 0.
- Leere Ergebnisse (0 Zeilen): sauber abbrechen ohne DELETE.

## Tests & Live-Verifikation

- **Unit (TDD, ohne Netz):** `normalizeRows()` gegen aufgezeichnete (geflachte)
  Result-Zeilen (2–3 Tage) — `segments.date`-Mapping, **Micros→Währung**,
  `Number()`-Cast, video_views, `platform`/`source`, fehlende Metrik → 0.
- **Client-Unit:** Token-Refresh (Request-Body grant_type/refresh_token) +
  searchStream-Aufbau (customers/<id>:searchStream-Pfad, GAQL im Body, Header
  Bearer/developer-token/login-customer-id) + Chunk-Flattening gegen gemockten
  `fetch` (1. Call Token, 2. Call searchStream); HTTP-Fehler.
- **Write-Integration:** schreibt Google-Zeilen in beide Tabellen; prüft, dass
  Meta/TikTok-`ad_spend` und Nicht-Google-`daily_metrics` sowie orders/customers/
  subscribers unberührt bleiben; 0-Zeilen-Abbruch.
- **Live-Verifikation (aufgeschoben):** echter `npm run sync:google` →
  `/api/kpis` gegenchecken; Stichprobe Spend/Impressions ≈ Google Ads UI.
  Häufige Fehler: `403` developer-token nicht freigegeben; `401` Refresh-Token
  abgelaufen → erneuern, erneut syncen.
- **Secrets:** alle OAuth-/Token-Werte nur in `.env` (gitignored), nie committet.

## Scope-Grenze

Nur Google (`ad_spend` platform=google_ads + `daily_metrics` video_views
source=google_ads). Kein Schema-Change, kein Scheduler. **Letzter Connector der
Roadmap** — danach sind alle SEE/THINK/DO/CARE-KPIs der Grafik aus echten Quellen
bedienbar (vorbehaltlich der ausstehenden Live-Schaltungen).
