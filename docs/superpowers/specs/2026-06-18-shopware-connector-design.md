# Shopware-6-Connector — Design-Spec

**Datum:** 2026-06-18
**Status:** Genehmigt (Brainstorming abgeschlossen)
**Baut auf:** KPI-Plattform V1 (`2026-06-17-kpi-plattform-v1.md`) — Roadmap-Schritt 2 (erster Live-Connector)

## Ziel

Echte Bestell- und Kundendaten aus einer Shopware-6-Instanz über die Admin-API
in das bestehende kanonische Schema laden, sodass die DO- und CARE-KPIs des
Dashboards mit Live-Daten statt Seed-Daten befüllt werden. Engine, API und UI
bleiben unverändert.

## Voraussetzungen / Kontext

- Live-Instanz mit Admin-API-Zugang vorhanden.
- Auth: **Integration** (OAuth2 `client_credentials`) — Access Key ID + Secret.
- Sync-Modell: **On-Demand-CLI** (`npm run sync:shopware`), wie `seed`/`migrate`.
  Kein eingebauter Scheduler (Cron kann den Befehl später extern auslösen).
- Backfill: **gesamte Bestellhistorie** (paginiert).
- Shopware ist alleiniger Eigentümer von `orders` + `customers`; andere Tabellen
  (`daily_metrics`, `ad_spend`, `subscribers`) bleiben unangetastet.

## Architektur & Datenfluss

```
npm run sync:shopware
   ├─ 1. Auth:  POST /api/oauth/token (client_credentials) → Bearer-Token
   ├─ 2. fetch: GET /api/order (paginiert, limit=500, assoc. orderCustomer) → alle Orders
   ├─ 3. normalize: Shopware-Order → kanonische orders[] + abgeleitete customers[]
   └─ 4. write: TRANSAKTION → TRUNCATE orders, customers; gebündelte Inserts
```

Implementiert das vorhandene `Connector`-Interface (`fetch` → `normalize` →
`CanonicalDataset`), analog zum Seed-Generator, nur mit echter API.

### Neue Dateien
- `src/connectors/shopware/client.ts` — Auth (Token holen/erneuern) + paginiertes Fetch.
- `src/connectors/shopware/connector.ts` — `normalize()`: Rohdaten → `CanonicalDataset`.
- `scripts/sync-shopware.ts` — CLI: fetch → normalize → write (Transaktion).
- `.env`-Variablen: `SHOPWARE_API_URL`, `SHOPWARE_CLIENT_ID`, `SHOPWARE_CLIENT_SECRET`
  (`.env.example` ergänzen; echte Werte nur lokal, `.env` ist gitignored).

**Kein Schema-Change. Kein Scheduler.**

## Auth (OAuth2 client_credentials)

```
POST {SHOPWARE_API_URL}/api/oauth/token
Body: { grant_type: "client_credentials", client_id, client_secret }
→ { access_token, expires_in }
```
Token im Speicher halten; Folge-Requests mit `Authorization: Bearer <token>`.
Bei `401` während der Paginierung: einmal Token erneuern und Request wiederholen.

## Fetch (paginiert)

```
GET /api/order?limit=500&page=N&associations[orderCustomer][]&total-count-mode=1
```
Seiten `1..` durchlaufen bis alle Datensätze geladen sind (`limit=500` = Maximum).
Ein Endpunkt genügt — `order` + `orderCustomer` enthalten alle benötigten Felder.
Kleine Pause zwischen Seiten (Höflichkeit); keine komplexe Rate-Limit-Logik.

## Mapping: Shopware-Order → kanonisch

| kanonisch (`orders`) | Shopware-Feld | Hinweis |
|---|---|---|
| `orderId` | `order.id` | UUID |
| `customerId` | `order.orderCustomer.customerId` | Fallback `orderCustomer.id` bei Gastbestellung |
| `date` | `order.orderDateTime` → `YYYY-MM-DD` | |
| `revenue` | `order.amountTotal` | **Brutto** (inkl. Steuer) |
| `isFirstOrder` | berechnet | pro `customerId` früheste Bestellung = `true` |

`customers[]` wird aus den Orders abgeleitet (Gruppierung nach `customerId`):
`firstOrderDate`, `lastOrderDate`, `ordersCount`, `totalRevenue`. Kein zweiter
Endpunkt, garantiert konsistent mit `orders`.

### Mapping-Entscheidungen
1. **Umsatz = brutto** (`amountTotal`, inkl. Steuer) — entspricht üblichem E-Commerce-Revenue.
2. **Stornos ausschließen** — Bestellungen im Status `cancelled` zählen nicht
   (Umsatz/Conversion). Alle übrigen Status zählen.

## Schreiben (Transaktion, Full-Replace)

```sql
BEGIN;
  TRUNCATE orders, customers;     -- nur diese zwei Tabellen
  INSERT ... (orders)             -- gebündelte Multi-Row-Inserts
  INSERT ... (customers)
COMMIT;
```
Atomar: Bricht der Lauf ab, bleibt der alte Stand erhalten. Idempotent (jeder
Lauf = vollständiger Full-Replace). Inkrementeller Sync per `updatedAt` ist eine
spätere Optimierung (nicht V1 des Connectors).

## Fehlerbehandlung

- Auth/HTTP-Fehler: Status + Shopware-Fehlertext ausgeben, Exit-Code ≠ 0.
- `401` während Paginierung: Token einmal erneuern, Request wiederholen.
- **0 Bestellungen / leere Antwort:** sauber abbrechen mit Meldung, **kein**
  TRUNCATE (verhindert versehentliches Leeren bei API-Problemen).

## Tests & Live-Verifikation

- **Unit (TDD, ohne Netz):** `normalize()` gegen 1–2 aufgezeichnete `/api/order`-
  JSON-Fixtures (Secrets entfernt) — prüft Mapping, `isFirstOrder`, Storno-
  Ausschluss, Brutto-Umsatz, abgeleitete Kunden-Aggregate.
- **Client-Unit:** Paginierungs-Schleife + Token-Refresh gegen gemockten `fetch`.
- **Live-Verifikation (am Ende):** echten `npm run sync:shopware` gegen die
  Instanz laufen lassen → Zeilenzahlen prüfen, `/api/kpis` gegenchecken (DO/CARE
  zeigen plausible echte Shopware-Zahlen), Dashboard-Spotcheck; Stichprobe
  Umsatz Dashboard ≈ Summe in Shopware für denselben Zeitraum.
- **Secrets:** nur in `.env` (gitignored), nie in Fixtures oder Commits.

## Scope-Grenze (bewusst)

- Nur `orders` + `customers` aus Shopware. Keine Sessions/Checkouts (das ist GA4,
  Schritt 3). Kein Schema-Change, kein Scheduler, kein inkrementeller Sync.
- Nach dem Sync zeigen DO (Umsatz/AOV/Conversion*) und CARE (Repeat/CLV/
  Wiederkaufintervall/Retention/Churn) echte Shopware-Daten.
  *Conversion Rate = orders/sessions bleibt N/A-anteilig, bis GA4 (Sessions) angebunden ist.
