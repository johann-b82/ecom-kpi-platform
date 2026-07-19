# Design: Storno-bereinigte Umsatz-KPI + separate Stornoquote

Datum: 2026-07-19
Status: Entwurf zur Abnahme

## Problem

Die Verkaufszahlen auf `/verkauf` (und der Kanal-Detailseite) zählen aktuell nur
Bestellungen mit `status NOT IN ('angebot','storniert')`. Damit fehlen offene
Angebote/Aufträge im Umsatz, und die Zahl bildet nicht ab, dass ein Umsatz sich
über die Zeit korrigiert, wenn Stornos/Abbrüche nachträglich reinkommen.

Gewünscht ist **eine** klare Umsatz-KPI, die zum aktuellen Zeitpunkt alle
platzierten Bestellungen (inkl. Angebote) enthält und die bislang verarbeiteten
Stornos/Abbrüche abzieht. Zusätzlich soll die **Stornoquote** gesondert und im
Verlauf dargestellt werden.

## Definitionen (verbindlich)

Alle Umsätze weiterhin **ohne MwSt** (aus `sales_order_lines.unit_price`). Die
MwSt-Ebene ist von dieser Änderung nicht betroffen.

```
Umsatz            = Σ(quantity · unit_price)  über  status <> 'storniert'
Stornierter Umsatz = Σ(quantity · unit_price)  über  status  = 'storniert'
Stornoquote       = Stornierter Umsatz / (Umsatz + Stornierter Umsatz)
```

- **Umsatz** enthält damit `angebot, auftrag, versendet, rechnung_gestellt,
  bezahlt, retoure` — alles außer `storniert`.
- **Retoure zählt mit** (Ware wurde geliefert). Bewusste Entscheidung zugunsten
  der einfachsten, self-correcting Definition.
- **Angebot zählt mit.** Das interne `angebot`-Bucket enthält laut Import-Mapping
  sowohl WooCommerce `pending` als auch `checkout-draft` (abgebrochene
  Warenkörbe). Beide zählen vorerst als Umsatz — eine Trennung von „Abbruch" ist
  im aktuellen Datenmodell nicht möglich (siehe *Bekannte Grenzen*).

### As-of-Verhalten (Kernanforderung)

Die Headline-Zahl liest den **aktuellen** `status`. Dadurch ist sie automatisch
„as of now": Jeder bis jetzt verarbeitete Storno/Abbruch ist bereits abgezogen,
und die Zahl sinkt, sobald neue Stornos reinkommen — ohne Zusatzlogik.

### Zeitverlauf im Graph (retroaktiv)

Der Verlauf wird je Periode nach **Bestelldatum** (`COALESCE(placed_at,
created_at)`) gebildet. Wird eine Bestellung storniert, verschwindet ihr Beitrag
**rückwirkend** aus ihrer Ursprungsperiode (die Query filtert `status <>
'storniert'` zum Abfragezeitpunkt). Das ist mit den vorhandenen Daten umsetzbar.

Ein Storno am *Verarbeitungstag* zu datieren (sodass die Kurve am Tag des Stornos
sichtbar einbricht) ist **nicht** möglich: `sales_order_events` kennt keine
Storno-Stage, und `sales_orders` speichert keinen Storno-Zeitstempel. Das ist
bewusst als möglicher Folge-Ausbau ausgeklammert (siehe *Bekannte Grenzen*).

## Umfang

Leitprinzip: **Überall dieselbe Umsatzdefinition** (`<> 'storniert'`, ohne MwSt,
aus `sales_order_lines`). Jede Fläche, die Umsatz aus `sales_orders` berechnet,
nutzt dasselbe zentrale Prädikat.

In Scope:
- `/verkauf` Übersicht-KPIs (Umsatz, Sales, Ø Warenkorb) + neue Stornoquote-KPI.
- `/verkauf/kanal/[channel]` Detailseite (StatTiles, Umsatzverlauf, Stornoquote).
- Kanal-Vergleichstabelle auf der Übersicht (`channelSummary`) — Umsatz/Marge auf
  dieselbe Basis umgestellt.
