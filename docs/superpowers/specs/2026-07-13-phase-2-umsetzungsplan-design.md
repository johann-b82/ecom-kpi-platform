# Phase 2 — Umsetzungsplan (Design)

**Datum:** 2026-07-13
**Grundlage:** `bryx OS — Phase 2 (Gesamtdokument)` (Produkt-/Fachspec)
**Zweck dieses Dokuments:** Übersetzung des Fachspecs in einen umsetzbaren Bauplan
entlang der bestehenden Repo-Konventionen. Es ersetzt **nicht** den Fachspec —
es sagt, *wie* und *in welcher Reihenfolge* gebaut wird und wo der Fachspec an
Repo-Realität angepasst wird.

Dieses Dokument liefert die **Roadmap (B1–B8)** plus **Detailschärfe für B1+B2**
(erster Detailplan). B3–B8 werden vor ihrer Umsetzung je einzeln zu Detailplänen
ausgearbeitet.

---

## 0. Gesperrte Grundentscheidungen

Drei Weichenstellungen sind entschieden und binden den gesamten Plan:

1. **Zuschnitt:** Roadmap über ganz Phase 2 + voll ausgearbeiteter erster
   Detailplan für **B1 + B2**. Weitere Bausteine je einzeln danach.
2. **Namenskollision `orders`:** Die neuen ERP-Belegtabellen werden
   **`sales_orders` / `sales_order_lines` / `sales_order_events`** genannt. Die
   bestehenden Legacy-Tabellen `orders`/`customers` (Analytics-Cache hinter dem
   KPI-Dashboard, `src/kpi/repository.ts`, `src/lib/orders-store.ts`) bleiben
   **unberührt**.
3. **API-Architektur:** Phase 2 folgt dem Phase-1-Muster
   **Server Actions → Repository → raw `pg` Pool** (kein REST, keine Pagination,
   kein Supabase-Data-Client für ERP-Daten). Die im Fachspec §8 gelisteten
   REST-Endpunkte werden als **interne Funktionssignaturen** gelesen. Der im
   Fachspec zentrale `PATCH /api/orders/:id/status` wird zur **einen gated
   Service-Funktion `transitionOrderStatus()`** — derselbe Flaschenhals, andere
   Mechanik.

Dies ist im Einklang mit der Grundregel des Fachspecs selbst: *„Repo-Struktur,
CI-Vorgaben und bestehende Patterns haben Vorrang"* bzw. §8 *„Konventionen aus
dem bestehenden Repo übernehmen, nicht neu erfinden."*

---

## 1. Repo-Konventionen, die jeder Baustein einhält

Festgestellt aus Phase 1 (Kontakte, Katalog). Verbindlich für Phase 2:

- **Datenbank:** kein ORM, keine versionierten Migrationen. Zwei handgeschriebene,
  idempotente SQL-Dateien: `db/schema.sql` (`CREATE TABLE IF NOT EXISTS`) und
  `db/rls.sql`, angewendet über `scripts/migrate.ts` (`npm run migrate`).
  Neue Tabellen werden unter einem `-- ── <Domain> ──`-Banner an `schema.sql`
  angehängt. `tenant_id UUID REFERENCES tenants(id)` auf jeder Tabelle, **nullable
  und nicht gefiltert** (Single-Tenant in der Praxis, Spalte ist Vorhalt).
- **RLS:** Jede ERP-Tabelle bekommt `ENABLE ROW LEVEL SECURITY` **ohne Policy und
  ohne Grant** → `anon`/`authenticated` (PostgREST) sind vollständig gesperrt.
  Zugriff ausschließlich serverseitig über den privilegierten `pool`. Neue
  Tabellen zur Sperr-Liste in `db/rls.sql` hinzufügen.
- **Datenzugriff:** `src/<modul>/repository.ts` mit `X_COLS`-Spaltenliste,
  `mapX(row)` (snake_case → camelCase), parametrisierten `pool.query(...)`.
  Typen in `src/<modul>/types.ts` (`X` / `XDetail` / `XInput`). Menschliche
  Belegnummern über reinen Helper `src/<modul>/number.ts`.
