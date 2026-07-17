# Verfügbarkeit: Bestandsverlauf, Verkaufskurve & Nachliefer-Prognose

**Datum:** 2026-07-17
**Modul:** `verfuegbarkeit` (Verfügbarkeit / Bestand)
**Status:** Design freigegeben, bereit für Implementierungsplan

## Ziel

Pro Artikel (Variante) und pro Kategorie eine **Bestandsverlaufskurve** und eine
**Verkaufskurve** darstellen, plus eine **Nachliefer-Prognose** (Reichweite,
voraussichtliches Leerdatum, Bestellvorschlag). Das Verfügbarkeit-Modul wird von
einer reinen Bestandsliste zu einem **Dashboard** ausgebaut.

## Ausgangslage (Datenbefund)

- **Verkaufskurve:** direkt aus `sales_order_lines` (`variant_id`, `quantity`,
  `unit_price`) + `sales_orders.placed_at` (Kanal `shop`) ableitbar. Muster
  existiert bereits in `src/verkauf/repository.ts` (`revenueByDay`, Top-Produkte).
- **Nachliefer-Prognose:** Teil-Logik vorhanden — `product_variants.reorder_point`,
  `src/verfuegbarkeit/reorder.ts` (`reorderBufferUnits`, 4-Wochen-Verbrauch aus
  84-Tage-Fenster), `listReorderSuggestions`.
- **Bestandsverlauf:** existiert historisch **nicht**. WooCommerce liefert per API
  nur den aktuellen `stock_quantity`; wir spiegeln ihn, überschreiben ihn aber bei
  jedem Sync (`external_references`). `stock_levels` ist reiner Ist-Zustand
  (kein Zeitstempel), `stock_adjustments` erfasst nur manuelle Korrekturen.
- **Kategorie:** `products.category` (TEXT, eine Kategorie je Produkt).
- **Charting:** Recharts vorhanden; Shared-Primitive `src/components/charts/ChartCard.tsx`
  + `chart-style.ts`; Präzedenz `src/components/BpmStockChart.tsx`.

## Getroffene Entscheidungen

1. **Bestandsverlauf:** ab jetzt **snapshotten** (nicht rückwirkend rekonstruieren).
   Kurve startet heute und wächst vorwärts; exakt statt näherungsweise.
2. **Prognose:** **Verbrauchsrate + Reichweite** (kein Trend-/Saisonmodell).
   Ø-Verbrauch aus **90-Tage-Fenster**. **Alert-Schwelle: 90 Tage Reichweite** —
   Nachbestellung erfolgt aus Übersee, die lange Vorlaufzeit erfordert frühe
   Warnung und ein entsprechend langes Verbrauchsfenster.
3. **Verortung:** Dashboard **unter `/verfügbarkeit`** — Kategorie-Übersicht mit
   Reorder-Alerts als Einstieg, Artikel-Detail als Drilldown; Bestandsliste bleibt
   erreichbar.

## Block 1 — Datenpipeline & Berechnung

### 1a. Neue Verlaufstabelle `stock_snapshots`

```sql
CREATE TABLE IF NOT EXISTS stock_snapshots (
  variant_id        UUID NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
  warehouse_id      UUID NOT NULL REFERENCES warehouses(id),
  snapshot_date     DATE NOT NULL,
  quantity_on_hand  INT  NOT NULL,
  quantity_reserved INT  NOT NULL DEFAULT 0,
  PRIMARY KEY (variant_id, warehouse_id, snapshot_date)
);
```

- Append-only, ein Zeilensatz pro Variante/Lager/Tag. Muster analog zu
  `bpm_price_history` (PK inkl. Datum).
- In `db/schema.sql` (idempotentes `CREATE TABLE IF NOT EXISTS`) ergänzen; RLS in
  `db/rls.sql` analog zu den übrigen ERP-Tabellen.

### 1b. Täglicher Snapshot-Job

Neu: `scripts/snapshot-stock.ts` (`npm run snapshot:stock`):

1. Aktuellen Woo-Bestand über `WooCommerceMirror` ziehen und `stock_levels`
   aktualisieren (vorhandene Backfill-Logik aus `scripts/backfill-stock-and-reorder.ts`
   wiederverwenden / extrahieren).
2. Heutigen Stand aus `stock_levels` in `stock_snapshots` schreiben — idempotent
   pro Tag (`ON CONFLICT (variant_id, warehouse_id, snapshot_date) DO UPDATE`).

Einhängung: in den vorhandenen stündlichen Cron (`src/lib/sync/runner.ts` →
`runDue()`) als fällige Aufgabe mit **Tages-Guard** (no-op, wenn heutiger Snapshot
existiert). Kein neuer Cron-Prozess.

### 1c. Berechnungen (`src/verfuegbarkeit/`)