- **E-Com-/Marketing-Dashboard** (`/verkauf/dashboard`): `ecomSalesFacts` und die
  daraus abgeleitete `marginTotals` auf dieselbe Basis. Damit rechnen Übersicht,
  Kanal und Dashboard mit **demselben** Umsatz.

Gesondert zu klären (nicht Teil dieser Änderung):
- Der Connector-/GA4-KPI-Pfad (`src/connectors/woocommerce/connector.ts`,
  `REVENUE_STATUSES = completed, processing`) berechnet Umsatz aus einer **anderen
  Quelle** (WooCommerce `total` = **brutto, inkl. MwSt**), nicht aus
  `sales_order_lines`. Er lässt sich daher nicht per Prädikat angleichen; eine
  echte Vereinheitlichung ist eine separate Aufgabe (andere Steuer-/Datenbasis).
  Wird hier nur als bekannte Divergenz dokumentiert.

## Änderungen

### 1. Datenschicht — `src/verkauf/repository.ts`

Ein wiederverwendbares Prädikat, damit die Definition nicht auseinanderläuft:

```ts
const REVENUE_STATUS_SQL = "o.status <> 'storniert'"; // Umsatz-Basis
```

- **`salesTotals(range, channel)`** — Prädikat auf `REVENUE_STATUS_SQL`. Liefert
  zusätzlich `cancelledRevenue` (`status = 'storniert'`) und daraus
  `stornoQuote`. `openOffers` (`status = 'angebot'`) bleibt als separate Kennzahl
  erhalten. Ø Warenkorb = `revenue / orders` auf der neuen Basis.
- **`salesDailySeries(range, channel)`** — je Tag `revenue` (Basis
  `<> 'storniert'`) **und** `cancelledRevenue`; die Stornoquote je Periode wird
  daraus im Page-Layer berechnet (`cancelled / (revenue + cancelled)`), damit die
  Bucket-Aggregation (`bucketSum`) sauber bleibt.
- **`revenueByDay(range, channel)`** und **`topProducts(range, n, channel)`**
  (Kanal-Detail) — Prädikat auf `REVENUE_STATUS_SQL`.
- **`channelSummary(range)`** — Umsatz/Marge-Basis auf `REVENUE_STATUS_SQL`.
- **`ecomSalesFacts(range, channel)`** — alle drei Vorkommen des Status-Prädikats
  (Haupt-Aggregat + `active`- und `life`-CTE) auf `REVENUE_STATUS_SQL`. `marginTotals`
  folgt automatisch, da es aus `channelSummary` abgeleitet wird.

