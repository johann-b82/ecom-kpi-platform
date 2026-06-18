# GA4-Connector — Design-Spec

**Datum:** 2026-06-18
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Baut auf:** KPI-Plattform V1 + Shopware-Connector — Roadmap-Schritt 3

## Ziel

Echte Web-Analytics-Daten aus Google Analytics 4 (Data API) über einen
On-Demand-CLI-Sync ins kanonische Schema laden, sodass THINK-KPIs (Bounce Rate,
Add-to-Cart, wiederkehrende Besucher), SEE-Traffic und die nun echten DO-Quoten
(Conversion Rate = echte Orders / echte Sessions, Warenkorbabbruchrate) befüllt
werden. Engine, API und UI bleiben unverändert.

## Voraussetzungen / Kontext

- GA4-Property + **Service Account** (JSON-Key), dessen E-Mail als Betrachter
  auf die Property berechtigt ist.
- Auth: `google-auth-library` (nur Auth) erzeugt das Access-Token (Scope
  `analytics.readonly`); der `runReport`-Call läuft per raw `fetch` — konsistent
  mit dem Shopware-Connector.
- Sync-Modell: **On-Demand-CLI** `npm run sync:ga4 [--days N]`, Default **180**.
- Schreibt **nur** `daily_metrics`-Zeilen mit `source='ga4'`; alle anderen
  Quellen (Shopware `orders`/`customers`, Seed-`meta_ads` `video_views`) bleiben
  unberührt. **Kein Schema-Change. Kein Scheduler.**
- Neue Dependency: `google-auth-library`.

## Architektur & Datenfluss

```
npm run sync:ga4 [--days N]   (Default 180)
   ├─ 1. Auth:  google-auth-library (Service-Account-Key) → Access-Token (analytics.readonly)
   ├─ 2. fetch: POST analyticsdata.googleapis.com/v1beta/properties/{GA4_PROPERTY_ID}:runReport
   │            dimension=date, 7 GA4-Metriken, dateRange letzte N Tage → eine Antwort (≈N Zeilen)
   ├─ 3. normalize: GA4-Zeilen → kanonische daily_metrics[] (source='ga4', 7 keys/Tag)
   └─ 4. write: TRANSAKTION → DELETE daily_metrics WHERE source='ga4'; gebündelte Inserts
```

Folgt dem `Connector`-Muster (`fetch` → `normalize` → `CanonicalDataset` mit nur
`dailyMetrics` befüllt). Pagination entfällt (Dimension `date` ⇒ ≈N Zeilen, ein
`runReport`).

### Neue Dateien
- `src/connectors/ga4/client.ts` — Auth (google-auth-library) + `runReport` per fetch.
- `src/connectors/ga4/connector.ts` — `normalizeReport(report): CanonicalDataset`.
- `src/connectors/ga4/write.ts` — `writeGa4Metrics(data)`: transaktionaler Replace nur der `source='ga4'`-Zeilen.
- `scripts/sync-ga4.ts` — CLI mit `--days` (Default 180).
- `.env.example` + `package.json`-Script `sync:ga4`.
- Env: `GA4_PROPERTY_ID`, `GOOGLE_APPLICATION_CREDENTIALS` (Pfad zur Key-Datei).

## Metrik-Mapping (GA4 → kanonisch)

7 GA4-Metriken pro Tag → 7 kanonische `metric_key`s:

| `metric_key` | GA4-Metrik(en) | Hinweis |
|---|---|---|
| `sessions` | `sessions` | direkt |
| `pageviews` | `screenPageViews` | GA4-Name |
| `total_users` | `totalUsers` | direkt |
| `returning_users` | `totalUsers − newUsers` | Ableitung, auf ≥0 geklemmt |
| `bounced_sessions` | `sessions − engagedSessions` | GA4-Engagement-Modell, ≥0 |
| `add_to_carts` | `addToCarts` | E-Commerce-Event |
| `checkouts_started` | `checkouts` | E-Commerce-Event |

GA4-`runReport`-Request: `dimensions:[{name:'date'}]`, `metrics` = die 7 GA4-Namen
(`sessions, screenPageViews, totalUsers, newUsers, engagedSessions, addToCarts, checkouts`),
`dateRanges:[{startDate:'NdaysAgo'|YYYY-MM-DD, endDate:'today'}]`, `orderBys` nach date.

**Antwort-Verarbeitung:** `date` kommt als `YYYYMMDD` → `YYYY-MM-DD`; Metrikwerte
sind Strings → `Number()` (vermeidet den Stringtyp-Stolperstein). Jede Zeile
erzeugt 7 Records `{ date, source:'ga4', channel:'default', metricKey, value }`.

### Ableitungs-Entscheidungen
1. `returning_users = max(0, totalUsers − newUsers)` — Standard-Ableitung (GA4 hat
   keine direkte „returning users"-Metrik).
2. `bounced_sessions = max(0, sessions − engagedSessions)` — GA4-konform.

## Schreiben (Transaktion, selektiver Replace)

```sql
BEGIN;
  DELETE FROM daily_metrics WHERE source = 'ga4';   -- nur GA4-Zeilen
  INSERT ... (daily_metrics)                          -- gebündelte Multi-Row-Inserts
COMMIT;
```
Atomar, idempotent. **Bei 0 Zeilen abbrechen ohne DELETE** (kein versehentliches
Leeren bei API-Problemen).

## Fehlerbehandlung

- Auth/Credentials (fehlende/ungültige Key-Datei oder `GA4_PROPERTY_ID`): klare
  Meldung, Exit ≠ 0.
- `runReport` HTTP-Fehler: Status + Google-Fehlertext; abbrechen. (`403` =
  Service-Account nicht als Betrachter berechtigt — verständlich melden.)
- Leere `rows`: sauber abbrechen ohne DELETE.

## Tests & Live-Verifikation

- **Unit (TDD, ohne Netz):** `normalizeReport()` gegen aufgezeichnete `runReport`-
  Antwort (2–3 Tage) — Datumskonvertierung, `Number()`-Cast, beide Ableitungen
  inkl. ≥0-Klemmung, 7 Keys/Tag.
- **Client-Unit:** `runReport`-Aufbau (Property-Pfad, Metriken/Dimensionen,
  Bearer-Header) gegen gemockten `fetch`; Token via gemocktem Auth-Client.
- **Write-Integration:** schreibt `ga4`-Zeilen; prüft, dass `orders`/`customers`
  und Nicht-`ga4`-`daily_metrics` unberührt bleiben; 0-Zeilen-Abbruch.
- **Live-Verifikation (am Ende):** echter `npm run sync:ga4` → Zeilenzahl,
  `/api/kpis` gegenchecken: THINK + echte Conversion Rate (echte Orders / echte
  Sessions) + Warenkorbabbruchrate. Stichprobe: Sessions im Dashboard ≈
  GA4-Oberfläche für denselben Zeitraum.
- **Secrets:** Key-Datei + `GA4_PROPERTY_ID` nur lokal/`.env` (gitignored).

## Scope-Grenze

Nur die 7 GA4-`daily_metrics`. Kein Schema-Change, kein Scheduler, keine
Custom-Dimensions/Segmente. `video_views` bleibt Meta/TikTok (Ads-Connector,
später).
