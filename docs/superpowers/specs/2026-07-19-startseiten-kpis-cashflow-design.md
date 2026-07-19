# Startseiten-KPIs & Cashflow-Chart — Design

Datum: 2026-07-19
Branch-Basis: `feat/phase-3-echte-kanaldaten`

## Ziel

Drei zusammenhängende KPI-Anpassungen:

1. **Startseite** — Kachel „Umsatz akt. Monat" → **Umsatzwachstum in %**
   (periodengleiches Monat-über-Monat).
2. **Startseite** — Kachel „Offene Posten" → **Operativer Cashflow
   (Einzahlungen)**; Klick landet auf `/finanzen` mit einem
   Cashflow-Verlaufschart.
3. **/verkauf** — Kachel „Offene Angebote" entfernen.

Plus flankierend: neue Cashflow-Sektion auf `/finanzen`, Repo-Funktionen,
Tests, Hilfe-Doku.

## Entscheidungen (vom Nutzer bestätigt)

- **Wachstums-Periode:** MoM periodengleich — laufender Monat 1.–heute vs.
  Vormonat 1.–gleicher Tag. (Nicht QoQ/YoY; nicht „ganze Monate", um die
  Verzerrung angebrochen-vs-voll zu vermeiden.)
- **Cashflow-Chart-Ort:** neue Kopf-Sektion **auf `/finanzen`** über der
  Offene-Posten-Liste — kein eigener Sub-Route, kein neuer Sidebar-Eintrag.
- **Cashflow-Definition:** **nur Einzahlungen, brutto** — Zahlungseingänge auf
  **Debitor**-Posten. Nicht zugeordnete Zahlungen (`open_item_id IS NULL`)
  zählen **nicht** mit (konservativ; sie fließen erst nach Zuordnung ein).

## 1. Startseite

Betroffen: [`src/components/StartOverview.tsx`](../../../src/components/StartOverview.tsx),
[`src/app/(shell)/page.tsx`](../../../src/app/(shell)/page.tsx).

### `OverviewSignals` (neu)

```ts
export interface OverviewSignals {
  revenueGrowthPct?: number;   // periodengleiches MoM in Prozent (mit Vorzeichen)
  prevRevenue?: number;        // intern: Vormonats-MtD-Umsatz, für 0-Sonderfall
  reichweite90?: number;       // unverändert
  cashflowIn?: number;         // Einzahlungen laufender Monat (brutto, Debitor)
}
```

`monthRevenue`, `openItems`, `overdue` entfallen.

### Kachel „Umsatzwachstum" (ersetzt „Umsatz akt. Monat")

- **Wert:** `revenueGrowth(cur, prev)` → Prozent mit Vorzeichen, z. B. `+13,6 %`
  / `−4,2 %`.
- **Sonderfall `prev === 0`:** Wert `–` anzeigen (Wachstum unbestimmt); Kachel
  bleibt (wie bisher) auf `/verkauf` verlinkt.
- **Sub-Zeile (`anno`):** `MTD VS. VORMONAT`.
- **Farbe:** `text-danger` bei negativem Wachstum, sonst neutrale Wert-Farbe.
  (Der bestehende `danger`-Mechanismus der Kachel wird dafür genutzt.)
- **href:** `/verkauf` (unverändert).

### Kachel „Operativer Cashflow" (ersetzt „Offene Posten")

- **Label:** `Operativer Cashflow`.
- **Wert:** `eur(cashflowIn)`.
- **Sub-Zeile (`anno`):** `EINZAHLUNGEN · LFD. MONAT`.
- **href:** `/finanzen`.
- Kein `danger`, kein Überfällig-Subtext mehr.

### Datenweg in `page.tsx`

- Wachstum (nur wenn `access.apps.verkauf`): zwei `salesTotals`-Aufrufe.
  - `curRange  = { start: <1. des akt. Monats>, end: <heute> }`
  - `prevRange = { start: <1. des Vormonats>,   end: <Vormonat, gleicher Tag,
    geklemmt auf Monatsende> }`
  - `revenueGrowthPct = revenueGrowth(cur.revenueNet, prev.revenueNet)`,
    `prevRevenue = prev.revenueNet`.
- Cashflow (nur wenn `access.apps.finanzen`): `cashflowIn(monthRange)` mit
  `monthRange = { start: <1. des akt. Monats>, end: <heute> }`.
- `reichweite90`: unverändert (`listReorderSuggestions`).
- `listOpenItems`-Import auf der Startseite entfällt.
- `hasOverview`: auf die neuen Signale (`revenueGrowthPct`, `reichweite90`,
  `cashflowIn`) umstellen.

### Rechen-Helfer (pure, DB-frei, unit-testbar)

Ort: `src/verkauf/growth.ts` (neu) oder bestehende `format`-nahe Util — pure
Funktion:

```ts
// null ⇒ unbestimmt (Vorperiode 0). Sonst Prozent-Delta.
export function revenueGrowth(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
```