- **Mutationen:** Server Actions in `src/app/(shell)/<modul>/actions.ts`
  (`'use server'`): (1) `requireAppAccess('<app>','edit')`, (2) Repository
  aufrufen, (3) `revalidatePath(...)`. Fehler als plain `Error`.
- **UI:** Modul-Ordner unter `src/app/(shell)/<modul>/` mit `layout.tsx` (Gate +
  Sidebar), `page.tsx` (Liste, `force-dynamic`), `[id]/page.tsx` (Detail +
  `notFound`), `actions.ts`. Komponenten `'use client'`, `useTransition` +
  `router.refresh()`. **Liste → Detail-Panel**, kein Modal.
- **Design:** warme `neutral`-Skala + `--accent`, Dark-Mode-Varianten Pflicht,
  `.anno` für UPPERCASE-Mikrolabels. Keine Komponentenbibliothek — wiederkehrende
  Tailwind-Strings als lokale Consts. Wiederverwenden: `ConnectionStubs`,
  `AdminOnlyTag`, `KpiCard`, Tabellen-/Chip-/Input-Idiome.
- **App-Registrierung:** Eintrag in `src/lib/apps.ts` (`AppKey`-Union + `APPS`).
- **Tests (Vitest, `fileParallelism: false`):** Repository-Integrationstests
  (echter Pool, `afterAll`-Cleanup), `tests/db/rls.test.ts` deny-Liste erweitern,
  Action-Unit-Tests mit gemocktem Repo/`groups`/`next/cache`.
- **Hilfe-Pflicht (CLAUDE.md):** jede neue App braucht eine `group:'module'`-
  Hilfeseite in `src/lib/help/content.ts` mit **Slug = App-Key**, sonst schlägt
  `tests/lib/help-content.test.ts` fehl. Datenmodell-Änderungen → Admin-Seite
  `datenmodell` pflegen; neue Verbindungen → `verbindungen`. Das ist
  Definition-of-Done in **jedem** Baustein.

---

## 2. Roadmap — Bausteine B1–B8

Reihenfolge folgt Fachspec §10. Abhängigkeiten in Klammern.

| # | Baustein | Ergebnis | Abhängig von |
|---|---|---|---|
| **B1** | Datenmodell + Seed-Fundament | **komplettes** Phase-2-Schema in `schema.sql`/`rls.sql`; Seed-Gerüst | Phase 1 |
| **B2** | Beleg-Kern + Übergangslogik | `sales_*`-Repository + `transitionOrderStatus()` inkl. aller Seiteneffekte | B1 |
| **B3** | Verkauf Ebene 2/3 | Belegliste mit **Spur**, Beleg-Detail mit **Faden**, manuelle Beleganlage | B2 |
| **B4** | Verkauf Ebene 1 | Kanal-Vergleich, Aggregate, Kanal-Ansichten, `/dashboard`-Entscheidung | B3 |
| **B5** | Verfügbarkeit | Bestandsübersicht, Reservierung, Wareneingang, Meldebestand-Entwurf | B1/B2 |
| **B6** | Finanzen | Offene Posten, Zahlungsabgleich, Zuordnen-Warteschlange, DATEV-Export | B1/B2 |
| **B7** | Startbildschirm | reiner Launcher (Ebene 0), aggregiert Bestehendes | B3–B6 |
| **B8** | Verbindungsmenüs | je Modul, `listConnections`/`ConnectionStubs` wiederverwendet | B3/B5/B6 |

**Warum B1 gleich das ganze Schema anlegt:** `transitionOrderStatus()` (B2)
schreibt bereits `sales_order_events`, `stock_levels` (Reservierung/Abgang) und
`open_items` (Rechnungsstellung). Der Faden entsteht nur, wenn diese
Seiteneffekte von Anfang an durch die *eine* Funktion laufen. Deshalb müssen alle
Zieltabellen vor B2 existieren — auch wenn ihre UIs (B5/B6) erst später kommen.

