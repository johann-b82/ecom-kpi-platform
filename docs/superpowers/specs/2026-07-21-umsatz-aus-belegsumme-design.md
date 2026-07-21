# Umsatz aus gespeicherter Belegsumme — Design

**Datum:** 2026-07-21
**Status:** Entwurf zur Umsetzung
**Betrifft:** `db/schema.sql`, `src/woocommerce/order-import.ts`,
`src/verkauf/repository.ts`, `src/kontakte/analytics.ts`,
`src/components/VerkaufDetail.tsx`

## Problem

Der WooCommerce-Bestellimport ordnet Belegpositionen ausschließlich über die
**SKU** zu. Positionen ohne SKU-Treffer werden verworfen. Beim Prod-Import
(bryxtoys.com, 13.993 Belege) betraf das 5.738 von 20.795 Positionen.

Ursache sind **im Shop gelöschte Produkte**: WooCommerce behält Name und Preis
am historischen Beleg, setzt aber `product_id = 0` und liefert keine SKU mehr.
Es sind echte Verkaufsartikel, keine Gebühren. Unbekannte SKUs gab es **null** —
die Lücke entsteht ausschließlich durch fehlende SKUs.

`sales_orders` hat **keine Summenspalte**; jeder Umsatzwert der App wird zur
Laufzeit als `SUM(quantity * unit_price)` über `sales_order_lines` berechnet.
Die verworfenen Positionen senken damit direkt den ausgewiesenen Umsatz.

**Gemessen** an 400 Belegen quer durch die Historie:

| | |
|---|---|
| Woo Positions-Netto | 18.143,62 € |
| importiert | 13.704,94 € |
| **Verlust** | **24,5 %** |

983 der 13.993 Belege (7 %) haben gar keine Position und zählen mit 0 €.

## Entwurf

### 1. Schema: nullable Summenspalte

```sql
ALTER TABLE sales_orders ADD COLUMN IF NOT EXISTS total_net NUMERIC(12,2);
```

**Bewusst nullable.** Damit muss die Spalte *nicht* an jedem Schreibpfad
gepflegt werden (Anlegen, Positionen ändern, Retoure, Import) — es gibt keine
Invariante, die auseinanderlaufen kann. Belege ohne gespeicherte Summe rechnen
weiter aus ihren Positionen.

### 2. Import schreibt die echte Netto-Summe

`importWooCommerceOrders` berechnet je Beleg die Summe über
`line_items[].total` — **nach Rabatt** (`subtotal` wäre vor Rabatt und würde
Rabatte als Umsatz ausweisen) und **ohne Steuer/Versand**, passend zur
Netto-Semantik der App.

Die Summe wird über **alle** Woo-Positionen gebildet, auch über die ohne SKU.
Genau daraus entsteht die Korrektur.

`total_net` wird auf beiden Import-Pfaden gesetzt: beim Neuanlegen **und** beim
erneuten Import bestehender Belege (`ordersLinked`/`ordersUpdated`). Nur so
wirkt ein Nachlauf auf bereits importierte Belege.

### 3. Umsatz-Abfragen: `COALESCE` je Beleg

Ein gemeinsames SQL-Fragment in `repository.ts`, analog zum bestehenden
`REVENUE_STATUS_SQL`:

```sql
COALESCE(o.total_net, (
  SELECT COALESCE(SUM(l.quantity * l.unit_price), 0)
    FROM sales_order_lines l WHERE l.order_id = o.id
))
```

**Kritisch — der JOIN muss weg.** Die heutigen Abfragen lauten

```sql
FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id = o.id
… SUM(l.quantity * l.unit_price) …
```

Setzt man dort einen *Beleg*-Wert ein, zählt ihn der JOIN **einmal je
Position** — der Umsatz vervielfacht sich. Jede umgestellte Abfrage verliert
deshalb den `LEFT JOIN sales_order_lines` und summiert den Belegwert über
`sales_orders`. `COUNT(DISTINCT o.id)` kann bleiben (bleibt korrekt).

**Umzustellen (Beleg-Ebene):**

| Datei | Funktion | Zweck |
|---|---|---|
| `verkauf/repository.ts` | `salesTotals` | Haupt-Umsatz-KPI + Stornoquote |
| | `revenueNetTotal` | Umsatzkachel Startseite |
| | `salesDailySeries` | Umsatzverlauf + Storno je Tag |
| | `revenueByDay` | Umsatzverlauf je Kanal |
| | `channelSummary` | Umsatz je Kanal → Deckungsbeitrag |
| | `ecomSalesFacts` | Umsatz/AOV/CLV im STDC-Dashboard |
| | `createDebitorOpenItem` | Rechnungsbetrag im offenen Posten |
| `kontakte/analytics.ts` | `customerMetrics` (clv, p_revenue) | Kundenanalyse |
| | `customerKpis` | Kopfzahlen Kundenanalyse |
| | `customerSummary` | Kundendetail |
| | `customerOrders` | Bestellhistorie je Beleg |
| `components/VerkaufDetail.tsx` | Belegsumme | Beleg-Detail + Deckungsbeitrag |

**Nicht umzustellen (Positions-Ebene):** `topProducts` braucht die Zuordnung
Umsatz→Produkt. Die existiert für gelöschte Artikel nicht.

### 4. Bekannte, akzeptierte Grenze

**Top-Produkte bleiben unvollständig.** Die Summen stimmen nach dieser
Änderung, die Aufschlüsselung nach Produkt nicht — Positionen ohne SKU lassen
sich keinem Produkt zuordnen. Das ist der Datenlage geschuldet und nicht
behebbar, ohne die gelöschten Produkte im Shop wiederherzustellen.

Ebenso bleibt der **Wareneinsatz** positionsbasiert
(`quantity × purchase_price`): Ohne Variante gibt es keinen EK. Der
Deckungsbeitrag betroffener Belege fällt dadurch zu hoch aus — Umsatz ist
vollständig, die Kosten nicht. Das ist die ehrlichere Richtung als beides zu
kürzen, muss aber bekannt sein.

## Tests

1. **`mapOrderTotal`** (neue reine Funktion): summiert `line_items[].total`,
   inklusive Positionen ohne SKU; leere Liste → 0; fehlendes Feld → 0.
2. **Import setzt `total_net`** — auch beim erneuten Import (Idempotenz).
3. **`salesTotals`**: Beleg mit `total_net` = 100 und nur einer Position à 30
   liefert **100**, nicht 30 — beweist Vorrang der gespeicherten Summe.
4. **Kein Vervielfachen**: Beleg mit `total_net` = 100 und **drei** Positionen
   liefert **100**, nicht 300 — bewacht die JOIN-Falle aus §3.
5. **Fallback**: Beleg ohne `total_net` rechnet unverändert aus Positionen
   (bestehende Tests müssen grün bleiben).
6. Analoge Abdeckung für `channelSummary`, `ecomSalesFacts` und
   `customerKpis`.

## Rollout

1. Migration (additiv, nullable — kein Backfill nötig).
2. Deploy auf bryx-test, Tests grün.
3. Prod: Deploy, dann `npm run import:woocommerce-orders` erneut laufen lassen —
   idempotent, setzt `total_net` auf den bestehenden 13.993 Belegen nach.
4. Gegenprobe: Stichprobe erneut gegen die Woo-Positionssummen; erwartete
   Abweichung ≈ 0 % statt 24,5 %.
