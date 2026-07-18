# Phase 3 — Echte Kanaldaten (WooCommerce & Amazon) · Umsetzungsplan (Design)

**Datum:** 2026-07-16
**Grundlage:** `bryx OS — Phase 3` (Fachspec) + `2026-07-13-phase-2-umsetzungsplan-design.md`
**Zweck:** Übersetzung des Phase-3-Fachspecs in einen umsetzbaren Bauplan entlang der
bestehenden Repo-Konventionen. Ersetzt den Fachspec **nicht** — sagt, *wie* und *in
welcher Reihenfolge* gebaut wird und welche Weichen entschieden sind.

Dieses Dokument liefert die **Roadmap (P0–P8)**, die **Führungs-Matrix**, Detailschärfe
für **P1 + P2**, die **Mapping-Sequenz** in die bestehenden Apps — und dokumentiert die
in dieser Session **bereits ausgelieferte** erste Scheibe (WooCommerce-Spiegel + Katalog-Import).

---

## 0. Bestandsaufnahme (Ausgangslage)

Vollständig in [`API_INVENTORY.md`](../../../API_INVENTORY.md). Kernbefund: **zwei getrennte
Connector-Welten**.

- **System A** (`src/connectors/*`): echte, laufende Analytics-Sync-Connectoren (WooCommerce,
  Shopware, GA4, Meta, TikTok, Google Ads, Klaviyo, Mailchimp) → KPI-Cache `orders`/`customers`/
  `daily_metrics`. Verschlüsselte Creds in `connector_credentials`, Runner + `sync_state`.
- **System B** (`integration_connections`): das ERP-„Verbindungen"-Menü — reiner UI/DB-Stub
  (`simulateConnect` flippt nur einen Status-String, keine API-Calls, keine Credential-Spalten).

`external_references` (Roh-Spiegel mit `raw_payload`) existierte, hatte aber **null Schreiber**.
`sync_jobs` existiert nicht.

---

## 1. Gesperrte Grundentscheidungen

1. **Zuschnitt:** Roadmap über ganz Phase 3 + Detailschärfe für **P1 (Kostenmodell)** und
   **P2 (Connector-Abstraktion + Verbindungsmenü)**. Restliche Bausteine je einzeln danach.
   Die Reihenfolge wurde in dieser Session bewusst umpriorisiert: **WooCommerce-Sichtbarkeit
   zuerst** (Showcase-Wert), Fundament-Bausteine ziehen nach.
2. **Verbindungsverwaltung = neue ERP-Schicht hinter `integration_connections` (Option B).**
   System A bleibt **unangetastet** (Marketing-KPI-Sync). Phase 3 baut die echte ERP-
   Integrationsschicht neu hinter `integration_connections` und übernimmt gezielt aus A:
   den erprobten Fetch-/Client-Code als Bibliothek und das AES-Credential-Muster als Vorlage.
   *Begründung:* Phase 2 hat Analytics-Cache und ERP-Belege bewusst getrennt; Option B
   respektiert diese Grenze, statt sie über einen gemeinsamen Runner zu verwischen, und
   erfüllt Fachspec §2a wörtlich (`integration_connections` = das Menü).
3. **Datensenke = ERP-Pfad.** Kanaldaten (WooCommerce/Amazon) → `external_references`
   (Roh-Spiegel, `raw_payload`) → `transitionOrderStatus()`/`createOrder()` → `sales_orders`.
   Der Analytics-`orders`-Cache bleibt getrennt (Phase-2-Entscheidung).
4. **Ein Schreib-Flaschenhals bleibt.** Auch Sync-erzeugte Belege laufen durch
   `transitionOrderStatus()`/`createOrder()`. Ausnahme Amazon-Retoure (Fachspec §9.3) — bewusst
   zu dokumentieren, wenn P6 kommt.

---

## 2. Führungs-Matrix (System of Record)

Wer ist **führend** je Datenart. Kerngedanke: **Der Kanal ist die Herkunft, bryx ERP ist das
Buch der Wahrheit** — außer wo bryx den Bestand physisch nicht kontrolliert (FBA) oder die Zahl
gar nicht kennen kann (Amazon-Gebühren, Ad-Spend).