**B2 ist das architektonische Herzstück und größte Risiko.** Wird es falsch
gebaut (Statusänderungen an der zentralen Funktion vorbei), fällt es erst in B3
auf, wenn Perlen im Faden fehlen.

---

## 3. Detailplan B1 — Datenmodell + Seed-Fundament

### 3.1 Tabellen (append an `db/schema.sql`)

Unter Banner `-- ── Verkauf ──`, `-- ── Verfügbarkeit ──`, `-- ── Finanzen ──`.
Namen: **`sales_*`** für die Belege (Kollision), Spec-Namen sonst. Enums als
`CHECK`-Constraints (Repo-Konvention), nicht als PG-`ENUM`-Typen.

**Verkauf:**

```
sales_orders
  id, tenant_id, number TEXT UNIQUE (A-2026-0001),
  contact_id → contacts NOT NULL,
  channel   CHECK (shop|b2b_portal|marktplatz|telefon|manuell),
  status    CHECK (angebot|auftrag|versendet|rechnung_gestellt|bezahlt|retoure|storniert),
  price_list_id → price_lists,          -- bei Erfassung eingefroren
  related_order_id → sales_orders NULL,  -- Gutschrift → Ursprung
  currency CHAR(3) DEFAULT 'EUR', placed_at, created_at

sales_order_lines
  id, tenant_id, order_id → sales_orders ON DELETE CASCADE,
  variant_id → product_variants, quantity INT (negativ bei Gutschrift),
  unit_price NUMERIC(12,2)               -- eingefroren

sales_order_events                        -- = der Faden, eine Zeile pro Perle
  id, tenant_id, order_id → sales_orders ON DELETE CASCADE,
  stage      CHECK (bestellt|kommissioniert|rechnung_gestellt|bezahlt|retoure),
  source_app CHECK (verkauf|verfuegbarkeit|finanzen),
  note NULL, automated BOOL DEFAULT false, occurred_at NOT NULL,
  INDEX (order_id, occurred_at)
```

**Verfügbarkeit:**

```
warehouses         id, tenant_id, name, type CHECK(eigen|konsignation), is_default BOOL
stock_levels       id, tenant_id, variant_id, warehouse_id,
                   quantity_on_hand INT DEFAULT 0, quantity_reserved INT DEFAULT 0,
                   UNIQUE (variant_id, warehouse_id)
stock_adjustments  id, tenant_id, variant_id, warehouse_id, delta INT,
                   reason CHECK(inventurdifferenz|bruch_schwund|korrektur_fehlbuchung),
                   note NULL, created_at
purchase_orders    id, tenant_id, number UNIQUE (B-2026-0001), supplier_id → contacts NOT NULL,
                   status CHECK(entwurf|bestellt|teilweise_eingegangen|abgeschlossen|storniert),
                   expected_at DATE NULL, created_at
purchase_order_lines id, tenant_id, purchase_order_id → purchase_orders ON DELETE CASCADE,
                   variant_id → product_variants, quantity_ordered INT,
                   quantity_received INT DEFAULT 0, unit_cost NUMERIC(12,2)
```

**Finanzen:**

```
open_items  id, tenant_id, direction CHECK(debitor|kreditor), contact_id → contacts,
            reference TEXT, order_id → sales_orders NULL, purchase_order_id → purchase_orders NULL,
            amount NUMERIC(12,2), due_date DATE,
            status CHECK(offen|teilweise_bezahlt|bezahlt|ueberfaellig), created_at
payments    id, tenant_id, open_item_id → open_items NULL, amount NUMERIC(12,2),
            paid_at, method CHECK(ueberweisung|lastschrift|kreditkarte|paypal|sonstige),
            external_reference TEXT NULL
```

Anmerkung: alle `order_id`-FKs referenzieren **`sales_orders`** (nur der
Tabellenname ist geprefixt; die Spaltennamen bleiben `order_id` für
Spec-Nähe).

### 3.2 RLS (`db/rls.sql`)

Alle neun neuen Tabellen zur `ENABLE ROW LEVEL SECURITY`-Liste hinzufügen,
**ohne Policy/Grant** (server-only). Keine `authenticated_read`-Policy — anders
als bei den KPI-Read-Tabellen sind das ERP-Schreibtabellen.

