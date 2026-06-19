# Klaviyo-Connector — Design-Spec

**Datum:** 2026-06-18
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Baut auf:** KPI-Plattform V1 + Shopware + GA4 — Roadmap-Schritt 4 (E-Mail/CRM)

## Ziel

Newsletter-Anmeldungen und -Abmeldungen aus Klaviyo über einen On-Demand-CLI-Sync
in die kanonische `subscribers`-Tabelle laden, sodass THINK `newsletter_signups`
mit echten Zahlen befüllt wird. Engine, API und UI bleiben unverändert.

## Voraussetzungen / Kontext

- **Kein Live-Zugang aktuell** → Connector gegen die Klaviyo-API-Spezifikation
  bauen, mit aufgezeichneten Antworten testen; Live-Verifikation aufgeschoben,
  bis ein Private API Key vorliegt.
- Auth: **Private API Key** im Header `Authorization: Klaviyo-API-Key <KEY>` +
  Pflicht-Header `revision: 2024-10-15`.
- Sync-Modell: **On-Demand-CLI** `npm run sync:klaviyo [--days N]`, Default **180**.
- Schreibt **nur** `subscribers`-Zeilen mit `source='klaviyo'`; andere Quellen
  unberührt. **Kein Schema-Change. Kein Scheduler. Keine neue Dependency.**

## Architektur & Datenfluss

```
npm run sync:klaviyo [--days N]   (Default 180)
   ├─ 1. Auth: Header Authorization: Klaviyo-API-Key <KEY> + revision: 2024-10-15
   ├─ 2. discover: GET /api/metrics → Metrik-IDs für Signup- + Unsub-Metrik (Name→ID)
   ├─ 3. aggregate: POST /api/metric-aggregates je Metrik (interval=day, timezone=Europe/Berlin, N Tage)
   │                → Tages-Counts (attributes.dates[] ⟷ data[0].measurements.count[])
   ├─ 4. normalize: pro Tag → subscribers { date, source:'klaviyo', signups, unsubscribes, nps_score:null }
   └─ 5. write: TRANSAKTION → DELETE subscribers WHERE source='klaviyo'; gebündelte Inserts
```

Folgt dem `Connector`-Muster (`fetch` → `normalize` → `CanonicalDataset`, nur
`subscribers` befüllt). Besonderheit: zwei API-Schritte (Metrik-Discovery, dann
zwei Aggregate-Calls), da Klaviyo nach `metric_id` aggregiert.

### Neue Dateien
- `src/connectors/klaviyo/client.ts` — Auth + `listMetrics()` + `metricAggregate()` per fetch.
- `src/connectors/klaviyo/connector.ts` — `normalizeAggregates(signups, unsubs): CanonicalDataset`.
- `src/connectors/klaviyo/write.ts` — `writeKlaviyoSubscribers(data)`: transaktionaler Replace nur `source='klaviyo'`.
- `scripts/sync-klaviyo.ts` — CLI mit `--days`.
- `.env.example` + `package.json`-Script `sync:klaviyo`.
- Env: `KLAVIYO_API_KEY`, optional `KLAVIYO_SIGNUP_METRIC` (Default `Subscribed to List`), `KLAVIYO_UNSUB_METRIC` (Default `Unsubscribed`).

## Metrik-Discovery & Mapping

### Discovery (Name → ID)
`GET /api/metrics` liefert `id` + `name`. Die konfigurierten Namen werden
aufgelöst:

| Zweck | Default-Metrikname (konfigurierbar) | Env |
|---|---|---|
| `signups` | `Subscribed to List` | `KLAVIYO_SIGNUP_METRIC` |
| `unsubscribes` | `Unsubscribed` | `KLAVIYO_UNSUB_METRIC` |

**Wird ein Name nicht gefunden, bricht der Sync ab und listet die verfügbaren
Metriknamen** (selbstdiagnostisch — Konten benennen Metriken unterschiedlich,
z. B. „Subscribed to Email Marketing").

### Aggregates → kanonisch
Pro Metrik `POST /api/metric-aggregates` (`interval=day`, `measurements=['count']`,
`timezone=Europe/Berlin` (MET/MEST mit automatischer DST), Zeitfilter N Tage).
Antwort: `attributes.dates[]` (ISO-Bucket-Starts) index-aligned mit
`attributes.data[0].measurements.count[]`. Map `date[0:10]` → `Number(count)`.

Pro Tag (Vereinigung beider Datumslisten) ein `subscribers`-Record:

| `subscribers`-Feld | Quelle | Hinweis |
|---|---|---|
| `date` | Bucket-Datum → `YYYY-MM-DD` | |
| `source` | `'klaviyo'` | fest |
| `signups` | Count der Signup-Metrik (fehlender Tag → 0) | |
| `unsubscribes` | Count der Unsub-Metrik (fehlender Tag → 0) | |
| `nps_score` | `null` | keine Klaviyo-NPS-Quelle → N/A |

### Entscheidungen
1. Metriknamen per Env konfigurierbar (Defaults oben); unbekannter Name →
   Abbruch mit Auflistung der verfügbaren Metriken.
2. `nps_score = null` — kein Klaviyo-NPS; CARE-NPS zeigt nach dem Sync N/A.
   Später nachrüstbar (NPS-Metrik/Property).
3. `timezone = Europe/Berlin` (MET/MEST) für die Tages-Buckets.

## Schreiben (Transaktion, selektiver Replace)

```sql
BEGIN;
  DELETE FROM subscribers WHERE source = 'klaviyo';   -- nur Klaviyo-Zeilen
  INSERT ... (subscribers)                              -- gebündelte Multi-Row-Inserts
COMMIT;
```
Atomar, idempotent. **Bei 0 Zeilen abbrechen ohne DELETE.**

## Fehlerbehandlung

- Auth/HTTP-Fehler (`401` ungültiger Key, `403` fehlende Scopes): Status +
  Klaviyo-Fehlertext, Exit ≠ 0.
- Metrikname nicht gefunden: Abbruch mit Auflistung der verfügbaren Metriknamen.
- Leere Aggregate (0 Records): sauber abbrechen ohne DELETE.
- `revision`-Header fest gesetzt.

## Tests & Live-Verifikation

- **Unit (TDD, ohne Netz):** `normalizeAggregates()` gegen aufgezeichnete
  Aggregate-Antworten (Signup + Unsub, je 2–3 Tage) — Datums-Mapping,
  `Number()`-Cast, Tag-Vereinigung (fehlender Tag → 0), `nps_score:null`,
  `source:'klaviyo'`.
- **Client-Unit:** Metrik-Discovery (Name→ID inkl. „nicht gefunden"-Fehler mit
  Auflistung), Aggregate-Request-Aufbau (Auth-/revision-Header, Body mit
  metric_id/interval/timezone/Filter) gegen gemockten `fetch`.
- **Write-Integration:** schreibt `klaviyo`-Zeilen; prüft, dass andere Quellen
  unberührt bleiben; 0-Zeilen-Abbruch.
- **Live-Verifikation (aufgeschoben):** echter `npm run sync:klaviyo` →
  `/api/kpis` gegenchecken: THINK `newsletter_signups` echt. Stichprobe:
  Anmeldungen im Dashboard ≈ Klaviyo-Metrik im selben Zeitraum.
- **Secrets:** Private API Key nur in `.env` (gitignored), nie committet.

## Scope-Grenze

Nur `subscribers` (signups/unsubscribes). Kein NPS (N/A, später nachrüstbar),
kein Schema-Change, kein Scheduler. Retention/Churn bleiben Shopware-basiert.
