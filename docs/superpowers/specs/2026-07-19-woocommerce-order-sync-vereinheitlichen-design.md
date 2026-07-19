# Design: WooCommerce-Order-Sync vereinheitlichen (inkrementeller ERP-Import + Status-Reconcile)

Datum: 2026-07-19
Status: Entwurf zur Abnahme

## Problem

Es gibt zwei getrennte WooCommerce-Bestell-Pipelines:

1. **Connector-Sync** (`sync:woocommerce` → Tabelle `orders`): läuft automatisch
   über den stündlichen Scheduler (`runDue`/`sync-runner`), Watermark-inkrementell
   (`modified_after`) mit ~nächtlichem Full-Resync. Speist das KPI-/GA4-Dataset.
   **Ist aktuell.**
2. **ERP-Import** (`import:woocommerce-orders` → Tabelle `sales_orders`): eigenes
   Skript, **in keinem Scheduler und keinem Cron**. Voll-Import ohne Watermark.
   Speist **alle Verkaufs-KPIs** (Übersicht, Kanal, `ecomSalesFacts`, Dashboard).

Daraus zwei Fehler:

- **Rückstand:** `sales_orders` wird nur manuell aktualisiert (zuletzt 3 Tage alt),
  während `orders` und die Live-`/verkauf/woocommerce`-Seite aktuell sind.
- **Status-Freeze (gravierender):** `importWooCommerceOrders` gleicht bei bereits
  importierten Bestellungen **nur die Positionszeilen** ab, **nicht** den Status.
  Ein nachträglicher Storno/Refund in WooCommerce wird also **nie** nach
  `sales_orders` propagiert. Damit greift die „self-correcting"-Zusage der
  Storno-bereinigten Umsatz-KPI ([[2026-07-19-umsatz-kpi-storno-bereinigt-design]])
  real nur für Bestellungen, die schon beim Erstimport storniert waren.

## Ziel

Ein WooCommerce-Sync hält **beide** Stores aktuell. Statuswechsel/Stornos landen
binnen ~1 h in `sales_orders` und damit in den Verkaufs-KPIs.

## Gesperrte Entscheidungen (Nutzer bestätigt)

- **Kopplung auf Job-/Zeitplan-Ebene, nicht auf Fetch-Ebene.** Der Connector-Fetch
  holt bewusst eine schmale Projektion (`_fields=id,status,date_created,total,
  customer_id,billing`, ~99 % kleinerer Payload) — ohne `line_items`/`number`/
  `currency`, die der ERP-Import braucht. „Ein Fetch für beide" ist deshalb nicht
  möglich; der ERP-Import macht einen **eigenen Voll-Payload-Fetch**.
- **Eigener ERP-Watermark** (unabhängig vom Connector-Watermark).
- **Status + passende Events** bestehender woo-Belege abgleichen (nicht nur
  Status). Nur woo-gematchte `channel=shop`-Belege; Manuelles/andere Kanäle
  unberührt.
- **Voll-Payload-Fetch** (einfach), kein Schlank-Reconcile über den `orders`-Store.

## Änderungen

### 1. `src/woocommerce/mirror.ts` — inkrementeller Fetch

`fetchOrdersRaw(page, perPage, modifiedAfter?)`: optionaler `modified_after`-
Parameter, analog zum Connector-Client — hängt bei gesetztem `modifiedAfter`
`&modified_after=<ISO>&dates_are_gmt=true` an die Query. Der Payload bleibt voll
(kein `_fields`), damit `line_items`/`billing`/`number`/`currency` durchkommen.

### 2. `src/woocommerce/erp-watermark.ts` (neu) — ERP-Watermark

Gespiegelt vom Connector-Muster (`src/connectors/woocommerce/watermark.ts`), aber
eigene Keys in `app_settings`:

- `woocommerce_erp_orders_synced_at`
- `woocommerce_erp_orders_full_synced_at`

Funktionen: `getErpWatermarks()`, `setErpWatermarks(startedAt, {full})`,
`shouldErpFullResync(syncedAt, fullSyncedAt, now)` (Full erzwingen, wenn nie
gelaufen oder Full älter als ~20 h). Reines Verhalten (`shouldErpFullResync`) ist
unit-testbar.

### 3. `src/woocommerce/order-import.ts` — Status/Event-Reconcile

Der „existing order"-Zweig (`existing.rows.length > 0`) wird erweitert: neben dem
Zeilen-Abgleich

- `UPDATE sales_orders SET status = <mapOrderStatus(raw.status)> WHERE id =
  existingOrderId` (nur wenn abweichend),
- **automatische Events neu ableiten:** die vom Import erzeugten Events des Belegs
  löschen (`DELETE FROM sales_order_events WHERE order_id = $1 AND automated =
  true`) und gemäß aktuellem Status neu setzen — `bestellt` immer, zusätzlich
  `bezahlt` (bei `bezahlt`) bzw. `retoure` (bei `retoure`). Manuelle Events
  (`automated = false`) bleiben unberührt.

`placed_at` bleibt (ändert sich in WooCommerce nicht). Neuer Result-Counter
`ordersUpdated` (Belege, deren Status sich geänder hat); `ordersLinked` bleibt für
reine Zeilen-Reconciles.