### 3.3 Seed-Fundament

- Seed-Daten als typisierte Consts in `src/verkauf/seed-data.ts`,
  `src/verfuegbarkeit/seed-data.ts`, `src/finanzen/seed-data.ts` mit **stabilen
  UUIDs** (querverweisbar auf Phase-1-Seeds: Spielwaren Müller GmbH, Guangzhou
  ToyCraft Ltd., Sternenjäger).
- Upsert-Skripte `scripts/seed-verkauf.ts` etc. (`ON CONFLICT (id) DO UPDATE`,
  Direktausführungs-Guard), als npm-Scripts registriert.
- **In B1 nur das Gerüst** (Lager inkl. `is_default`/`konsignation`,
  Basis-Stammverknüpfungen). Die vollständige Seed-DoD (§11, 13 Datensätze) wächst
  mit den Bausteinen; die belegerzeugenden Datensätze (#1–#9) entstehen über
  `transitionOrderStatus()` in B2, nicht durch direktes Insert — sonst fehlen die
  Perlen. Seed #10–#12 (Lager, Mehrlager-Bestand, Korrektur) statisch in B1/B5;
  #13 (Verbindungen) in B8.

### 3.4 Verifikation B1

- `npm run migrate` idempotent (zweimal lauffähig).
- `tests/db/rls.test.ts` um die 9 Tabellen erweitert → `authenticated`/`anon`
  werden abgewiesen (grün).
- Seed-Skripte laufen ohne FK-Fehler; Lager-Seed erfüllt §11 #11 (≥3 Lager, eins
  `konsignation`, eins `is_default`).
- `datenmodell`-Admin-Hilfeseite um die neuen Tabellen ergänzt.

---

## 4. Detailplan B2 — Beleg-Kern + Übergangslogik

### 4.1 Repository & Typen

- `src/verkauf/types.ts`: `SalesOrder`, `SalesOrderDetail` (inkl. `lines`,
  `events`), `SalesOrderLine`, `SalesOrderEvent`, `SalesOrderInput`.
- `src/verkauf/repository.ts`: `listOrders(filter)`, `getOrder(id)` (Beleg +
  Lines + Events als Faden, sortiert `occurred_at`), `createOrder(input)`.
- `src/verkauf/number.ts`: `nextOrderNumber(existing)` → `A-2026-NNNN`.

### 4.2 `transitionOrderStatus()` — die zentrale Funktion

Signatur (konzeptuell):
`transitionOrderStatus(orderId, zielStatus, opts?) → SalesOrderDetail`

**Einziger** Ort, an dem `sales_orders.status` geschrieben wird. Jeder Übergang
läuft in **einer DB-Transaktion** (`pool.connect()` + `BEGIN/COMMIT`), schreibt
die zugehörige `sales_order_events`-Zeile **automatisch** und führt die
Seiteneffekte aus §3 des Fachspecs aus:

| Von | Nach | Auslöser | Seiteneffekte |
|---|---|---|---|
| — | `angebot` | manuelle Erfassung (Kanal b2b_portal/telefon/manuell) | keine |
| — | `auftrag` | Kanal shop/marktplatz (Sync) | `event(bestellt, automated=true)`; `quantity_reserved += Menge` |
| `angebot` | `auftrag` | Nutzer bestätigt | `event(bestellt)`; `quantity_reserved += Menge` |
| `auftrag` | `versendet` | Versandmeldung | `event(kommissioniert, source_app=verfuegbarkeit)`; `quantity_on_hand -= Menge`; `quantity_reserved -= Menge` |
| `versendet` | `rechnung_gestellt` | Nutzer stellt Rechnung | `event(rechnung_gestellt)`; `open_items(debitor)` anlegen, `due_date = heute + contacts.payment_terms` |
| `rechnung_gestellt` | `bezahlt` | Finanzen gleicht ab | `event(bezahlt, source_app=finanzen)`; `open_items.status = bezahlt` |
| beliebig | `storniert` | Nutzer storniert | Reservierungen freigeben |
| `bezahlt` | (neue Zeile) `retoure` | Nutzer legt Retoure an | neue `sales_orders`-Zeile, negative Mengen, `related_order_id`; `event(retoure)` **auf dem Ursprungsbeleg**; `quantity_on_hand += Menge` |

