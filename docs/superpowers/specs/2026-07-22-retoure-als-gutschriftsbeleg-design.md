# Retoure als eigener Gutschriftsbeleg — Design

**Datum:** 2026-07-22
**Status:** Entwurf zur Umsetzung
**Betrifft:** `src/woocommerce/mirror.ts`, `src/woocommerce/order-import.ts`

## Problem

Retouren entstehen heute aus zwei Quellen mit **gegensätzlichem Verhalten**:

| Quelle | Modell | Betrag | Wirkung auf den Umsatz |
|---|---|---|---|
| App (`createReturn`) | **zwei** Belege: Original bleibt `bezahlt`, separate Gutschrift mit `related_order_id` | negativ | senkt korrekt |
| Woo-Import (`refunded`) | **ein** Beleg: das Original wird auf `retoure` umgestempelt | positiv | **erhöht fälschlich** |

Beide teilen sich den Status `retoure`. Der Umsatzfilter
`REVENUE_STATUS_SQL = "o.status <> 'storniert'"` lässt `retoure` durch — richtig
für App-Gutschriften (negativ), falsch für Woo-Refunds (positiv).

**Auf Prod:** 56 Belege, alle mit `related_order_id IS NULL` (also Woo-Refunds),
die zusammen **+2.472,97 €** zum Umsatz beitragen, obwohl das Geld an die Kunden
zurückging.

Ein pauschaler Filter löst das nicht: „alle `retoure` raus" bräche die
App-Gutschriften, „alle negativ" bräche die Woo-Refunds (−X statt 0).

## Entwurf

**Eine Regel, quellenunabhängig: Eine Retoure ist immer ein eigener
Gutschriftsbeleg** — negativer `total_net`, `related_order_id` auf den Ursprung.
Das ist exakt das Modell, das `createReturn` bereits verwendet; der Woo-Import
wird darauf angehoben.

### 1. Der Verkaufsbeleg bleibt ein Verkaufsbeleg

`STATUS_MAP`: `refunded: 'retoure'` → **`refunded: 'bezahlt'`**.

Ein erstatteter Beleg wurde vor der Erstattung bezahlt (`date_paid` ist gesetzt).
Der Verkauf bleibt damit als Verkauf sichtbar, mit seinem ursprünglichen Datum.

### 2. Je Erstattung ein Gutschriftsbeleg

Für jeden Eintrag in `refunds[]` des Woo-Belegs entsteht ein zusätzlicher Beleg:

| Feld | Wert |
|---|---|
| `number` | `WC-{Belegnummer}-R{refundId}` |
| `status` | `retoure` |
| `related_order_id` | ID des Ursprungsbelegs |
| `contact_id`, `channel`, `currency` | wie Ursprungsbeleg |
| `placed_at` | **Erstattungsdatum** (`date_created` der Erstattung) |
| `total_net` | **negativ** (siehe §3) |
| Positionen | **keine** — siehe „Bewusste Grenzen" |
| Event | ein `retoure`-Event zum Erstattungsdatum |

**Idempotenz:** `external_references` mit `entity_type='sales_order'` und
`external_id = 'refund:{refundId}'`. Ein zweiter Import legt nichts doppelt an.

### 3. Betrag der Gutschrift

Die Erstattung liefert brutto `total` (negativ) und `total_tax`. Der ERP rechnet
netto. Reine Funktion:

```
mapRefundNet(refund): number   // immer <= 0
```

- Wenn `line_items` vorhanden: Summe der Positions-`total` (netto).
- Sonst: `|total| − |total_tax|`.
- Ergebnis wird immer als `-Math.abs(...)` zurückgegeben — das Vorzeichen ist
  damit unabhängig davon, wie WooCommerce es liefert.

### 4. Datenbeschaffung

- `fetchOrdersRaw`: `refunds` in die `_fields`-Liste aufnehmen (fehlt heute).
  Damit ist ohne Zusatzaufruf erkennbar, **ob** ein Beleg Erstattungen hat.
- Neue Methode `fetchOrderRefunds(orderId)` → `GET /orders/{id}/refunds`.
  Liefert **alle** Erstattungen eines Belegs mit Detail (`date_created`,
  `amount`, `total_tax`, `line_items`) in **einem** Aufruf.