| Datenart | Führendes System | Fließt woher | Anmerkung |
|---|---|---|---|
| Belegkette (Status, Events) | **bryx ERP** (`sales_orders`/`_events`) | Kanal löst aus | Kanal = Herkunft, nicht Führung |
| Sales-Umsatzzahl (eCom-Dashboard) | **bryx ERP** (`sales_orders`) | urspr. WooCommerce | ersetzt GA-Schätzung; nicht aus Analytics-`orders`-Cache |
| Produkt-Stammdaten (Name/Existenz) | **WooCommerce** (Quelle), ERP spiegelt | Import → `external_references` | siehe P3-Mapping unten |
| Bestand — eigene Lager | **bryx ERP** (`stock_levels`, `stock_adjustments`) | Webhook/Poll aktualisiert | manuelle Korrektur erlaubt |
| Bestand — FBA/Konsignation | **Amazon** (Reports API) | Amazon meldet | `stock_levels` read-only, Korrektur gesperrt |
| `order_costs` Wareneinsatz | **bryx** (berechnet, eingefroren) | `product_variants.purchase_price` | beim `auftrag`-Eintritt eingefroren |
| `order_costs` Gebühren | **Amazon Finances API** (`source=api`) | Settlement | bis dahin `source=berechnet` (vorläufig, in UI gekennzeichnet) |
| `channel_costs` Werbung | **Amazon Ads API** | Reporting | Kanal=marktplatz, Periode=Tag |
| Marketing-KPIs (Traffic, Conversion) | **System A / GA4** (unverändert) | GA4/Meta/… | offener Punkt §8.4 |
| Roh-Payload jeder API-Antwort | **externes System** (Spiegel) | `external_references.raw_payload` | Versicherung, nie Führung |
| Credentials — ERP-Connectoren | neuer ERP-Store (Option B) | Verbindungsmenü | getrennt von System-A-`connector_credentials` |

---

## 3. Roadmap — Bausteine P0–P8

| # | Baustein | Ergebnis | Abhängig von |
|---|---|---|---|
| **P0** | Amazon-Ads-Zugang beantragen | Org-Task, **kein Code**, läuft Wochen parallel | — |
| **P1** | Kosten-/Margenmodell + Wareneinsatz-Freeze | `order_costs`/`channel_costs`; DB je Beleg rechenbar | Phase 2 |
| **P2** | Connector-Abstraktion + `sync_jobs` + Verbindungsmenü-Pattern (Option B) | ERP-Integrationsschicht hinter `integration_connections` | P1 |
| **P3** | Mapping WooCommerce → bestehende Apps (Katalog → Kontakte → Verkauf → Verfügbarkeit) | echte Belege/Stammdaten im ERP | P2 (bzw. schrittweise, s. §7) |
| **P4** | WooCommerce-Webhooks + `stock_history` + eCom-Dashboard | Bestandstabelle/Verlauf, Sales aus ERP statt GA | P3 |
| **P5** | Kanal-Vergleich mit DB-Spalten | Wareneinsatz·Gebühren·Werbung·DB·DB%, sortierbar | P1, P3/P4 |
| **P6** | Amazon SP-API: Orders + Finances + Reports | Amazon-Belege, echte Gebühren, FBA-Bestand read-only | P2 |
| **P7** | Amazon Ads: Reporting → `channel_costs` | Ad-Spend, ACoS | P2, P0 |
| **P8** | Automationen (2–3 Regeln) | rutscht nach hinten | P3–P7 |

**P5 ist der Moment des sichtbaren Werts** (erster DB je Kanal auf echten Zahlen).

---

## 4. Bereits ausgeliefert (diese Session, verifiziert auf bryx-test)

### 4a. WooCommerce-Spiegel (read-only) — „Spiegel heute"
- **Modul** [`src/woocommerce/mirror.ts`](../../../src/woocommerce/mirror.ts): `WooCommerceMirror`
  (paged `fetchOrdersPage`/`fetchProductsPage`, `fetchProductsRaw`, `testConnection`), pure
  `normalizeOrder`/`normalizeProduct`/`formatAmount`. Tests:
  [`tests/woocommerce/mirror.test.ts`](../../../tests/woocommerce/mirror.test.ts) (13, TDD).
  Bewusst getrennt von `src/connectors/woocommerce` (System A).
- **UI** [`src/app/(shell)/verkauf/woocommerce/page.tsx`](../../../src/app/(shell)/verkauf/woocommerce/page.tsx):
  read-only Seite unter Verkauf, Tabs Bestellungen/Produkte, server-seitige Paginierung,
  Live-Status + Totals. Sidebar-Link in `VerkaufSidebar`.