Hinweis: Importierte Belege sind „inert" (keine Reservierungen/Kosten;
`order_costs` leer → EK unvollständig). Ein Status-Update löst daher keine
Lager-/Kosten-Seiteneffekte aus — konsistent mit dem bestehenden Import.
`storniert` hat keine Event-Stage (Event-Enum kennt nur bestellt/kommissioniert/
rechnung_gestellt/bezahlt/retoure) → Storno = reiner Status, kein Event.

### 4. `scripts/sync-woocommerce.ts` — ERP-Import-Schritt

Nach dem bestehenden Connector-Sync (`fullReplace`/`applyDelta` → `orders`) ein
zweiter Block:

1. Standard-Preisliste laden (`SELECT id FROM price_lists WHERE is_default`).
2. ERP-Watermark lesen; `shouldErpFullResync` → full/delta bestimmen.
3. Alle Seiten über `mirror.fetchOrdersRaw(page, 100, full ? undefined : since)`
   holen (`since = erpSyncedAt − Overlap`, analog zum Connector `DELTA_OVERLAP_MS`).
4. `importWooCommerceOrders(pool, raw, priceListId)`.
5. `setErpWatermarks(startedAt, {full})`.

Läuft im selben Skript ⇒ selber stündlicher `runDue`-Zeitplan und selber
`runConnector`-Advisory-Lock (`sync:woocommerce`) — keine zweite Cron-/Scheduler-
Verdrahtung, keine Doppellauf-Races. Ein Fehler im ERP-Block darf den Connector-
Erfolg nicht zurücknehmen (Connector-Watermark ist zu dem Zeitpunkt bereits
gesetzt); der ERP-Watermark wird nur bei ERP-Erfolg geschrieben.

### 5. Doku

`src/lib/help/content.ts` (Adminseite `verbindungen`): der WooCommerce-Sync
aktualisiert jetzt auch die ERP-Belege (`sales_orders`) inkl. Statuswechsel/Storno,
stündlich; nächtlicher Full-Resync als Sicherheitsnetz.

## Storno-Propagation (warum das funktioniert)

WooCommerce bumpt `date_modified` bei jedem Statuswechsel. Der inkrementelle
`modified_after`-Fetch enthält damit auch **frisch stornierte Alt-Bestellungen**;
der erweiterte „existing"-Zweig kippt deren Status → Storno erscheint binnen ~1 h
in den KPIs. Der nächtliche Full-Resync ist Sicherheitsnetz und einmaliger
Backfill der historisch eingefrorenen Status.

## Tests (TDD)

1. **`order-import` Status-Reconcile** (`tests/woocommerce/*`, DB-Test):
   - Beleg als `processing`(→auftrag) importieren, dann denselben `raw` mit
     `status='cancelled'` re-importieren → `sales_orders.status='storniert'`,
     `ordersUpdated=1`, keine Zeilen-Dubletten.
   - `completed`(→bezahlt) → re-import `refunded`(→retoure) → Status `retoure`,
     `bezahlt`-Event entfernt, `retoure`-Event vorhanden, `bestellt`-Event bleibt.
   - Idempotenz: gleicher Status re-import → keine Status-/Event-Änderung,
     `ordersUpdated=0`.
2. **`erp-watermark`** (pure): `shouldErpFullResync` bei nie-gelaufen / Full zu alt
   / frisch.
3. **`mirror.fetchOrdersRaw` modified_after** (pure, gemockter fetch): URL enthält
   `modified_after=…&dates_are_gmt=true` genau dann, wenn `modifiedAfter` gesetzt.

Die `sync-woocommerce.ts`-Verdrahtung (Live-WooCommerce-Fetch) wird nicht unit-
getestet, sondern nach Deploy im Browser/über `sync_state` verifiziert (Storno an
einer Testbestellung → nach Sync in `sales_orders`).

## Verifikation nach Deploy (bryx-test, Nutzer-Freigabe)

- `npm run sync:woocommerce` einmal manuell → `sales_orders` aktuell, ERP-Watermark
  gesetzt.
- In WooCommerce (Test) eine bereits importierte Bestellung stornieren → erneut
  syncen → Beleg in `sales_orders` ist `storniert`, Stornoquote/Umsatz reagieren.
- `sync_state`/Logs prüfen; Konsole der KPI-Seiten clean.

## Out of Scope / bekannte Grenzen

- Der Connector-Slim-Fetch bleibt unverändert (99 %-Optimierung).
- Keine Zusammenlegung der beiden Stores (`orders` vs `sales_orders`) — sie haben
  unterschiedliche Semantik (KPI-Rohdaten vs ERP-Beleg mit Faden/Kosten).
- Nächtlicher Full-Payload-Fetch lädt alle Bestellungen (~13,5k × ~27 KB ≈ 365 MB)
  — bewusst gewählte einfache Variante, gleiche Kosten wie der heutige Manual-
  Import; ein schlanker Status-Reconcile über den `orders`-Store wäre eine spätere
  Optimierung.
- Prod-Deploy (VPS) = separater Nutzer-Entscheid.
