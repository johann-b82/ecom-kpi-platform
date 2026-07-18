# Design: Verfügbarkeit — Warenwert-KPI, Meldebestand auf 90-Tage-Reichweite, KPI-Fokus

Datum: 2026-07-18
Modul: Verfügbarkeit (`src/app/(shell)/verfuegbarkeit/…`, `src/verfuegbarkeit/…`, `src/components/…`)
Baut auf: `2026-07-18-ui-kpi-kurven-tabellenfilter-zeitraum-design.md` (KPI-Kurven, DataTable, Zeitraum)

## Ziel

Drei Nachbesserungen am Verfügbarkeit-Modul:

1. Der Fokus-/Aktiv-Zustand der ausgewählten KPI-Kachel ist zu dezent → deutlich sichtbarer machen.
2. Neue KPI **„Warenwert im Lager"** (mit Verlaufskurve wie Gesamtbestand); dafür entfällt die KPI **„Unter Meldebestand"**.
3. Klick auf **„Reichweite < 90 Tage"** führt zur Meldebestand-Seite; die Meldebestand-Logik wird von `reorder_point` auf dieselbe **90-Tage-Reichweite** umgestellt.

## Bestand (Ist-Zustand)

- KPI-Kacheln + Kurve: `KpiTrendRow`/`KpiTrendItem` (`src/components/KpiTrendRow.tsx`) — Kacheln mit `series` sind Akkordeon-Kurven; **kein** `href`/Link-Modus. Aktiver Zustand aktuell `ring-2 ring-accent bg-accent/5` (zu dezent).
- Verfügbarkeit-Dashboard: `VerfuegbarkeitDashboard.tsx` rendert 3 Kacheln (Gesamtbestand mit `stockSeries`, Unter Meldebestand, Reichweite < 90 Tage) + Kategorie-`DataTable`. Daten aus `dashboardKpis()` + `categoryRollup()` + `stockTotalSeries(range)` (`src/verfuegbarkeit/history.ts`, `src/app/(shell)/verfuegbarkeit/page.tsx`).
- „Kritisch/Reichweite < 90" (Rollup, `history.ts` `categoryRollup`): `on_hand < Σ verkaufte Menge der letzten 90 Tage` (CTE `sold`, Fenster `CURRENT_DATE - 90`).
- Meldebestand: `listReorderSuggestions()` (`src/verfuegbarkeit/repository.ts:148-166`) — Kriterium `available (= on_hand − reserved) < reorder_point`, nur `reorder_point > 0`. `suggestedQty = max(1, reorder_point*2 − available)`. Zeilen-Typ `ReorderSuggestion` (`types.ts:45-48`): `variantId, sku, productName, reorderPoint, available, defaultSupplierId, defaultSupplierName, suggestedQty`. Anzeige in `MeldebestandListe.tsx`; „Nachbestellung entwerfen" → `createDraftPurchaseOrderAction` (nutzt `defaultSupplierId` + `suggestedQty`).
- Prognose-Konstanten (`src/verfuegbarkeit/forecast.ts`): `CONSUMPTION_WINDOW_DAYS = 90`, `LEAD_TIME_DAYS = 90`.
- EK: `product_variants.purchase_price NUMERIC(12,2)` **nullable**, häufig NULL („EK unvollständig", vgl. `KanalVergleich.tsx`). Keine EK-Historie. `stock_snapshots(variant_id, warehouse_id, snapshot_date, quantity_on_hand)`.
- Bucket-Helfer: `src/lib/series.ts` `pickBucket` + `bucketSum` (summiert je Bucket).
- Meldebestand-Route: `/verfuegbarkeit/meldebestand`.

## Entwurf

### A. Fokus-/Aktiv-Zustand der KPI-Kachel (Punkt 1)

- In `KpiTrendRow` den aktiven (geöffneten) Zustand deutlicher gestalten: **2px Accent-Ring mit Ring-Offset** gegen den Seiten-Hintergrund plus kräftigerer Tint.
  - Aktiv-Klassen: `ring-2 ring-accent ring-offset-2 ring-offset-neutral-0 dark:ring-offset-neutral-950 bg-accent/10 dark:bg-accent/15`.
- Hover-Zustand für klickbare Kacheln bleibt (`hover:ring-2 hover:ring-accent/40`). Nur Accent-Token, warme Neutrals, Dark-Mode — design-system-konform.

### B. KPI „Warenwert im Lager" mit Verlauf (Punkt 2)

- **Aktueller Wert:** `Σ(stock_levels.quantity_on_hand × COALESCE(product_variants.purchase_price, 0))` über alle Varianten/Lager. Zusätzlich Flag `ekUnvollstaendig = bool_or(purchase_price IS NULL)` über Varianten **mit Bestand > 0**.
  - Neue Repo-Funktion in `history.ts`: `warenwertKpi(): Promise<{ warenwert: number; ekUnvollstaendig: boolean }>`.
- **Verlauf:** `Σ(stock_snapshots.quantity_on_hand × COALESCE(pv.purchase_price,0))` je `snapshot_date` im Bereich (aktueller EK × historische Menge — mangels EK-Historie die einzige Option).
  - Neue Repo-Funktion in `history.ts`: `warenwertSeries(range: DateRange): Promise<SeriesPoint[]>`.
- **Kacheln neu** (3 Stück): Gesamtbestand · **Warenwert im Lager** · Reichweite < 90 Tage. Die Kachel „Unter Meldebestand" **entfällt**.
  - Warenwert-Kachel: `format: 'eur'`, `series: warenwertSeriesBucketed`, klickbar (Kurve). Bei `ekUnvollstaendig` ein dezenter Hinweis („EK unvollständig") — als normaler `text-xs`-Neutraltext (nicht `.anno`, kein Uppercase-Satz).
    - Umsetzung: `KpiTrendItem` erhält ein optionales `hint?: string`, das die Kachel unter dem Wert rendert. (Vermeidet, den Hinweis in `anno` zu pressen.)
- **Bucket-Korrektheit (Bestandsgrößen):** Bestands-/Wertreihen sind Bestandsgrößen, keine Flüsse — beim Bündeln (Woche/Monat) **nicht summieren**.
  - Neuer Helfer in `src/lib/series.ts`: `bucketLast(points: SeriesPoint[], bucket): SeriesPoint[]` — pro Bucket der **letzte** (chronologisch jüngste) Wert.
  - Gesamtbestand (`stockTotalSeries`) und Warenwert nutzen `bucketLast`; `bucketSum` bleibt für Umsatz/Sales (Verkauf-Übersicht).

### C. Meldebestand = Reichweite < 90 Tage (Punkt 3)

- **Kriterium ersetzen** in `listReorderSuggestions()`: Artikel gelten als nachzubestellen, wenn `on_hand < Σ verkaufte Menge der letzten 90 Tage` (identisch zur „Kritisch"-Formel im Rollup; `on_hand`, nicht `available`, damit KPI-Zahl = Zeilenzahl). Nur Varianten mit `units_90d > 0`.
  - Bestellvorschlagsmenge: `suggestedQty = max(1, units_90d − on_hand)` (Ziel: 90-Tage-Bedarf decken; entspricht `ceil(avg × LEAD_TIME_DAYS) − on_hand` bei `avg = units_90d/90`).
  - `reorder_point` wird für die Meldebestand-Liste **nicht mehr** verwendet (bleibt im Datenmodell/Schema).
- **Zeilen-Typ `ReorderSuggestion` anpassen:** `reorderPoint`/`available` ersetzen durch `onHand: number`, `units90d: number`, `reichweiteTage: number | null` (= `on_hand / (units_90d/90)`, null wenn `units_90d = 0` — kommt hier nicht vor). `defaultSupplier*` + `suggestedQty` bleiben.
- **`MeldebestandListe.tsx` Spalten:** SKU · Produkt · **Bestand** · **Absatz 90T** · **Reichweite (Tage)** · **Bestellvorschlag** · Lieferant. „Nachbestellung entwerfen" unverändert (nutzt `defaultSupplierId` + `suggestedQty`).
- **KPI-Klick → Link:** `KpiTrendItem` erhält optionales `href?: string`. In `KpiTrendRow`: Kachel mit `href` wird ein `next/link`-`Link` (navigiert), **ohne** Akkordeon/Kurve; Hover/Fokus-Styling wie bei klickbaren Kacheln. `href` und `series` schließen sich gegenseitig aus. Die „Reichweite < 90 Tage"-Kachel bekommt `href: '/verfuegbarkeit/meldebestand'`.
- **Rollup-Tabelle:** Spalte „Unter Meldebestand" **entfernen** → Kategorie · Artikel · Bestand · Kritisch (< 90 T). Das Feld `anzahlUnterMeldebestand` aus `CategoryRollupRow`, `categoryRollup()` und `unterMeldebestand` aus `dashboardKpis()` entfernen (nirgends sonst genutzt, nachdem KPI + Spalte weg sind).

## Datenfluss

- `verfuegbarkeit/page.tsx` lädt zusätzlich `warenwertKpi()` + `warenwertSeries(range)`; bündelt Bestands-/Wertreihen mit `bucketLast`, Verkaufsreihen (falls) mit `bucketSum`. Übergibt `warenwert`, `ekUnvollstaendig`, `warenwertSeries`, `stockSeries` an `VerfuegbarkeitDashboard`.
- `VerfuegbarkeitDashboard` baut die 3 `KpiTrendItem` (Gesamtbestand, Warenwert [+hint], Reichweite<90 [href]) und die Rollup-`DataTable` (ohne Unter-Meldebestand-Spalte).

## Tests & Verifikation

- **Vitest:**
  - `bucketLast`: letzter Wert je Tages-/Wochen-/Monats-Bucket; leere Eingabe → leer; chronologische Sortierung.
  - `warenwertKpi`/`warenwertSeries` (DB, Test-DB): Wert = Σ(menge×EK); NULL-EK zählt 0; `ekUnvollstaendig` korrekt; Serie je Snapshot-Tag.
  - `listReorderSuggestions` (DB): nur `on_hand < units_90d`; `suggestedQty = max(1, units_90d − on_hand)`; Zeilenzahl = „kritisch"-Zähler des Rollups auf denselben Fixtures.
- **UI-Verifikation** (bryx-test, Browser): Fokus-Ring deutlich; Warenwert-Kachel + €-Kurve + EK-Hinweis; „Reichweite<90" navigiert zu Meldebestand; Meldebestand-Liste zeigt Reichweite-Artikel mit neuen Spalten; Rollup ohne Unter-Meldebestand-Spalte.

## Doku (Projektregel)

- Hilfe-Modul `src/lib/help/content.ts` (Verfügbarkeit): KPI „Warenwert im Lager" ergänzen; Meldebestand-Beschreibung von „unter Meldebestand" auf „Reichweite unter 90 Tagen" umstellen; „Unter Meldebestand"-KPI streichen.

## Nicht im Scope

- Keine EK-Preishistorie (Verlauf nutzt aktuellen EK × historische Menge).
- `reorder_point`-Feld/-Spalte bleibt im Schema (nur ungenutzt für die Meldebestand-Liste).
- Keine Änderung an „Nachbestellung entwerfen"/Purchase-Order-Flow außer der geänderten `suggestedQty`.