- **Verifiziert:** live gegen bryxtoys.com (13.5k Orders, 442 Produkte), beide Tabs + Blättern,
  keine Konsolen-Fehler.
- **Creds:** aus der VPS-DB in die bryx-test-`connector_credentials` kopiert (AES, `CREDENTIALS_KEY`).

### 4b. Katalog-Import (P3, Schritt 1) — „Mapping danach", Teil 1
- **Schema:** `CREATE UNIQUE INDEX external_references_source_key ON external_references
  (source_system, external_id, entity_type)` — die Idempotenz-Entscheidung aus P2, bereits gelegt.
- **Modul** [`src/woocommerce/catalog-import.ts`](../../../src/woocommerce/catalog-import.ts):
  pure `mapProduct` (Woo → Katalog-Felder) + idempotentes `importWooCommerceProducts`.
  Tests [`tests/woocommerce/catalog-import.test.ts`](../../../tests/woocommerce/catalog-import.test.ts) (4, TDD).
- **Skript** [`scripts/import-woocommerce-catalog.ts`](../../../scripts/import-woocommerce-catalog.ts)
  (`npm run import:woocommerce-catalog`).
- **Erster echter Schreiber von `external_references`** — `raw_payload` = unveränderte Woo-Antwort.
- **Verifiziert:** 437 Produkte angelegt, 365 Preise (Preisliste **Handel**), 5 ohne SKU
  übersprungen; **Doppellauf bewies Idempotenz** (2. Lauf: 0 neu, 437 verlinkt, keine Duplikate).
  In `/katalog` nativ sichtbar inkl. SKU + Handel-Preis; Status-Mapping publish→aktiv, draft→konzept.

**Entschiedene Mapping-Regeln (Schritt 1):** Match-Schlüssel = **SKU** (`product_variants.sku`
ist UNIQUE NOT NULL); ohne SKU → übersprungen + gemeldet; SKU-Kollision im Batch → erste gewinnt.
**Variable Produkte: Parent-Ebene** (1 Produkt + 1 Variante je Woo-Produkt); Variationen später.
**Verkaufspreis** → Preisliste **Handel** (`is_default`); nur positive Preise (0 auf Parent-Ebene
wird nicht geschrieben). `purchase_price` bleibt NULL (Woo liefert keinen EK).

---

## 5. Detail P1 — Kostenmodell + Wareneinsatz (noch offen)

**Tabellen** (append `db/schema.sql`, `-- ── Kosten & Marge ──`, Enums als `CHECK`, `tenant_id`
nullable, RLS deny):
- `order_costs` (order_id → sales_orders ON DELETE CASCADE, type CHECK(wareneinsatz|
  marktplatzgebuehr|fulfillment|versand|zahlungsgebuehr|retoure|sonstige), amount NUMERIC(12,2)
  positiv, source CHECK(berechnet|api|manuell), source_ref TEXT NULL).
- `channel_costs` (channel CHECK(shop|b2b_portal|marktplatz|telefon|manuell), type CHECK(werbung|
  lagergebuehr|abo_gebuehr|sonstige), period_start/end DATE, amount, source CHECK(api|manuell),
  external_ref TEXT NULL).

**Wareneinsatz-Freeze:** Helfer `freezeWareneinsatz(c, orderId)` in
[`src/verkauf/repository.ts`](../../../src/verkauf/repository.ts), aufgerufen an **beiden**
`auftrag`-Eintrittspfaden — `createOrder` (Kanal shop/marktplatz, [:98-101]) **und**
`transitionOrderStatus` (angebot→auftrag). Schreibt je Line `order_costs`
(`type=wareneinsatz, source=berechnet, amount = quantity × product_variants.purchase_price`),
EK **zum Zeitpunkt eingefroren**. Idempotent (nur wenn noch keine Wareneinsatz-Zeile existiert).

**Verifikation:** migrate idempotent; RLS-Deny-Test +2 Tabellen; Integrationstest: shop-Auftrag →
Wareneinsatz-Zeile; danach `purchase_price` ändern → Kostenzeile unverändert (Freeze bewiesen);
`datenmodell`-Hilfeseite ergänzt.

---

## 6. Detail P2 — Connector-Abstraktion + Verbindungsmenü (noch offen)