- **`history.ts`**
  - `stockSeries(variantId, from, to)` → `[{ date, quantity }]` aus `stock_snapshots`
    (Summe über Lager je Tag).
  - `salesSeries(variantId, from, to, bucket)` → `[{ date, units }]` aus
    `sales_order_lines` + `sales_orders.placed_at`, exkl. `angebot`/`storniert`.
  - Kategorie-Varianten: `stockSeriesByCategory` / `salesSeriesByCategory` (Summe über
    alle Varianten der Kategorie via `products.category`).
- **`forecast.ts`**
  - `forecast(variantId, window)` →
    `{ avgDailyConsumption, reichweiteTage, leerAmDatum, reorderPoint, bestellvorschlag }`.
  - `avgDailyConsumption` = Verkaufsmenge im 90-Tage-Fenster / 90 (Fenster passend
    zur Übersee-Vorlaufzeit; nutzt die Rechenlogik aus `reorder.ts`).
  - `reichweiteTage` = aktueller Bestand / `avgDailyConsumption` (∞ wenn Verbrauch 0).
  - `leerAmDatum` = heute + `reichweiteTage`.
  - `bestellvorschlag` gesetzt, wenn Bestand ≤ `reorder_point`; Menge über
    `reorderBufferUnits`.
- **Kategorie-Rollup** fürs Dashboard: je Kategorie
  `{ gesamtbestand, anzahlUnterMeldebestand, kuerzesteReichweiteTage }`.

## Block 2 — UI, Doku & Tests

### 2a. Dashboard-Einstieg (`src/app/(shell)/verfuegbarkeit/page.tsx`)

- **KPI-Zeile** (`KpiCard`): Gesamtbestand, Artikel unter Meldebestand,
  Artikel mit Reichweite < 90 Tagen (Übersee-Vorlaufzeit).
- **Kategorie-Übersicht** (Tabelle/Kacheln je `products.category`): Bestand,
  Reorder-Alert-Zähler, kürzeste Reichweite → Klick → Kategorie-Ansicht.
- Bestehende Bestandsliste (`BestandListe`) bleibt erreichbar unter
  `verfuegbarkeit/liste` (Tab/Unterseite).

### 2b. Artikel-Detail (`src/app/(shell)/verfuegbarkeit/[variantId]`)

Bestehende `BestandDetail` erweitern:

- **Bestandsverlauf** (Recharts `LineChart`) + **Verkaufskurve** (`BarChart`)
  übereinander, gemeinsame Zeitachse. Reuse `ChartCard` + `chart-style.ts`
  (Marken-Farben, `num`-Formatter); Muster wie `BpmStockChart`.
- **Prognosekachel**: Reichweite in Tagen, voraussichtliches Leerdatum,
  Bestellvorschlag (Menge + „ab jetzt bestellen"-Hinweis wenn ≤ `reorder_point`).

### 2c. Kategorie-Ansicht (`src/app/(shell)/verfuegbarkeit/kategorie/[category]`)

- Aggregierte Bestands- + Verkaufskurve über alle Varianten der Kategorie.
- Liste der Artikel mit Reorder-Status (Drilldown in Artikel-Detail).

### 2d. Hilfe-Doku (`src/lib/help/content.ts`) — verpflichtend

- Datenmodell-Seite um `stock_snapshots` ergänzen.
- Verfügbarkeit-/Dashboard-Nutzung dokumentieren (Bestandsverlauf, Verkaufskurve,
  Prognose).

### 2e. Tests (TDD)

- **Vitest:**
  - `forecast.ts`: Prognose-Mathematik (Reichweite, Leerdatum, Bestellvorschlag),
    inkl. Verbrauch=0 → keine endliche Reichweite.
  - Snapshot-Idempotenz: zweimal am selben Tag → eine Zeile.
  - Reihen-Queries: Bestand/Verkauf je Variante und je Kategorie.
  - Kategorie-Rollup.
- **UI-Verifikation:** Deploy auf dem **VPS** (`root@194.164.204.249`,
  https://budp.lumeapps.de — Projektregel: kein lokaler Lauf) und Dashboard-,
  Detail- und Kategorie-Seiten selbst im Browser durchklicken vor Übergabe.

### Design-System

Alle neuen Views strikt nach ERP-Standard (`docs/design/design-system.md`):
warme `neutral`-Palette, Akzent nur via `--accent`, Dark-Mode-Varianten,
`.anno`-Mikrolabels für UPPERCASE. Keine kalten Grautöne, keine Fremd-Akzentfarbe.

## Bewusst weggelassen (YAGNI)

- Rückwirkende Bestandsrekonstruktion aus Verkäufen/Wareneingängen.
- Trend-/Saison-Prognosemodell.
- Multi-Lager-Prognose (Prognose zunächst über Gesamtbestand je Variante).

## Abhängigkeiten / Risiken

- Aussagekraft der Bestandskurve hängt am täglich laufenden Snapshot-Job — Ausfall =
  Lücke in der Kurve. Tages-Guard verhindert Doppelzeilen, füllt aber keine
  ausgelassenen Tage nach.
- Verkaufskurve deckt nur über `src/woocommerce/order-import.ts` importierte Orders
  ab; Positionen mit unbekannter SKU werden übersprungen (bestehendes Verhalten).