**Lager-Regeln (Fachspec §5) in B2 bewusst simpel:** Reservierung
lagerunabhängig; Entnahme beim Versand aus dem Lager mit höchstem Bestand
(überschreibbar später). Verfügbare Menge überall
`SUM(on_hand) − SUM(reserved)` über alle Lager.

**Gültige Übergänge** werden in einer Übergangs-Map validiert; unerlaubte
Übergänge werfen `Error`. Kein „stiller" No-Op.

### 4.3 Server Action

`src/app/(shell)/verkauf/actions.ts` → `transitionOrderStatusAction(id, ziel)`:
`requireAppAccess('verkauf','edit')` → `transitionOrderStatus(...)` →
`revalidatePath('/verkauf')` + `revalidatePath('/verkauf/'+id)`.
Zusätzlich `createOrderAction(input)` und `createReturnAction(id)`.

### 4.4 Seed über die Funktion

Die Seed-DoD-Belege #1 (kompletter Faden bis `bezahlt`) und #2 (Retoure auf #1)
werden im Seed-Skript **durch Aufruf von `transitionOrderStatus()`** erzeugt,
nicht per direktem Insert — das ist zugleich der End-to-End-Beweis, dass die
Übergangslogik Faden + Seiteneffekte korrekt schreibt.

### 4.5 Verifikation B2

- Repository-Integrationstest: kompletter Lebenszyklus eines Belegs
  angebot→auftrag→versendet→rechnung_gestellt→bezahlt→retoure; nach jedem Schritt
  Assertion auf (a) korrekte `sales_order_events`-Perle, (b) `stock_levels`-Deltas,
  (c) `open_items`-Anlage/Status.
- Test: unerlaubter Übergang wirft.
- Test: Retoure hängt Event am **Ursprungsbeleg**, `related_order_id` gesetzt,
  `quantity_on_hand` zurückgebucht (Fachspec §11 #2).
- Action-Unit-Test: Gate auf `verkauf/edit`, Repo-Aufruf, Revalidate.

---

## 5. Offene Punkte (bewusst vertagt, nicht blockierend für B1/B2)

1. **`/dashboard`-Mismatch — Entscheidung in B4.** Das heutige `/dashboard` ist
   das Marketing-KPI-Board (GA4/Woo/Meta), nicht die Shop-Sicht, die der Fachspec
   annimmt. In B4 entscheiden: bestehendes Board behalten und Shop-KPIs unter
   `/verkauf/shop` frisch aus `sales_orders`/`sales_order_lines` (channel='shop')
   bauen, statt `/dashboard` dorthin umzuleiten.
2. **`integration_connections`-Status-Vokabular — B8.** Repo nutzt
   `'nicht verbunden'`, Fachspec `'bereit'`/`'nicht_konfiguriert'`. In B8 an
   Repo-Wording angleichen, nicht umgekehrt.
3. **E-Rechnung (§12.1).** Rechnungsbeleg von Anfang an als strukturierte Daten
   denken (XRechnung/ZUGFeRD-Pflicht ab 2027). Fließt als Designnotiz in
   B2/B3-Datenmodell ein; keine Format-Implementierung in Phase 2.

---

## 6. Definition of Done (je Baustein)

Ein Baustein gilt als fertig, wenn:

- `npm test` grün (inkl. neuer Repository-/RLS-/Action-Tests),
- die relevanten Seed-DoD-Datensätze aus Fachspec §11 vorführbar sind,
- die Hilfe-Pflicht erfüllt ist (Modul-Hilfeseite bei neuer App;
  `datenmodell`/`verbindungen` bei Modell-/Connector-Änderung;
  `help-content.test.ts` grün),
- deployt und verifiziert auf der VPS (`budp.lumeapps.de`, `root@194.164.204.249`)
  — **nie** lokal (Projekt-CLAUDE.md).
```
