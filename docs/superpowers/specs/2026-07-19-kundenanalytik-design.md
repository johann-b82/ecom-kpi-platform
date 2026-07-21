# Kundenanalytik — Design

Datum: 2026-07-19
Branch-Basis: `feat/phase-3-echte-kanaldaten`

## Ziel

Kundenzentrierte Auswertung auf Basis der vorhandenen Belegdaten (`sales_orders`
per `contact_id` verknüpft): eine **Top-Kunden-Übersicht** unter `/kontakte/analyse`
und **Geschäftskennzahlen je Kunde** auf der Kontakt-Detailseite. Umsatzbasiert;
DB/Marge bewusst ausgeklammert, solange EK (`purchase_price`) leer ist.

Voraussetzung: **Kontaktnamen bereinigen** — viele Namen sind Import-Artefakte aus
dem WooCommerce-`company`-Feld (Platzhalter wie „-- Anrede wählen --",
„Bitte auswählen", Datumswerte, Hausnummern), die jede Kundenliste unbrauchbar
machen.

## Bestätigte Entscheidungen (Nutzer)
- **Beides**: Übersicht + Detail-Anreicherung.
- **Kennzahlen**: Umsatz & #Bestellungen, Ø Warenkorb (AOV), Letzte Bestellung /
  Inaktivität, Neu vs. Wiederkehrend / CLV.
- **Ort**: Übersicht unter **Kontakte** („Analyse"), kundenzentriert.
- **DB/Marge weggelassen** (EK leer), später nachrüstbar.
- **Segment** (Geschäft/Privat) als Filter, nicht als fixe Spaltentrennung.
- **Range-Semantik**: Umsatz/#Bestellungen/AOV zeitraumgefiltert; **Letzte
  Bestellung & CLV sind lifetime** (range-unabhängig).

## Datenmodell (vorhanden, keine Schemaänderung)
- `contacts(id, name, is_customer, segment, number, status, …)`.
- `sales_orders(id, contact_id, channel, status, placed_at, created_at, number)`.
- `sales_order_lines(order_id, quantity, unit_price)`.
- Umsatz-Definition wie überall: `SUM(quantity*unit_price)` mit
  `o.status <> 'storniert'`, Datum `COALESCE(placed_at, created_at)::date`.
- Rohes Billing je Kontakt liegt in `external_references.raw_payload`
  (`entity_id = contact_id`, aus [order-import.ts:184](../../../src/woocommerce/order-import.ts#L184))
  → Bestandsbereinigung kann Namen daraus neu ableiten.

---

## 0 · Datenhygiene — Kontaktnamen bereinigen

### Reiner Helfer `src/kontakte/name.ts`

```ts
export interface BillingName {
  first_name?: string; last_name?: string; company?: string; email?: string;
}

// Ein „echter" Firmenname — oder null, wenn der company-Wert ein Import-Platzhalter ist.
export function realCompany(b: BillingName): string | null;

// Anzeigename: echter Firmenname > Personenname > E-Mail > 'Unbekannt'.
export function cleanContactName(b: BillingName): string;
```

`realCompany` verwirft (→ null) einen `company`-Wert, wenn getrimmt/kleingeschrieben:
- leer oder nur Bindestriche/Whitespace (`/^[-–—\s]*$/`),
- in der Platzhalter-Denyliste: `anrede`, `-- anrede wählen --`, `anrede wählen`,
  `bitte auswählen`, `auswahl`, `auswahl: anrede`, `auswählen`, `bitte wählen`,
  `-- bitte wählen --`, `firma`, `company`, `keine angabe`, `n/a`,
- rein numerisch (`/^\d+$/`),
- datumsartig (`/^\d{1,4}[.\/-]\d{1,2}[.\/-]\d{1,4}$/`),
- kürzer als 2 Zeichen.

`cleanContactName(b)` = `realCompany(b) ?? (`${first} ${last}`.trim() || b.email || 'Unbekannt')`.

Rein und ohne DB → vollständig unit-testbar (Beobachtungsfälle als Tests).

### Einsatz + Bestandsbereinigung
- `mapBillingToContact` ([order-import.ts:44](../../../src/woocommerce/order-import.ts#L44))
  nutzt `cleanContactName` statt der jetzigen `company || full || email`-Logik
  (künftige Importe/Re-Syncs).
- Einmal-Skript `scripts/clean-contact-names.ts` (idempotent):
  - Liest je Kontakt das Billing aus `external_references`
    (`source_system='woocommerce'`, `entity_id = contact.id`, `raw_payload`).
  - Rechnet `cleanContactName` neu; `UPDATE contacts SET name=$new WHERE id=$id AND name <> $new`.
  - Loggt Anzahl bereinigt. Läuft auf bryx-test (später Prod).
  - Kein Segment-Rewrite in diesem Schritt (nur Name); Segment-Korrektur ist ein
    optionaler Folge-Schritt (Hinweis, nicht Scope).

---

## 1 · Repository `src/kontakte/analytics.ts`

```ts
export interface CustomerMetricRow {
  contactId: string; name: string; segment: 'geschaeft' | 'privat';
  orders: number;          // im Zeitraum (status<>storniert)
  revenueNet: number;      // im Zeitraum
  avgOrderValueNet: number;// revenue/orders im Zeitraum (0 bei 0)
  lastOrderAt: string | null;   // LIFETIME, YYYY-MM-DD
  daysSinceLast: number | null; // heute − lastOrderAt
  lifetimeOrders: number;  // LIFETIME count
  clv: number;             // LIFETIME revenueNet
  isReturning: boolean;    // lifetimeOrders >= 2
}

// Alle Kunden mit >=1 Lifetime-Beleg (optional segmentgefiltert), je Kunde
// zeitraum-skalierte + lifetime-Kennzahlen. Für die Übersichts-Tabelle.
export async function customerMetrics(
  range: DateRange, opts?: { segment?: 'geschaeft' | 'privat' },
): Promise<CustomerMetricRow[]>;

export interface CustomerSummary {
  orders: number; revenueNet: number; avgOrderValueNet: number;
  firstOrderAt: string | null; lastOrderAt: string | null;
  isReturning: boolean; clv: number;   // alles LIFETIME
}
export async function customerSummary(contactId: string): Promise<CustomerSummary>;

export interface CustomerOrderRow {
  id: string; number: string; placedAt: string; channel: OrderChannel;
  status: OrderStatus; revenueNet: number;
}
export async function customerOrders(contactId: string): Promise<CustomerOrderRow[]>;
```

- SQL: pro Kontakt Lifetime-Aggregat (CTE) + Zeitraum-Aggregat (CTE) join'en;
  `contacts` LEFT JOIN, nur `is_customer` und `lifetimeOrders >= 1`.
- `revenueNet`/`orders` im Zeitraum: `FILTER (WHERE date BETWEEN range)`, Storno raus.
- Aggregat-KPIs für die KPI-Zeile werden in der Page aus `customerMetrics` abgeleitet
  (Aktive Kunden = orders>0 im Zeitraum; Umsatz Σ; AOV; Wiederkäufer-Quote =
  Anteil aktiver Kunden mit isReturning) — keine separate Query nötig.

## 2 · Übersicht `/kontakte/analyse`

- Neuer Sidebar-Eintrag „Analyse" in `KontakteSidebar` (`{ slug: 'analyse', label: 'Analyse' }`).
- Route `src/app/(shell)/kontakte/analyse/page.tsx` (Server Component, `force-dynamic`).
- **Default-Zeitraum `all` (Komplett)** → primäre Sicht = Lifetime-Top-Kunden +
  Inaktivität; Zeitraum-Wahl skaliert die Perioden-Spalten (Umsatz/#/AOV) und
  bezieht die KPI-Zeile auf den Zeitraum. Filter über die geteilte `Filters`-Leiste
  (`resolveRange(days ?? 'all', …)`) + Segment-Chips (Alle/Geschäft/Privat) + Suche.
- **KPI-Zeile** (StatTiles, zeitraumbezogen): Aktive Kunden · Umsatz · Ø Warenkorb ·
  Wiederkäufer-Quote.
- **DataTable** (`DataTable`, klient. Sort/Filter wie andere Listen):
  Kunde · Segment · Bestellungen · Umsatz · Ø Warenkorb · Letzte Bestellung ·
  Status (Neu/Wiederkäufer). Default-Sort **Umsatz absteigend**. Sortierung nach
  „Letzte Bestellung" (aufsteigend) bringt schlummernde Kunden nach oben. Zeilen-Link
  → `/kontakte/[id]`. Datum via `formatDeDate`; Beträge via `eur`.
- Leerzustand konsistent (Meldung statt leer).

## 3 · Kontakt-Detail `/kontakte/[id]` anreichern

- Bestehende Detailseite um Sektion **„Geschäftskennzahlen"** (aus `customerSummary`):
  Umsatz gesamt · #Bestellungen · Ø Warenkorb · erste Bestellung · letzte Bestellung ·
  Wiederkäufer-Badge · CLV. Gleiches Kachel-/Token-Muster wie sonst.
- **Bestellhistorie** (aus `customerOrders`): Tabelle Nr · Datum · Kanal · Status ·
  Betrag, jede Zeile → `/verkauf/belege/[id]`. Leerzustand bei Nicht-Kunden/ohne Belege.
- Nur für `is_customer`-Kontakte einblenden (Lieferanten ohne Verkaufsbelege → keine
  Sektion).

## 4 · Tests
- **Pure** (`tests/kontakte/name.test.ts`): `realCompany`/`cleanContactName` —
  echter Firmenname bleibt; alle Beobachtungs-Junkfälle (`--`, „-- Anrede wählen --",
  „Bitte auswählen", „Auswahl", Datum, Hausnummer/numerisch) → Personenname/E-Mail-Fallback.
- **DB** (`tests/kontakte/analytics.test.ts`, Sibling-Test-DB): `customerMetrics`
  (Storno ausgeschlossen; orders/AOV im Zeitraum; `isReturning` bei ≥2; `lastOrderAt`
  lifetime unabhängig vom Range; Segmentfilter), `customerSummary`/`customerOrders`
  (Belegliste + Beträge, Storno-Behandlung).
- **DB** (`scripts/clean-contact-names`): Idempotenz — Junk-Name wird bereinigt, zweiter
  Lauf ändert nichts; echter Firmenname bleibt.
- Hilfe-Registry-Test bleibt grün.

## 5 · Hilfe-Doku
- Kontakte-Modul-Hilfeseite (`content.ts`) um „Analyse / Kundenkennzahlen" ergänzen
  (Top-Kunden, Inaktivität, Wiederkäufer/CLV, Range-Semantik: Perioden-Spalten
  zeitraumbezogen, Letzte Bestellung & CLV lifetime; Hinweis DB/Marge folgt mit EK).

## Nicht im Scope
- DB/Marge je Kunde (bis EK erfasst).
- Segment-Korrektur bestehender Kontakte (nur Name-Cleanup).
- Kohorten/Charts über Zeit, Kundenkarten-Export, RFM-Scoring.
- Änderungen am WooCommerce-Import über das Namensmapping hinaus.