Vorzeichen-Formatierung (`+`/`−`, eine Nachkommastelle, `%`) als kleiner
Formatter neben der bestehenden `pct`-Nutzung; `pct` selbst bleibt unverändert
(es setzt kein `+`).

Die periodengleiche Datumsberechnung (Vormonat, gleicher Tag, Monatsende-Klemmung)
liegt in `page.tsx` bzw. einem kleinen Datums-Helfer und wird über den
`page.tsx`-Pfad abgedeckt; die reine Prozentrechnung ist separat testbar.

## 2. /finanzen — Cashflow-Verlaufschart

Betroffen: [`src/app/(shell)/finanzen/page.tsx`](../../../src/app/(shell)/finanzen/page.tsx),
[`src/finanzen/repository.ts`](../../../src/finanzen/repository.ts).

- Neue **Kopf-Sektion** über der Offene-Posten-Liste:
  `ChartCard` + `KpiLineChart` (`format='eur'`), Titel
  „Operativer Cashflow · Einzahlungen".
- **Zeitraum des Charts:** fix, **letzte 12 Monate, monatlich gebucketet** —
  unabhängig vom OP-Salden-Zeitraum. Die Offene-Posten-Liste bleibt unverändert
  bei `days='all'`.
- Aggregation im Page-Layer: `cashflowInByDay(range)` → `bucketSum(..., 'month')`
  (wie in `/verkauf`, via `@/lib/series`).

### Repo-Funktionen (neu, in `finanzen/repository.ts`)

```ts
// Einzahlungen (Debitor-Zahlungseingänge) gesamt im Zeitraum — für die
// Startseiten-Kachel „Operativer Cashflow".
export async function cashflowIn(range: DateRange): Promise<number>;

// Einzahlungen je Tag im Zeitraum — für den Verlaufschart auf /finanzen.
export async function cashflowInByDay(range: DateRange): Promise<{ day: string; amount: number }[]>;
```

SQL-Kern (beide):

```sql
SELECT p.paid_at::date::text AS day, COALESCE(SUM(p.amount), 0)::float8 AS amount
  FROM payments p
  JOIN open_items oi ON oi.id = p.open_item_id
 WHERE oi.direction = 'debitor'
   AND p.paid_at::date BETWEEN $1 AND $2
 GROUP BY day ORDER BY day;   -- cashflowIn: ohne GROUP BY, nur SUM
```

`JOIN` (nicht `LEFT JOIN`) schließt `open_item_id IS NULL` konstruktionsbedingt
aus — bewusst konservativ (bestätigt).

`DateRange` aus `@/verkauf/types` bzw. dem in Finanzen genutzten Range-Typ
verwenden (kein neuer Typ).

## 3. /verkauf — „Offene Angebote" entfernen

Betroffen: [`src/app/(shell)/verkauf/page.tsx`](../../../src/app/(shell)/verkauf/page.tsx).

- Das `angebote`-Item aus `items` streichen (Zeile mit
  `key: 'angebote', label: 'Offene Angebote'`).
- `salesTotals` / `totals.openOffers` bleiben unangetastet (an anderer Stelle
  weiter genutzt); nur die Kachel entfällt.

## Tests

- **`revenueGrowth`** (pure): positiv/negativ/null-Vorperiode/Gleichstand.
- **`cashflowIn` / `cashflowInByDay`** (Vitest gegen DB-Fixtures): Debitor-Eingang
  zählt; Kreditor-Zahlung zählt nicht; nicht zugeordnete Zahlung
  (`open_item_id IS NULL`) zählt nicht; Zeitraum-Grenzen inklusive.
  - Vorbehalt Test-DB: Dev-DB kann die Verkauf/Finanzen-Suite wegen
    Seed-Kollision nicht fahren — frische Schwester-DB nutzen
    (siehe Memory `dev-db-seed-collision`).
- **Rendering-Smoke** der Startseiten-Kacheln optional, falls bestehende
  Komponententests dafür existieren.

## Hilfe-Doku

Pflege in [`src/lib/help/content.ts`](../../../src/lib/help/content.ts):

- `/finanzen`-Modulseite: neue Cashflow-Verlaufssektion (Einzahlungen, letzte
  12 Monate, nur zugeordnete Debitor-Eingänge) beschreiben.
- Falls die Startseiten-KPIs dort beschrieben sind: „Umsatz akt. Monat" →
  „Umsatzwachstum" und „Offene Posten" → „Operativer Cashflow" nachziehen.
- `verkauf`-Seite: Erwähnung „Offene Angebote" (falls vorhanden) entfernen.

## Nicht im Scope

- Netto-Cashflow (Einzahlungen − Auszahlungen) — bewusst ausgeschlossen.
- Konfigurierbarer Vergleichszeitraum für das Wachstum.
- Verlinkung/Drill-down aus dem Cashflow-Chart in einzelne Zahlungen.
- Einbeziehung nicht zugeordneter Zahlungseingänge.
