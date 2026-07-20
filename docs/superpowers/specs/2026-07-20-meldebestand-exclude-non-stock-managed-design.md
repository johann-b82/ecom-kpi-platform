# Meldebestand: nicht-bestandsgeführte Produkte ausschließen

**Datum:** 2026-07-20
**Status:** Design abgenommen (offene Detailfragen entschieden)

## Problem

In *Verfügbarkeit · Meldebestand* erscheinen virtuelle Produkte ohne echten
Bestand — konkret Geschenkgutscheine (`8-WooCommerce`, `115-WooCommerce`). Sie
zeigen `BESTAND -1`, `REICHWEITE -90T` und einen `VORSCHLAG` zur Nachbestellung,
obwohl es für einen Gutschein keinen physischen Lagerbestand gibt.

**Ursache:** Das ERP kennt keinen Begriff „bestandsgeführt vs. nicht". Das
Meldebestand-Kriterium ist rein *„in 90 Tagen ≥1 verkauft UND Bestand < 90-Tage-
Absatz"* (`listReorderSuggestions`, `src/verfuegbarkeit/repository.ts:148-183`).
Ein Gutschein ist in WooCommerce ein virtuelles Produkt; der Store liefert
`stock_quantity: -1` (Backorder-Sentinel). Die Stock-Ingestion
(`stock-refresh.ts`, `scripts/backfill-stock-and-reorder.ts`) kopiert diese `-1`
ungefiltert in `stock_levels.quantity_on_hand`. Da `-1 < 1` und der Gutschein
„verkauft", erfüllt er das Kriterium und taucht auf.

Die unterscheidenden WooCommerce-Felder (`virtual`, `manage_stock`, `type`)
liegen bereits als JSON in `external_references.raw_payload` vor — das ERP liest
sie nur nie zurück.

## Ausschlusskriterium

Eine Variante ist **nicht bestandsgeführt**, wenn **irgendeine** ihrer
WooCommerce-Referenzen `virtual = true` **oder** `manage_stock = false` hat.
Werte `manage_stock = "parent"` und `= true` gelten als bestandsgeführt.

„Irgendeine Referenz" ist nötig, weil eine ERP-Variante mehrere Refs mit
widersprüchlichen Flags tragen kann: Der Gutschein hat eine bestandsgeführte
`variable`-Parent-Ref neben `virtual`-`variation`-Refs (alle auf dieselbe
Variante gemappt, da SKU-identisch).

Store-weite Verteilung (gespiegelte Varianten-Refs), zur Einordnung:

| type      | virtual | manage_stock | n    | bestandsgeführt |
|-----------|---------|--------------|------|-----------------|
| variation | false   | true         | 2068 | ja              |
| variable  | false   | true         | 401  | ja              |
| variation | false   | **false**    | 72   | **nein**        |
| simple    | false   | true         | 38   | ja              |
| variation | **true**| parent       | 3    | **nein** (Gutschein) |
| variable  | false   | **false**    | 2    | **nein**        |
| variation | **true**| true         | 1    | **nein**        |
| simple    | false   | **false**    | 1    | **nein**        |

## Lösung

Ein abgeleitetes Boolean `product_variants.is_stock_managed` persistieren und
das *kritisch*-/Nachbestell-Kriterium darauf gaten. Befüllung beim Katalog-
Import plus einmaliger Backfill aus vorhandenem `raw_payload`.

### 1. Schema

`db/schema.sql`, additive idempotente Migration (Muster wie `ad_spend.is_demo`,
Zeile 494):

```sql
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS is_stock_managed BOOLEAN NOT NULL DEFAULT true;
```

Default `true` → manuell angelegte / nicht-Woo-Varianten bleiben „bestandsgeführt"
(unverändert). Anwendung via `scripts/migrate.ts`.

### 2. Ableitungsfunktion (rein, neu)

Neuer Helper in `src/woocommerce/` (behandelt JSON-Boolean **und** String-Form,
da die Woo-API `manage_stock: "parent"` als String, `virtual: true` als Boolean
liefert):

```ts
export function isStockManaged(raw: Record<string, unknown>): boolean {
  if (raw.virtual === true || raw.virtual === 'true') return false;
  if (raw.manage_stock === false || raw.manage_stock === 'false') return false;
  return true; // 'parent' / true / fehlend → bestandsgeführt
}
```

### 3. Befüllung beim Import

`src/woocommerce/catalog-import.ts`: sowohl `importWooCommerceProducts` als auch
`importWooCommerceVariations` setzen das Flag **AND-akkumulierend** per
dediziertem UPDATE, nachdem die `variantId` aufgelöst ist (deckt Insert- wie
Link-Pfad gleich ab):

