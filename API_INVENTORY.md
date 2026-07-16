# API-Inventory — Bestandsaufnahme Connectoren (vor Phase 3)

> Erstellt gemäß Phase-3-Abschnitt 2a („Bestandsaufnahme vor dem Connector-Bau").
> Stand: 2026-07-16. Zweck: festhalten, was an Connector-Infrastruktur bereits
> existiert, **bevor** Amazon-Connector-Code entsteht und **bevor** das
> Verbindungsmenü-Pattern festgelegt wird.

## Kernbefund: zwei getrennte Connector-Welten

Das Repo enthält **zwei völlig unabhängige „Connector"-Schichten**, die nichts
voneinander wissen. Das zu verstehen ist die wichtigste Vorbedingung für Phase 3.

| | **System A — Analytics-Sync** | **System B — ERP „Verbindungen"** |
|---|---|---|
| Zweck | KPI-/Umsatzdaten für Dashboards ziehen | ERP-Verbindungsmenü (Phase 2) |
| Code | echt, laufend (`src/connectors/*`) | reiner UI-/DB-Stub |
| Credential-Speicher | `connector_credentials` (AES-256) | **keiner** (Tabelle hat keine Spalten) |
| Status/Historie | `sync_state`, `oauth_connections` | `integration_connections.status` (String) |
| Ziel-Tabellen | `orders`, `customers`, `daily_metrics` (Analytics) | — (schreibt nichts) |
| „Verbinden" tut | echten API-Sync (`npm run sync:<key>`) | flippt Status-String, kein API-Call |
| UI | `/setup` → `CredentialsForm` + `SyncForm` | `/setup` → `ConnectionsAdmin` (`integration_connections`) |

**Für Phase 3 relevant ist System B** (Abschnitt 2a: „Die Verbindungsmenüs sitzen
bereits an einer Stelle im Frontend, `integration_connections` dahinter") — und
genau dort läuft heute **kein** echter Code. Der WooCommerce-Connector, den
Phase 3 als „bereits vorhanden" voraussetzt, lebt in **System A** und schreibt in
die falschen (Analytics-)Tabellen.

---

## System A — Analytics-Connectoren (echter, laufender Code)

Registry / Single Source of Truth: [src/lib/connector-fields.ts](src/lib/connector-fields.ts)
(`CONNECTOR_FIELDS`, `CONNECTOR_LABELS`, `CONNECTOR_GROUPS`).
Runner: [src/lib/sync/runner.ts](src/lib/sync/runner.ts) (`runConnector` shellt `npm run sync:<key>` mit Postgres-Advisory-Lock). Trigger: [src/app/api/sync/route.ts](src/app/api/sync/route.ts).

| Connector | Ort im Code | Credential-Felder | Fetch-Methoden | Abweichung vom Phase-3-Pattern |
|---|---|---|---|---|
| **WooCommerce** | [src/connectors/woocommerce/](src/connectors/woocommerce/) (`client.ts`, `connector.ts`, `types.ts`, `watermark.ts`) | `WOOCOMMERCE_STORE_URL`, `WOOCOMMERCE_CONSUMER_KEY`, `WOOCOMMERCE_CONSUMER_SECRET` ([connector-fields.ts:21-25](src/lib/connector-fields.ts#L21-L25)) | `fetchAllOrders(modifiedAfter?)` — **nur Orders**, keine Produkte, keine Webhooks | Schreibt in Analytics-`orders` statt `sales_orders`/`external_references`; nicht am `integration_connections`-Menü; kein `sync_jobs`; kein `raw_payload`-Mirror |
| Shopware | [src/connectors/shopware/](src/connectors/shopware/) | `SHOPWARE_API_URL`, `SHOPWARE_CLIENT_ID`, `SHOPWARE_CLIENT_SECRET` | `fetchAllOrders` | wie WooCommerce (Analytics-Ziel) |
| GA4 (Google Analytics 4) | [src/connectors/ga4/](src/connectors/ga4/) | `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_JSON` | Analytics-Metriken | liefert heute Sales/Traffic; Phase 3 ersetzt die **Sales**-Zahl durch WooCommerce |
| Google Ads | [src/connectors/google/](src/connectors/google/) | OAuth + Developer Token ([:54-61](src/lib/connector-fields.ts#L54-L61)) | Ad-Metriken | Ads-Kosten, aber nicht in `channel_costs` |
| Meta Ads | [src/connectors/meta/](src/connectors/meta/) | OAuth App + Access Token ([:39-45](src/lib/connector-fields.ts#L39-L45)) | Ad-Metriken | — |
| TikTok Ads | [src/connectors/tiktok/](src/connectors/tiktok/) | OAuth App + Access Token ([:46-53](src/lib/connector-fields.ts#L46-L53)) | Ad-Metriken | — |
| Klaviyo | [src/connectors/klaviyo/](src/connectors/klaviyo/) | `KLAVIYO_API_KEY` (+ Metriken) | E-Mail/CRM | — |
| Mailchimp | [src/connectors/mailchimp/](src/connectors/mailchimp/) | `MAILCHIMP_API_KEY`, `MAILCHIMP_LIST_ID` | E-Mail/CRM | — |

**Basis-Interface:** [src/connectors/connector.ts](src/connectors/connector.ts) — `interface Connector { source; fetch(range); normalize(raw): CanonicalDataset }`. **Achtung:** WooCommerce und Shopware implementieren dieses generische Interface **nicht**, sie nutzen ein eigenes Delta-Modell (`fetchAllOrders` + `normalizeDelta` + Watermark). Das Interface wird nur von den Ad-/Analytics-Connectoren genutzt.

### WooCommerce im Detail (der Phase-3-„Referenz-Connector")
- [client.ts:33](src/connectors/woocommerce/client.ts#L33) `fetchAllOrders` — paginiert `/wp-json/wc/v3/orders`, HTTP-Basic-Auth (`consumer_key:consumer_secret`, [:30](src/connectors/woocommerce/client.ts#L30)), 30 s Timeout, Feld-Narrowing (`_fields`), inkrementell über `modified_after`.
- [connector.ts](src/connectors/woocommerce/connector.ts) `normalizeDelta()` — partitioniert Orders in Umsatz-Upserts vs. Deletes (Status `completed`/`processing`).
- [watermark.ts](src/connectors/woocommerce/watermark.ts) — inkrementelle Watermarks in `app_settings`, nächtlicher Full-Resync (`shouldFullResync`).
- Orchestrierung: [scripts/sync-woocommerce.ts](scripts/sync-woocommerce.ts) — lädt verschlüsselte Creds, fetch → normalize → `fullReplace`/`applyDelta` aus [src/lib/orders-store.ts](src/lib/orders-store.ts).
- **Fehlt für Phase 3:** Produkt-Fetch, Webhooks (`order.created`/`order.updated` + HMAC-Signaturprüfung), `stock_history`, Schreiben nach `external_references`/`sales_orders`, `order_costs` (Zahlungsgebühren).

---

## System B — ERP „Verbindungen" (`integration_connections`, reiner Stub)

- **Schema:** [db/schema.sql:217-225](db/schema.sql#L217-L225) — `integration_connections(id, tenant_id, app, provider, label, status DEFAULT 'nicht verbunden', last_synced_at)`. **Keine Credential-Spalten.**
- **Data-Layer:** [src/lib/integrations.ts](src/lib/integrations.ts) — `listAllConnections()` ([:14](src/lib/integrations.ts#L14)); `simulateConnect(id)` ([:9-12](src/lib/integrations.ts#L9-L12)) mit Kommentar `// Demo stub … no real API call.` — setzt nur `status = 'verbunden (Demo)'`.
- **UI:** [src/app/setup/page.tsx](src/app/setup/page.tsx) (admin-only) → `ConnectionsAdmin` / `ConnectionStubs`. Intro sagt wörtlich: „Verbinden (Demo) setzt den Status ohne echten API-Aufruf."
- **Server-Action:** [src/app/setup/actions.ts](src/app/setup/actions.ts) `simulateConnectAction` (isAdmin-gated).
- **Seed:** [src/lib/verbindungen-seed.ts](src/lib/verbindungen-seed.ts) (`CONNECTION_SEED`) + [scripts/seed-verbindungen.ts](scripts/seed-verbindungen.ts). Kontakte/Katalog seeden eigene Zeilen ([src/kontakte/seed-data.ts:31](src/kontakte/seed-data.ts#L31), [src/katalog/seed-data.ts:90](src/katalog/seed-data.ts#L90)).

**Demo-Zeilen im Menü (kein Code dahinter):** shopware, **amazon** (verkauf), dhl, edi (verfügbarkeit), datev, fints (finanzen), plus Kontakte-DATEV/HubSpot und Katalog-Amazon/Shopware.

> **Namenskollision beachten:** „Shopware" und „Amazon" tauchen in **beiden**
> Systemen auf. In System A ist Shopware ein laufender Analytics-Client; in
> System B ist es (wie Amazon) nur eine tote Demo-Zeile.

---

## Amazon — Greenfield (nichts vorhanden)

Kein SP-API-, Ads-, LWA- oder sonstiger Code. Einzige Treffer: tote Demo-Seed-Zeilen
([verbindungen-seed.ts:9](src/lib/verbindungen-seed.ts#L9) `provider: 'amazon'`,
[katalog/seed-data.ts:90](src/katalog/seed-data.ts#L90)). Grep auf
`sp-api|sp_api|advertising|LWA` → null Code-Treffer. Alles (Client, Auth/LWA,
SP-API Orders/Finances/Reports, Ads-Reporting, Typen) ist neu zu bauen.

---

## Phase-3-Grundgerüst, das noch fehlt

| Artefakt (Phase-3-Doc) | Status heute |
|---|---|
| `sync_jobs`-Tabelle (Abschnitt 2) | **existiert nicht** — System A nutzt stattdessen `sync_state` ([db/schema.sql:80](db/schema.sql#L80)) |
| `external_references` als Payload-Spiegel (Abschnitt 2) | Tabelle da ([:206](db/schema.sql#L206)), aber **null Schreiber** — `raw_payload` komplett ungenutzt |
| `order_costs` / `channel_costs` (Abschnitt 1) | existieren nicht |
| `stock_history` (Abschnitt 3) | existiert nicht |
| Gemeinsame Connector-Schnittstelle `fetchOrders/fetchCosts/fetchProducts` | nur `fetchAllOrders` (Orders) vorhanden |
| Verbindungsmenü-Pattern (Abschnitt 2a) | Menü existiert (System B), aber ohne Credential-Felder, Test-Button, „Letzte Sync"-Anzeige, Fehler-Sichtbarkeit |
| Credential-Speicher für `integration_connections` | **keiner** — System A hat `connector_credentials`, System B nicht |

## Migrations-Baseline

Kein Per-File-Migrationsframework: gesamtes Schema in **einer** Datei
[db/schema.sql](db/schema.sql) (angewandt von [scripts/migrate.ts](scripts/migrate.ts)),
plus [db/rls.sql](db/rls.sql) für Row-Level-Security. Neue Phase-3-Tabellen kommen
in `db/schema.sql`.

---

## Fazit / Konsequenz für die Baureihenfolge

1. **WooCommerce ist wiederverwendbar, aber nicht „fertig".** Der Orders-Client
   (`src/connectors/woocommerce/*`) ist erprobt — nutzbar als Basis. Aber er zielt
   auf die Analytics-DB und muss für Phase 3 auf `external_references`/`sales_orders`
   umgeleitet und um Produkte + Webhooks erweitert werden.
2. **Das Verbindungsmenü (System B) trägt heute keinen echten Connect-Flow.** Das
   Pattern aus Abschnitt 2a muss den Backend-Unterbau (Credential-Speicherung,
   Test-Call, Sync-Status aus `sync_jobs`) erst mitbringen.
3. **Offene Grundsatzfrage:** Werden System A und System B in Phase 3 zusammengeführt
   (ein WooCommerce statt zwei) oder bleiben sie getrennt? Diese Entscheidung ist vor
   dem Amazon-Bau zu treffen — sie bestimmt, ob der Amazon-Connector das System-A-
   oder ein neues System-B-Muster erbt.
