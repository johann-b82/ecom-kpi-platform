# Phase 2 · B6 — Finanzen (Design)

**Datum:** 2026-07-15
**Grundlage:** Roadmap `docs/superpowers/specs/2026-07-13-phase-2-umsetzungsplan-design.md`
(B6 = „Finanzen: Offene Posten, Zahlungsabgleich, Zuordnen-Warteschlange,
DATEV-Export", abhängig von B1/B2). Aufsetzend auf B1 (Schema `open_items`,
`payments`) und B2 (`transitionOrderStatus` legt bei `rechnung_gestellt` einen
Debitor-Posten an und setzt ihn bei `bezahlt` auf bezahlt). Gestackt auf B5 (#69).
**Zweck:** Die Finanz-Sicht der Wertschöpfungskette — offene Posten sehen,
Zahlungen buchen (und damit den Verkauf-Faden auf „bezahlt" treiben), nicht
zugeordnete Zahlungen zuordnen, Lieferantenrechnungen erfassen und einen
Buchungs-CSV exportieren.

---

## 0. Gesperrte Entscheidungen (aus dem Brainstorming)

1. **Zahlung treibt den Faden (integriert).** Gleicht eine erfasste Zahlung
   einen **Debitor**-Posten mit Beleg voll aus, löst das
   `transitionOrderStatus(beleg, 'bezahlt')` aus — die `bezahlt`-Perle entsteht
   automatisch. Zahlungsabgleich ist der „Finanzen gleicht ab"-Auslöser; der
   Statuswechsel bleibt am einen Flaschenhals.
2. **Kreditor-Posten aus manueller Lieferantenrechnung.** Ein Formular legt
   `open_item(kreditor)` an (optional mit PO-Bezug). Kein Eingriff in den
   B5-Wareneingang; keine Auto-Anlage aus dem PO-Abschluss.
3. **Pragmatischer CSV-Export.** Sauberer Buchungs-CSV (kein EXTF/DATEV-konform),
   ehrlich als „Buchungsexport". Das Modell hat keine MwSt-Logik → ein echter
   DATEV-Stapel mit BU-Schlüsseln wäre ohnehin unvollständig.
4. **Überfälligkeit wird abgeleitet, nicht gespeichert.** `overdue` =
   `status ≠ bezahlt AND due_date < heute`, im UI/Query berechnet. Der
   `CHECK`-Enumwert `'ueberfaellig'` bleibt ungenutzt (kein Scheduler, der ihn
   stabil setzen würde). Stored status ∈ {offen, teilweise_bezahlt, bezahlt}.
5. **Finanzen rechnet in Geld → Netto.** Alle Beträge netto (ohne MwSt), nur
   kennzeichnen (`.anno` „NETTO · OHNE MWST"), nicht rechnen — analog Verkauf,
   anders als Verfügbarkeit (Stück).

---

## 1. App-Registrierung & Routing

Neue App `finanzen` (Kürzel **`FI`**, Label **Finanzen**, href `/finanzen`) in
`src/lib/apps.ts` (`AppKey`-Union + `APPS`, nach `verfuegbarkeit`, vor `hilfe`).

**App-Zugriff-Falle (verbindlich):** `finanzen` idempotent an **alle** Gruppen
granten (am selben Ort wie der `verfuegbarkeit`-Grant):

```sql
INSERT INTO group_app_access (group_id, app, permission)
  SELECT group_id, 'finanzen', permission FROM group_app_access WHERE app = 'katalog'
  ON CONFLICT (group_id, app) DO NOTHING;
```

**Routing-Karte:**

```
/finanzen                 Offene Posten (Ebene 1): Debitor+Kreditor, KPIs, Filter
/finanzen/[id]            OP-Detail: Posten + Zahlungen + „Zahlung erfassen"
/finanzen/warteschlange   Zuordnen-Warteschlange (payments mit open_item_id NULL)
/finanzen/neu             „Lieferantenrechnung erfassen" (Kreditor-OP anlegen)
```

`FinanzenSidebar` (analog `VerfuegbarkeitSidebar`): **Offene Posten ·
Warteschlange · Lieferantenrechnung · Export**. „Export" ist kein eigener
Screen, sondern löst die CSV-Server-Action + Blob-Download aus (kann als
Sidebar-Button oder Button auf der OP-Seite sitzen — Umsetzung im Plan). Der
Rest wie B5: `layout.tsx` mit `requireAppAccess('finanzen')`-Gate + Sidebar,
`force-dynamic`.

---

## 2. Repository, Typen & die Zahlungs-Kopplung (`src/finanzen/`)

Spiegelt B5: `types.ts`, `repository.ts`, `number.ts` entfällt (keine eigenen
Belegnummern — Referenz kommt vom Beleg/der Eingabe), `labels.ts`
(Status-/Richtungs-/Methoden-Labels). Raw `pg`, parametrisierte Queries,
`NUMERIC → Number()`, `snake_case → camelCase`, `::text` für Daten. Jede
Mutation in **einer** Transaktion (`BEGIN/COMMIT`, `c.release()` im `finally`).

### 2.1 Lesend

- `listOpenItems(filter?): OpenItemRow[]` — beide Richtungen; je Posten
  `paidSum = Σ payments.amount`, `remaining = amount − paidSum`,
  `overdue = status ≠ 'bezahlt' AND due_date < CURRENT_DATE`. Optionaler Filter
  `{ direction?, onlyOpen? }`.
- `getOpenItem(id): OpenItemDetail | null` — Posten (inkl. Kontaktname,
  Beleg-/PO-Referenz) + Zahlungen (absteigend `paid_at`).
- `listUnassignedPayments(): UnassignedPayment[]` — `payments` mit
  `open_item_id IS NULL`, mit Betrag/Methode/Datum/`external_reference`.
- `listOpenItemOptions(contactId?): OpenItemOption[]` — offene Posten (nicht
  `bezahlt`) für die Zuordnen-Auswahl; wenn `contactId` gesetzt, dessen Posten
  zuerst.
- `listContactOptions(): ContactOption[]` — Kontakte (id, name) für die
  Selects im Lieferantenrechnung-Formular; lokal in `finanzen/repository.ts`,
  damit das Modul self-contained bleibt (kein Cross-Modul-Import nur für einen
  Kontakt-Lookup).

### 2.2 Der `transitionOrderStatus`-Client-Refactor (ein Cross-Modul-Eingriff)

`transitionOrderStatus(orderId, target)` (in `src/verkauf/repository.ts`, B2)
bekommt einen **optionalen dritten Parameter** `client?: PoolClient`:

- **ohne `client`** (alle bestehenden Aufrufer): unverändert — eigene
  `pool.connect()` + `BEGIN/COMMIT/ROLLBACK/release`.
- **mit `client`**: läuft *innerhalb* der Transaktion des Aufrufers — **kein**
  eigenes BEGIN/COMMIT/connect/release; nutzt den übergebenen `client`.

Additiv, rückwärtskompatibel. Damit bleibt `transitionOrderStatus` der einzige
Ort, der `sales_orders.status` und `sales_order_events` schreibt, **und**
`recordPayment` kann atomar mitschreiben.

### 2.3 Schreibend (gated auf `finanzen/edit`)

| Funktion | Wirkung |
|---|---|
| `recordPayment(openItemId, { amount, method, reference?, paidAt? })` | Der Flaschenhals. In einer TX: `INSERT payments (open_item_id, …)`; `paidSum = Σ`; **Vollausgleich** (`paidSum ≥ amount`): wenn `debitor && order_id && beleg.status='rechnung_gestellt'` → `transitionOrderStatus(order_id,'bezahlt', client)` (schreibt Perle + setzt `open_item.status='bezahlt'`); sonst `UPDATE open_items SET status='bezahlt'`. **Teilzahlung** (`0 < paidSum < amount`): `status='teilweise_bezahlt'`. Guards: Betrag > 0; Posten existiert; nicht schon `bezahlt`. |
| `assignPayment(paymentId, openItemId)` | Nicht zugeordnete Zahlung zuordnen: `UPDATE payments SET open_item_id=$2 WHERE id=$1 AND open_item_id IS NULL`; danach denselben Settle-Pfad wie `recordPayment` (Status neu berechnen, ggf. Faden treiben). |
| `recordUnassignedPayment({ amount, method, reference?, paidAt? })` | Bank-Import-Surrogat: `INSERT payments` mit `open_item_id NULL` → Warteschlange. |
| `createKreditorInvoice({ supplierId, amount, dueDate, reference, purchaseOrderId? })` | `INSERT open_items (direction='kreditor', contact_id, reference, purchase_order_id, amount, due_date, status='offen')`. |

`transitionOrderStatus`'s bestehender `bezahlt`-Zweig setzt den Debitor-Posten
bereits auf `bezahlt` — bei der integrierten Zuordnung wird der `open_item`
also **dort** geschlossen, nicht doppelt in `recordPayment`.

---

## 3. Server Actions

`src/app/(shell)/finanzen/actions.ts` (`'use server'`), je: (1)
`requireAppAccess('finanzen','edit')`, (2) Repository, (3) `revalidatePath`:

- `recordPaymentAction(openItemId, input)` → revalidate `/finanzen`,
  `/finanzen/[id]`, und `/verkauf`+`/verkauf/belege/[orderId]` wenn ein Beleg
  betroffen ist (der Faden hat sich geändert).
- `assignPaymentAction(paymentId, openItemId)` → revalidate `/finanzen`,
  `/finanzen/warteschlange`, betroffenes OP-Detail, ggf. Verkauf.
- `recordUnassignedPaymentAction(input)` → revalidate `/finanzen/warteschlange`.
- `createKreditorInvoiceAction(input)` → revalidate `/finanzen`; gibt neue
  OP-Id zurück (Client redirectet aufs Detail).
- `exportBookingsAction(range?)` → gibt den CSV-String zurück (kein Revalidate);
  der Client baut daraus einen Blob-Download.

---

## 4. UI (vier Screens)

`'use client'` wo interaktiv, `useTransition` + `router.refresh()`,
**Liste → Detail-Panel**, warme `neutral`-Skala + `--accent`, Dark-Mode, `.anno`.
`text-danger`/`bg-danger` für **überfällig** (konsistent mit B5). Geldbeträge mit
`.anno` „NETTO · OHNE MWST".

### 4.1 Offene Posten (`/finanzen`)
Server-Component, `force-dynamic`, `listOpenItems`. KPI-Leiste (`KpiCard`
wiederverwendet): **Σ offen Debitor**, **Σ offen Kreditor**, **davon
überfällig** (Betrag). Tabelle je Posten: Richtungs-Chip (Debitor/Kreditor),
Kontakt, Referenz, Betrag (netto), fällig, Status (mit `overdue` → Danger-Chip),
bezahlt/Rest. Client-Filter Richtung/„nur offen". Zeile → Detail. Buttons
„Lieferantenrechnung" (→ `/finanzen/neu`) und „Export" (Blob-Download).

### 4.2 OP-Detail (`/finanzen/[id]`)
`notFound()` bei unbekannter Id. Kopf (Richtung, Kontakt, Referenz, Betrag,
fällig, Status, Beleg-/PO-Link), Zahlungsliste, **„Zahlung erfassen"**-Formular
(Betrag vorbelegt = `remaining`, Methode-Select, Referenz, optional Datum) →
`recordPaymentAction`. Bei einem Debitor-Posten mit Beleg im Status
`rechnung_gestellt` weist ein Hinweis darauf hin, dass Vollausgleich den Beleg
auf „bezahlt" setzt.

### 4.3 Warteschlange (`/finanzen/warteschlange`)
`listUnassignedPayments`. Tabelle: Datum, Betrag, Methode, `external_reference`.
Je Zeile **„Zuordnen"** → Auswahl eines offenen Postens (`listOpenItemOptions`,
gleicher Kontakt/Betrag zuerst) → `assignPaymentAction`. Zusätzlich **„Zahlung
erfassen"** (ohne Zuordnung) → `recordUnassignedPaymentAction`
(Bank-Import-Surrogat).

### 4.4 Lieferantenrechnung (`/finanzen/neu`)
Formular: Lieferant (Kontakt-Select), Betrag, Fälligkeitsdatum, Referenz,
optional Bestellung (PO-Select) → `createKreditorInvoiceAction` → redirect
aufs neue OP-Detail.

---

## 5. Export (pragmatischer CSV)

`exportBookings(range?): string` — Semikolon-getrennter Buchungs-CSV, deutsches
Dezimalkomma, UTF-8-BOM (Excel/DATEV-freundlich). Eine Kopfzeile + eine Zeile je
offenem Posten:

```
Datum;Richtung;Kontakt;Referenz;Betrag;Faellig;Status;Bezahlt;Rest
2026-07-15;Debitor;Spielwaren Müller GmbH;A-2026-0001;119,00;2026-08-14;offen;0,00;119,00
```

`Datum` = `created_at::date`. Kein EXTF-Header, keine Kontenrahmen-/BU-Logik
(bewusst, §0.3). Der Client (`'use client'`-Button) ruft `exportBookingsAction`,
erzeugt `new Blob([csv], {type:'text/csv;charset=utf-8'})` und triggert den
Download — **kein** REST-Route-Handler (Phase-2-Prinzip Server Actions).

---

## 6. Seed · Hilfe · Datenmodell (DoD)

- **Seed** `src/finanzen/seed-data.ts` + `scripts/seed-finanzen.ts` (idempotent
  `ON CONFLICT (id)`, stabile UUIDs):
  - **Ein Kreditor-OP** (Lieferant Guangzhou ToyCraft Ltd., offen, mit
    Fälligkeit) — für Kreditor-Anzeige und -Zahlung.
  - **Eine nicht zugeordnete Zahlung** (open_item_id NULL) — für die
    Warteschlange.
  - **Ein offener Debitor-OP** ist für die Zahlung→Faden-Story nötig. Der
    Verkauf-Seed erzeugt Debitor-Posten über `transitionOrderStatus`. Der Plan
    stellt sicher, dass **mindestens ein Seed-Beleg bei `rechnung_gestellt`
    stehen bleibt** (offener Debitor-OP) — entweder durch Ergänzen eines solchen
    Belegs im Verkauf-Seed oder durch einen zusätzlichen Finanzen-Seed-Beleg.
    Direktes Insert eines Debitor-OP *ohne* Beleg wäre möglich, zeigt aber die
    Faden-Kopplung nicht — daher der beleggebundene Weg.
- **Hilfe:** neue Modul-Hilfeseite `finanzen` (`group:'module'`, **Slug =
  App-Key**), sonst schlägt `help-content.test` fehl. Inhalt: Offene Posten
  (Debitor/Kreditor, abgeleitete Überfälligkeit), Zahlung erfassen →
  Beleg wird „bezahlt" (Faden), Warteschlange/Zuordnen, Lieferantenrechnung,
  Buchungs-CSV-Export (netto, keine EXTF-Konformität).
- **Kein Datenmodell-Change:** `open_items`/`payments` sind seit B1 in der
  `datenmodell`-Admin-Seite dokumentiert. Unberührt.
- **Kein neuer Connector** → `verbindungen` unberührt (Finanzen-Verbindungsmenü
  ist B8).

---

## 7. Tests & Verifikation (DoD)

- `tests/verkauf/repository.test.ts` (bestehend): grün nach dem
  `transitionOrderStatus(…, client?)`-Refactor (Default-Zweig unverändert);
  **neuer** Test „mit übergebenem client schreibt in der Aufrufer-Transaktion".
- `tests/finanzen/repository.test.ts` (echter Pool, `afterAll`-Cleanup):
  - `recordPayment` Vollausgleich eines Debitor-OP mit Beleg → `open_item`
    `bezahlt`, **`sales_order_events`-Perle `bezahlt`**, Beleg-Status `bezahlt`.
  - Teilzahlung → `teilweise_bezahlt`, `remaining` korrekt.
  - Kreditor-OP-Ausgleich → `bezahlt` **ohne** Faden (kein Beleg).
  - `assignPayment` aus der Warteschlange → Settle-Pfad greift.
  - `overdue`-Ableitung (fälliges vs. nicht fälliges Datum).
  - `createKreditorInvoice` legt `kreditor`-OP an.
  - `exportBookings` liefert die erwartete CSV-Form (Kopf, Komma-Dezimal, BOM).
- Action-Unit-Tests (gemockt): Gate `finanzen/edit`, Repo-Aufruf, Revalidate.
- `tests/lib/apps-access.test.ts` / `tests/lib/groups.test.ts`: `finanzen` in die
  Admin-App-Listen-Literale.
- `help-content` grün mit neuem Slug. `tsc --noEmit` sauber, volle Suite grün
  (außer bekannt-rot `tests/db/rls.test.ts`, Host-Caveat).
- **Deploy bryx-test** (`/opt/budp-dev/deploy.sh`) — **nie** Produktion — und
  Browser-Verifikation: OP-Liste + KPIs + überfällig-rot; Zahlung erfassen auf
  einem Debitor-OP → Beleg erscheint im Verkauf als „bezahlt" (Faden-Perle);
  Teilzahlung → teilweise; Warteschlange-Zahlung zuordnen; Lieferantenrechnung
  anlegen; CSV-Download; Rail zeigt Finanzen; Konsole sauber.

---

## 8. Bewusst außerhalb B6 (später)

- EXTF-/DATEV-Konformität (Kontenrahmen, BU-Schlüssel) — bräuchte MwSt-Logik.
- Echter Bank-CSV-Import mit Auto-Matching (B6 hat nur manuelle Zahlungs-Erfassung
  + Warteschlange).
- Mahnwesen, Skonto, Ratenpläne.
- Kreditor-Auto-Anlage aus PO-Abschluss (bewusst manuell in B6).
- Finanzen-Verbindungsmenü → **B8**.