- Der Aufruf erfolgt **nur** für Belege mit nicht-leerem `refunds[]` — bei
  ~56 betroffenen Belegen vernachlässigbar.

### 5. Der Umsatzfilter bleibt unverändert

`REVENUE_STATUS_SQL = "o.status <> 'storniert'"` — **kein Sonderfall.**
Gutschriften sind negativ und netten sich von selbst. Das ist der eigentliche
Gewinn dieses Entwurfs: Die Korrektheit liegt im Datenmodell, nicht in einer
Filterregel, die jede künftige Abfrage kennen müsste.

### 6. Beide Import-Pfade

Neuanlage **und** erneuter Import müssen Gutschriften anlegen. Der
Bestandspfad ist der wichtigere: Nur über ihn korrigiert der Nachlauf die
56 bereits importierten Belege auf Prod.

## Wirkung

**Prod, nach dem Nachimport:**
- 56 Belege wechseln von `retoure` (+2.472,97) auf `bezahlt` (+2.472,97)
- 56 neue Gutschriften mit zusammen −2.472,97
- **Netto-Effekt auf den Umsatz: −2.472,97 €** (von 597.612,71 auf 595.139,74)

**Zusätzlich gelöst:**
- **Periodengerechtigkeit.** Verkauf und Gutschrift stehen in ihren jeweiligen
  Perioden (Beispiel aus der API: Verkauf 22.06., Erstattung 14.07.). Bisher
  hätte eine Juli-Erstattung den Juni-Umsatz verändert.
- **Teilerstattungen** fallen automatisch mit ab, weil das Modell an `refunds[]`
  hängt und nicht am Belegstatus. (Stichprobe über 400 Belege: 4 Erstattungen,
  davon 0 Teilerstattungen — in diesem Shop derzeit ohne Praxisrelevanz, aber
  ohne Mehraufwand mitgelöst.)

## Bewusste Grenzen

- **Gutschriften haben keine Positionszeilen**, nur `total_net`. Positionen wären
  wegen der bekannten SKU-Lücke (gelöschte Produkte) ohnehin unvollständig, und
  `total_net` hat in allen Umsatzabfragen Vorrang. Folge: Die Gutschrift taucht
  in `topProducts` nicht auf — dort bleibt der Umsatz produktseitig ungemindert.
- **Die Belegzahl steigt** um die Gutschriften. Sie sind eigene Dokumente; das
  ist Konsequenz des Modells, kein Fehler.
- **Stale `retoure`-Events** auf den 56 umgestellten Belegen bleiben bestehen
  (der Faden zeigt eine Retoure-Perle, obwohl der Beleg jetzt `bezahlt` ist).
  Kosmetisch, nicht umsatzrelevant.

## Tests

1. `mapRefundNet` — mit `line_items`; ohne (`|total| − |total_tax|`); Vorzeichen
   immer negativ, egal wie die Eingabe es liefert; leere Eingabe → 0.
2. Import legt je Erstattung **genau eine** Gutschrift an, mit negativem
   `total_net`, `related_order_id` auf den Ursprung und dem Erstattungsdatum.
3. **Idempotenz:** zweiter Import erzeugt **keine** zweite Gutschrift.
4. **Statuswechsel:** Ein `refunded`-Beleg landet als `bezahlt`, nicht `retoure`.
5. **Nettoeffekt:** Ursprung (+X) und Gutschrift (−X) ergeben im Umsatz 0 —
   über `salesTotals` geprüft, ohne Änderung an `REVENUE_STATUS_SQL`.
6. Bestehende Tests bleiben grün.

## Rollout

1. Deploy bryx-test, Tests grün.
2. PR gegen `main`, CI abwarten.
3. Prod deployen, dann `import:woocommerce-orders` erneut laufen lassen
   (idempotent, ~10 Min, abgekoppelt starten).
4. **Gegenprobe:** Umsatz muss um exakt 2.472,97 € sinken; 56 Belege auf
   `bezahlt`, 56 Gutschriften mit negativer Summe; `retoure`-Belege mit
   `related_order_id IS NULL` müssen danach **0** sein.