```sql
UPDATE product_variants SET is_stock_managed = is_stock_managed AND $flag WHERE id = $variantId;
```

mit `$flag = isStockManaged(raw)`. So kann eine spätere `virtual`-
Variationsreferenz eine Variante auf `false` kippen, aber nie zurück — das
entspricht „irgendeine Ref nicht-bestandsgeführt → Variante nicht-
bestandsgeführt". Autoritative Neuberechnung liefert der Backfill (Schritt 4).

### 4. Einmaliger Backfill

`scripts/backfill-stock-and-reorder.ts` um einen UPDATE erweitern, der alle
bereits gespiegelten Varianten setzt:

```sql
UPDATE product_variants v SET is_stock_managed = sub.managed
FROM (
  SELECT er.entity_id,
         COALESCE(bool_and(NOT (er.raw_payload->>'virtual' = 'true'
                                OR er.raw_payload->>'manage_stock' = 'false')), true) AS managed
    FROM external_references er
   WHERE er.source_system = 'woocommerce' AND er.entity_type = 'product_variant'
   GROUP BY er.entity_id
) sub
WHERE v.id = sub.entity_id;
```

`bool_and` → Variante nur bestandsgeführt, wenn *alle* Refs es sind. `COALESCE(…,
true)` fängt den Fall ab, dass beide Felder fehlen (per-Ref-Wert `NULL`, sonst
NOT-NULL-Verletzung); fehlende Evidenz = bestandsgeführt. Der Backfill ist die
autoritative Neuberechnung (`=`), Re-Run jederzeit möglich.

### 5. Query-Gate

`AND v.is_stock_managed` an **beiden** Stellen ergänzen (hält die Invariante
„Zeilenzahl der Liste == Σ kritisch"):

- `listReorderSuggestions` WHERE — `src/verfuegbarkeit/repository.ts:170`
- `categoryRollup` kritisch-FILTER — `src/verfuegbarkeit/history.ts:101-102`
  (fließt in `dashboardKpis`)

## Bewusst außerhalb des Scopes

- **`gesamtbestand` / `variant_count`** zählen weiterhin *alle* Varianten. Nur das
  *kritisch*-/Nachbestell-Kriterium gated auf `is_stock_managed`. `gesamtbestand`
  ist rein informativ; die verbleibende `-1` drückt die Summe vernachlässigbar.
- **Die literale `-1` in `stock_levels`** bleibt bestehen und zeigt sich weiter als
  `BESTAND -1` in der reinen *Bestand*-Liste. Sauberes Unterdrücken hieße, in die
  Stock-Ingestion einzugreifen (für nicht-bestandsgeführte Produkte gar keinen
  Bestand schreiben) — ein eigener, breiterer Change. Separater Follow-up.

## Tests & Verifikation

- **Unit-Test** für `isStockManaged` (ohne DB, im Stil des `mapProduct`-Tests in
  `tests/woocommerce/catalog-import.test.ts`): `virtual=true` → false;
  `manage_stock=false` → false; `manage_stock='parent'`/`true`/fehlend → true;
  String- und Boolean-Formen. **TDD-Anker, hier garantiert lauffähig.**
- **Empirische Dev-DB-Verifikation:** Migration + Backfill anwenden; prüfen, dass
  die Gutschein-SKUs aus `listReorderSuggestions()` verschwinden und `kritisch`
  um exakt die Zahl der nicht-bestandsgeführten, unterdeckten Varianten sinkt;
  anschließend `/verfuegbarkeit/meldebestand` im Browser gegenprüfen.
- **Optional**, falls die Seed-Suite auf der Test-DB läuft: `seedVerfuegbarkeit`
  um eine virtuelle, verkaufte, unterdeckte Variante erweitern und in
  `tests/verfuegbarkeit/repository.test.ts` deren Ausschluss aus
  `listReorderSuggestions` assertieren.

## Betroffene Dateien

- `db/schema.sql` — neue Spalte
- `src/woocommerce/catalog-import.ts` — `isStockManaged` + Befüllung (2 Import-Pfade)
- `scripts/backfill-stock-and-reorder.ts` — Backfill-UPDATE
- `src/verfuegbarkeit/repository.ts` — Query-Gate
- `src/verfuegbarkeit/history.ts` — kritisch-FILTER-Gate
- `tests/woocommerce/catalog-import.test.ts` (o. neue Datei) — Unit-Test