Feld-Benennung: Die bestehenden Felder heißen weiter `revenueNet` /
`avgOrderValueNet` (das „Net" meint hier *ohne MwSt* und bleibt korrekt). Neu:
`cancelledRevenue`, `stornoQuote` in `SalesTotals` (`src/verkauf/types.ts`).

### 2. Übersicht — `src/app/(shell)/verkauf/page.tsx`

- KPI-Kacheln Umsatz/Sales/Ø Warenkorb: Werte + Serien aus der neuen Basis.
- **Neue Kachel „Stornoquote"** mit eigener Verlaufslinie (Prozent-Format). Die
  Quote-Serie wird aus `revenue`/`cancelledRevenue` je Bucket berechnet.
  - **Hinweis im Frontend:** Die Kachel trägt eine dezente Erläuterung
    (`hint`/`anno`, z. B. „Anteil stornierten Umsatzvolumens") und im
    Chart-Tooltip die absolute stornierte Summe, damit die Definition
    (wertbasiert: `storniert / (Umsatz + storniert)`) direkt in der UI sichtbar
    ist. Dieselbe Erläuterung auch auf der Kanal-Detailseite.
- „Offene Angebote" bleibt als informative Kachel erhalten.

### 3. Kanal-Detail — `src/components/KanalSalesBoard.tsx` + Page

- StatTiles Umsatz/Belege/Ø Warenkorb auf neuer Basis.
- Der Balken-„Umsatzverlauf · netto" bleibt eine **einzelne** Umsatzlinie (kein
  Brutto/Netto-Split). Titel „Umsatzverlauf".
- Stornoquote als StatTile + optional Verlauf (analog Übersicht).
- `kanal/[channel]/page.tsx` lädt die Quote-/Cancelled-Daten mit.

### 4. KPI-Format

- Neues Format `'pct'` für die Stornoquote in `KpiTrendItem.format` bzw. der
  Chart-/Achsen-Formatierung (`chart-style.ts`), analog zu `'num' | 'eur'`.
- Chart bleibt `KpiLineChart` (eine Linie) — **kein** neuer Chart-Typ nötig.

### 5. Doku (verpflichtend laut CLAUDE.md)

- `src/kpi/help.ts` bzw. Hilfe-Modul: Umsatz-Definition „alles außer storniert,
  inkl. Angebote, ohne MwSt" + Stornoquote erklären.
- Admin-Seite `datenmodell` nur anfassen, falls sich das Datenmodell ändert (tut
  es in der gewählten Variante **nicht**).

## Tests (TDD)

`tests/verkauf/repository.test.ts` (bzw. bestehende Test-Datei der Repo-Funktionen):

1. `salesTotals`: Datensatz mit gemischten Status
   (`angebot, auftrag, bezahlt, retoure, storniert`) → `revenue` enthält alles
   außer `storniert`; `cancelledRevenue` = nur `storniert`; `stornoQuote` =
   korrekt gerundet; `orders` zählt alles außer `storniert`.
2. `salesTotals` mit ausschließlich `storniert` → `revenue = 0`,
   `stornoQuote = 1`, ohne Division-durch-0-Fehler bei leerer Basis.
3. `salesDailySeries`: Storno in einer Periode senkt `revenue` dieser Periode und
   erhöht `cancelledRevenue`; Bestelldatum-Bucketing korrekt.
4. `channelSummary` (`tests/verkauf/channel-summary.test.ts`) /
   `revenueByDay` / `topProducts`: Prädikat greift, `storniert` fließt nicht in
   Umsatz/Marge.
5. Page-Layer-Berechnung der Quote-Serie: `cancelled / (revenue + cancelled)` je
   Bucket, `0/0 → 0`.

Hinweis Test-Ausführung: Die verkauf-Repo-Tests laufen nicht gegen die Dev-DB
(Seed kollidiert mit echten WooCommerce-Daten) — für den Lauf eine frische
Sibling-DB verwenden.

Verifikation nach Deploy (auf dem VPS, gemäß Projektregeln): Übersicht + eine
Kanal-Detailseite im Browser aufrufen, Umsatz-/Stornoquote-Kacheln aufklappen,
Kurven auf Plausibilität prüfen.

## Bekannte Grenzen / mögliche Folge-Arbeit

- **Abbruch ≠ Angebot trennbar:** `pending` und `checkout-draft` liegen beide im
  `angebot`-Bucket. Falls abgebrochene Warenkörbe den Umsatz spürbar
  überschätzen, wäre eine Import-Erweiterung (eigener Status/Flag für
  `checkout-draft`) nötig. Erst an echten Daten prüfen.
- **Storno-Zeitstempel:** Für eine am Verarbeitungstag datierte Storno-Kurve
  müsste ein Storno-Event/Zeitstempel erfasst werden (neue `sales_order_events`
  Stage `storniert` + Import-Änderung).
- **Connector-/GA4-Umsatz:** Der Pfad über `REVENUE_STATUSES` nutzt WooCommerce
  `total` (brutto, inkl. MwSt) statt `sales_order_lines` — bleibt eine bewusste
  Divergenz und wäre nur mit einem separaten Umbau (gemeinsame Steuer-/Datenbasis)
  anzugleichen.
