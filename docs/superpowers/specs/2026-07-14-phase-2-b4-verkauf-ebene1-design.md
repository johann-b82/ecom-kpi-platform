# Phase 2 · B4 — Verkauf Ebene 1 (Design)

**Datum:** 2026-07-14
**Grundlage:** Roadmap `docs/superpowers/specs/2026-07-13-phase-2-umsetzungsplan-design.md`
(B4 = „Verkauf Ebene 1: Kanal-Vergleich, Aggregate, Kanal-Ansichten,
`/dashboard`-Entscheidung"), aufsetzend auf B3 (Belegliste + Faden, PR #67).
**Zweck:** Die aggregierte Einstiegsebene des Verkauf-Moduls, die Auflösung der
vertagten `/dashboard`-Frage und die Netto-Auszeichnung aller Geldbeträge.

---

## 0. Gesperrte Entscheidungen (aus dem Brainstorming)

1. **`/verkauf` wird die Ebene-1-Übersicht.** Die Belegliste (heute `/verkauf`)
   zieht nach `/verkauf/belege` um, das Beleg-Detail nach `/verkauf/belege/[id]`.
2. **Kanal-Vergleich einheitlich aus `sales_orders`** für alle fünf Kanäle
   (shop, b2b_portal, marktplatz, telefon, manuell). Der Shop ist **kein
   Sonderfall** — seine Kanal-Karte verhält sich wie die anderen.
3. **Das bestehende KPI-Board wird unter Verkauf verschoben, nicht geparkt:**
   `/dashboard` → `/verkauf/dashboard`. Es bleibt inhaltlich unverändert
   (GA4/Woo/Meta aus dem KPI-Cache) und wird **nicht** als „Shop" umgedeutet —
   es liegt als eigenständiger Geschwister-Eintrag neben der Übersicht.
4. **`dashboard` fliegt aus der Rail** (`src/lib/apps.ts` / `accessibleApps`).
   `/dashboard` bleibt als Redirect erhalten (keine toten Alt-Links). Der
   komplette Board-Code zieht mit um — keine verwaiste Route, keine Leiche.
5. **Alle Geldbeträge im Verkauf sind netto (ohne MwSt).** Das Datenmodell hat
   keinerlei Steuerlogik (`prices.amount` / `sales_order_lines.unit_price` sind
   reine Nettobeträge; `contacts.vat_id`/`tax_country` sind nur Identifikatoren).
   Also **keine Steuerberechnung** — nur konsequente Netto-Kennzeichnung.

---

## 1. Routing-Karte

```
/verkauf                      Ebene-1 Übersicht (neu): Zeitraum, Gesamt-KPIs,
                              Kanal-Vergleich, Status-Funnel — alles sales_orders
/verkauf/belege               Belegliste (umgezogen) + Deep-Link ?channel=<x>
/verkauf/belege/[id]          Beleg-Detail mit Faden (umgezogen)
/verkauf/neu                  manuelle Anlage (bleibt)
/verkauf/dashboard            bestehendes KPI-Board (GA4/Woo/Meta), umgezogen
/verkauf/dashboard/phase/[p]  Phasen-Drill-down (umgezogen), Back-Link → /verkauf/dashboard
/dashboard (alt, top-level)   Redirect (permanent) → /verkauf/dashboard
```

Die **Kanal-Ansicht** ist die gefilterte Belegliste (`?channel=<x>`) — kein
eigener `/verkauf/kanal/*`-Baum (YAGNI; der B3-Kanalfilter existiert bereits).

`VerkaufSidebar` bekommt vier Einträge: **Übersicht · Belege · Dashboard ·
Neuer Beleg**. Der „Dashboard"-Eintrag ist der Absprung ins KPI-Board.

---

## 2. Ebene-1 Übersicht (`/verkauf`)

Server-Component, `force-dynamic`. Datenquelle ausschließlich
`sales_orders` / `sales_order_lines`.

### 2.1 Zeitraum
- Umschalter **7 / 30 / 90 Tage** über `?days=` — die bestehende
  `Filters`-Komponente und `addDays` (`src/lib/dates`) werden wiederverwendet.
- Zeitachse: `COALESCE(placed_at, created_at)`. Default 30 Tage.

### 2.2 Gesamt-KPIs (`KpiCard` wiederverwendet)
- **Umsatz (netto)** — `SUM(quantity × unit_price)` über alle Positionen, deren
  Beleg-Status **∉ {angebot, storniert}**. Retoure-Belege (negative Mengen,
  gleicher Kanal wie der Ursprung) mindern den Umsatz automatisch netto.
- **Belege** — Anzahl Belege im Zeitraum mit Status ∉ {storniert}.
- **Ø Belegwert (netto)** — Umsatz / Belege (Division-durch-0 abgefangen → 0).
- **Offene Angebote** — Anzahl Status = `angebot` (Pipeline, kein Umsatz).

Alle Geldkarten tragen ein `.anno`-Mikrolabel **„NETTO · OHNE MWST"**.

### 2.3 Kanal-Vergleich
- Eine Karte/Zeile je Kanal — **alle fünf fix** in stabiler Reihenfolge (shop,
  b2b_portal, marktplatz, telefon, manuell), auch bei 0 Belegen.
- Je Kanal: Umsatz (netto), Belege, Ø Belegwert (netto).
- Klick auf eine Karte → `/verkauf/belege?channel=<kanal>`.
- Kanal-Labels menschlich („Shop", „B2B-Portal", „Marktplatz", „Telefon",
  „Manuell") über eine lokale Label-Map — kein Roh-Enum im UI.

### 2.4 Status-Funnel
- Anzahl Belege je Status im Zeitraum: angebot → auftrag → versendet →
  rechnung_gestellt → bezahlt, plus retoure/storniert separat.
- Darstellung als horizontale Balken (greift die Perlen-/Faden-Bildsprache aus
  B3 auf). Status-Labels menschlich über Label-Map. **Kein** Rot außer für die
  „braucht Aufmerksamkeit"-Semantik (hier nicht nötig → Akzent/Neutral).

---

## 3. KPI-Board-Umzug (`/verkauf/dashboard`)

- Die heutige Seite `src/app/(shell)/dashboard/page.tsx` wird nach
  `src/app/(shell)/verkauf/dashboard/page.tsx` verschoben — **inhaltlich
  unverändert** (`loadDataset` → `computeKpis` → `PhaseColumn` + `Filters`).
- Die Drill-down-Route `src/app/(shell)/phase/[phase]/page.tsx` wird nach
  `src/app/(shell)/verkauf/dashboard/phase/[phase]/page.tsx` verschoben; ihr
  Back-Link `← Zur Übersicht` zeigt auf `/verkauf/dashboard`.
- `src/kpi/*`, `computeKpis`, `PhaseColumn`, `Filters`, `addDays` bleiben
  **unverändert** — nur an neuer Route eingehängt.
- **Gate:** `/verkauf/dashboard` erbt das `requireAppAccess('verkauf')`-Gate des
  Verkauf-`layout.tsx` (es liegt unter dem Verkauf-Segment). Damit ist das Board
  künftig verkauf-gated statt dashboard-baseline — konsistent mit dem Umzug.
- Alt-Route: `src/app/(shell)/dashboard/page.tsx` wird zu einem
  `redirect('/verkauf/dashboard')` (Next `redirect()`), damit gebookmarkte
  Alt-Links funktionieren.

---

## 4. `/dashboard`-App-Entfernung + Zugriffs-Ripple

- `src/lib/apps.ts`: `dashboard` aus dem `AppKey`-Union **und** aus `APPS`
  entfernt (damit auch aus `APP_KEYS`, das `fullAdmin()` speist).
- `src/lib/groups.ts` `accessibleApps`: die Baseline-Sonderregel reduziert sich
  auf `a.key === 'hilfe'` (Dashboard-Klausel entfällt). Kommentar anpassen.
- `db/schema.sql`: `dashboard` aus der `group_app_access`-Seed-Werteliste
  entfernen. **Kein** destruktives `DELETE` bestehender `app='dashboard'`-Zeilen
  — `accessibleApps` filtert über `APPS`, verwaiste Zeilen sind wirkungslos.
- **Produkt-Konsequenz (akzeptiert):** ein rechtloser Nutzer sieht im Rail
  künftig nur noch **Hilfe** (statt Dashboard + Hilfe). Zugriff ist
  gruppengesteuert; der Launchpad zeigt das Zugewiesene. Wer Verkauf-Zugriff
  hat, erreicht das KPI-Board über die Verkauf-Sidebar.

### 4.1 Tests, die mitziehen
- `tests/lib/apps-access.test.ts`
  - Admin-Liste: `['brickpm','kontakte','katalog','verkauf','hilfe']` (ohne dashboard).
  - Baseline (non-admin, keine Rechte): `['hilfe']`.
  - brickpm-Fall: `['brickpm','hilfe']`.
- `tests/lib/groups.test.ts`
  - Fresh-Install-Admin-Apps: `{ brickpm, kontakte, katalog, verkauf, hilfe }`.

---

## 5. Repository (rein lesend, additiv)

Neu in `src/verkauf/repository.ts` (parametrisierte `pool.query`, `NUMERIC` →
`Number()`):

```ts
interface DateRange { start: string; end: string }        // ISO YYYY-MM-DD

interface SalesTotals {
  revenueNet: number; orders: number; avgOrderValueNet: number; openOffers: number;
}
interface ChannelSummary {
  channel: OrderChannel; revenueNet: number; orders: number; avgOrderValueNet: number;
}
interface StatusCount { status: OrderStatus; count: number }

salesTotals(range: DateRange): Promise<SalesTotals>
channelSummary(range: DateRange): Promise<ChannelSummary[]>   // alle 5 Kanäle, auch 0
statusFunnel(range: DateRange): Promise<StatusCount[]>        // alle 7 Status, auch 0
```

- Umsatz-Aggregate joinen `sales_order_lines` auf `sales_orders` und filtern
  `COALESCE(placed_at, created_at)` in `[start, end]` **und** Status ∉
  {angebot, storniert}; Belege-Zähler filtert Status ∉ {storniert}.
- `channelSummary`/`statusFunnel` liefern **vollständige** Achsen (fehlende
  Kanäle/Status als 0), damit der Vergleich stabil bleibt — Auffüllung in TS
  gegen die bekannten Enum-Listen, nicht per SQL-`generate_series`.
- `listOrderRows(channel?: OrderChannel)`: optionaler Kanalfilter (WHERE) fürs
  Deep-Linking aus der Übersicht; ohne Argument unverändertes Verhalten.

Typen (`SalesTotals`, `ChannelSummary`, `StatusCount`, `DateRange`) in
`src/verkauf/types.ts`.

---

## 6. Netto-Auszeichnung („überall")

- Übersicht-KPIs: `.anno`-Label „NETTO · OHNE MWST" an den Geldkarten.
- Kanal-Vergleich & Funnel: Geldwerte netto (per Definition), Kanal-/Status-
  Labels menschlich.
- **Beleg-Detail (B3, `VerkaufDetail.tsx`):** der bestehende Summenblock bekommt
  eine einzeilige Annotation „Beträge netto, ohne MwSt" — minimaler Zusatz, der
  das „überall" einlöst, ohne die B3-Logik zu ändern.

---

## 7. Hilfe & Datenmodell

- **`verkauf`-Hilfeseite** (`src/lib/help/content.ts`, `slug:'verkauf'`) um
  Ebene 1 ergänzen: Übersicht, Kanal-Vergleich, Zeitraum, Umsatz-Definition
  (netto, ∉ {angebot, storniert}), Absprung ins KPI-Board.
- **`dashboard`-Modul-Hilfeseite** (`slug:'dashboard'`) entfernen — die App
  existiert nicht mehr in `APPS`, `help-content.test` verlangt sie dann nicht
  mehr. Das KPI-Board wird stattdessen in der `verkauf`-Hilfeseite als
  „Verkauf → Dashboard" erwähnt. `tests/lib/help-content.test.ts` bleibt grün.
- **Kein Datenmodell-Change** (keine neuen Tabellen) → `datenmodell`-Seite
  unberührt.

---

## 8. Seed & Verifikation

- **Kein neuer Seed nötig** — B2/B3-Belege liefern mehrere Kanäle und Status.
  Vorab-Check im Zuge der Verifikation: ≥2 Kanäle mit Belegen vorhanden, sonst
  ist der Kanal-Vergleich leer (ggf. Seed-Belege ergänzen).
- **Tests:**
  - `tests/verkauf/repository.test.ts` erweitert um `salesTotals`,
    `channelSummary`, `statusFunnel` (echter Pool, Zeitraum-Grenzen,
    Storno-/Angebot-Ausschluss, Retoure-Netto-Minderung, vollständige Achsen)
    und den `listOrderRows(channel)`-Filter.
  - `tests/lib/apps-access.test.ts` / `tests/lib/groups.test.ts` wie §4.1.
  - `help-content` grün nach Entfernen der dashboard-Hilfeseite.
- **`tsc --noEmit` sauber**, volle Suite grün.
- **Deploy auf bryx-test** (`/opt/budp-dev/deploy.sh`) — **nie** Produktion —
  und Browser-Verifikation: Übersicht mit Zeitraum-Umschalter, Kanal-Vergleich
  (≥2 Kanäle), Funnel; Kanal-Karte → gefilterte Belegliste; Sidebar-Dashboard →
  KPI-Board; `/dashboard` → Redirect → `/verkauf/dashboard`; Netto-Labels
  sichtbar; Rail ohne Dashboard-Eintrag; Konsole fehlerfrei.

---

## 9. Bewusst außerhalb B4

- Marketing-Analytics *als Shop-Kanal-Kennzahlen* (Verschmelzung KPI-Cache ↔
  `sales_orders`) — später.
- Finanz-gekoppelte Kennzahlen (offene Posten, überfällig) → B6.
- Zeitreihen-/Trend-Charts, Export.
- Rail-Bereinigung/Startbildschirm (Ebene 0) → B7.