**`sync_jobs`** (Fachspec §2): connection_id → integration_connections, entity_type, direction,
status CHECK(geplant|laeuft|erfolg|fehler), cursor TEXT NULL, records_synced INT, error_message,
started_at/finished_at.

**Connector-Schnittstelle** (`src/lib/erp-connectors/`): `interface ErpConnector {
fetchOrders(since), fetchCosts(period), fetchProducts(since) }`. Der anbieter-**unabhängige** Teil
(external_references-Spiegel, Schreiben via `transitionOrderStatus`/`createOrder`, Idempotenz)
liegt **einmal** in einem gemeinsamen `runSync()`.

**Drei Design-Entscheidungen:**
1. **Idempotenz-Schlüssel:** `UNIQUE (source_system, external_id, entity_type)` auf
   `external_references` — **bereits gelegt** (siehe §4b).
2. **Credential-Speicher (Option B):** neue Geschwister-Tabelle `integration_credentials
   (connection_id → integration_connections, field, value_encrypted)`, wiederverwendet das
   AES-Muster aus System A; `simulateConnect` → echter Connect/Test-Flow.
3. **ERP-Connector-Registry** neu in `src/lib/erp-connectors/registry.ts` (getrennt von
   System-A-`connector-fields.ts`).

**Verbindungsmenü-Pattern** (Fachspec §2a): **eine** geteilte Komponente für alle ERP-Connectoren:
Name/Icon · Status (aus letztem `sync_jobs`) · maskierte editierbare Cred-Felder ·
„Verbindung testen" · „Letzte Sync" (`finished_at` + Fehlerlink) · `is_leading`-Hinweis (erst
Phase 4). WooCommerce = Referenz-UI, Amazon erbt sie 1:1.

---

## 7. Mapping-Sequenz WooCommerce → bestehende Apps (P3)

Abhängigkeitsreihenfolge — Bestellungen können nicht sauber landen, bevor Produkte und Kunden
gemappt sind:

1. **Katalog** (Produkte → `product_variants` per SKU). **✅ Schritt 1 erledigt** (Parent-Ebene,
   §4b). Offen: Variations-Ebene (Größen/Farben), Kategorien/Marke, Bilder.
2. **Kontakte** (Woo-Kunden/Billing → `contacts`, Dedup über E-Mail/USt-ID). Vor den Bestellungen.
3. **Verkauf** (Bestellungen → `sales_orders` via `createOrder`/`transitionOrderStatus`,
   Positionen auf gemappte Varianten, Kontakt aufgelöst). Hier greifen Belegkette + Wareneinsatz (P1).
4. **Verfügbarkeit** (Bestand → `stock_levels`; dann Webhooks + `stock_history`, P4).

---

## 8. Offene Punkte

Aus Fachspec §9 plus in dieser Session entstandene:

1. **Variable Produkte, Variations-Ebene.** Parent-Ebene ist importiert; je Variation eine
   eigene Variante (via `/products/:id/variations`) ist der nächste Katalog-Schritt.
2. **Backfill vs. Vorwärts-Sync der 13.518 Bestellungen.** Alle rückwirkend in `sales_orders`
   importieren oder nur ab jetzt? Zu entscheiden vor Schritt 7.3.
3. **Preislisten-Semantik.** Woo-Shop-Preis liegt aktuell in **Handel** (`is_default`). Der
   Shop-Preis ist semantisch eher **Endkunde** — ggf. umleiten.
4. **Amazon Ads: Tool Provider vs. Direct Advertiser** (Fachspec §9.1) — bestimmt, wann P0 startet.
5. **Amazon-Gebühren-Granularität** (Fachspec §9.2), **Amazon-Retouren** (§9.3),
   **GA im eCom-Dashboard** (§9.4), **`stock_history`-Aufbewahrung** (§9.5).

---

## 9. Konventionen & Definition of Done

Wie Phase 2 (siehe dortigen Umsetzungsplan §1/§6): kein ORM, `schema.sql` + `rls.sql` via
`npm run migrate`; RLS-Deny für neue ERP-Tabellen; Server Actions → Repository → `pg` Pool;
warmes ERP-Designsystem + Dark-Mode; Hilfe-Pflicht (Modul-/`datenmodell`-/`verbindungen`-Seiten);
`npm test` grün (die host-spezifischen `tests/db/rls.test.ts`-Fehler auf bryx-test sind bekannt
und keine Regression); deploy + verifiziert (bryx-test zuerst, Prod nur mit explizitem Go).
