# Design: UI-Umbau — klickbare KPI-Kurven, Tabellenfilter, von-bis-Zeitraum

Datum: 2026-07-18
Module: Verkauf, Verfügbarkeit, Finanzen (`src/app/(shell)/…`)

## Ziel

Fünf zusammenhängende UI-Verbesserungen an den drei Modul-Übersichten:

1. KPI-Kacheln anklickbar → darunter erscheint eine Verlaufskurve der jeweiligen KPI.
2. Hauptlisten durchgängig sortierbar + pro-Spalte filterbar (verbindlicher Standard für neue Tabellen).
3. Gemeinsamer Zeitraum-Selektor: Standardzeiträume **plus** benutzerdefinierter von-bis-Bereich, auf allen drei Übersichten.
4. Menüpunkt „Neuer Beleg" aus der Sidebar entfernen (nur Frontend).
5. Anzeige-Label „Belege" → „Sales" (nur sichtbare Texte).

## Bestand (Ist-Zustand)

- Charting: **recharts** `^2.15.4`, Stil-Konstanten in `src/components/charts/chart-style.ts`, Wrapper `ChartCard`. Vorhandene Kurve `StockSalesChart` (nur im Detail `verfuegbarkeit/[variantId]`/`[category]`).
- Zeitraum: `Filters` (`src/components/Filters.tsx`) mit Presets aus `RANGE_OPTIONS` (7/30/90/365/all), Durchreichung per `?days=`, serverseitig aufgelöst via `resolveRange` (`src/lib/range.ts`). Nur im Verkauf angebunden.
- Tabellen: keine generische Komponente; Helfer `SortableTh` (server, `src/lib/sort.ts`) und `useClientSort`/`ClientSortableTh` (client, `src/lib/client-sort.ts`). Hauptlisten: `VerkaufList` (Sort + Volltextsuche + Kanal-Chips), `OffenePostenListe` (Client-Sort + einfache Filter), `VerfuegbarkeitDashboard`-Rollup (kein Sort/Filter).
- KPI-Kacheln fragmentiert und nicht klickbar: `KpiCard` (Verkauf-E-Commerce-Board via `PhaseColumn`) + je Seite lokale `StatTile`/`Tile` in `verkauf/page.tsx`, `VerfuegbarkeitDashboard.tsx`, `OffenePostenListe.tsx`.
- Navigation: globale `AppRail`/`Launchpad` (Registry `src/lib/apps.ts`); pro Modul eine Sidebar-Client-Component mit hartkodiertem `ITEMS`-Array (`VerkaufSidebar`/`VerfuegbarkeitSidebar`/`FinanzenSidebar`). „Neuer Beleg" = `VerkaufSidebar` → `/verkauf/neu` (`NeuerBeleg`) plus Button in `VerkaufList`.

## Entwurf

### A. Gemeinsamer Zeitraum-Selektor mit von-bis (Punkt 3)

- `Filters` erweitern: neben den Preset-Chips ein Modus **„Benutzerdefiniert"** mit zwei Datumsfeldern (von/bis).
- URL-Durchreichung:
  - Presets weiterhin `?days=<key>`.
  - Benutzerdefiniert `?start=YYYY-MM-DD&end=YYYY-MM-DD`.
- `resolveRange` liest zuerst `start`/`end` (wenn beide gültig), fällt sonst auf `days` (Default 30) zurück. Rückgabe bleibt `{ start, end }`.
- Selektor auf **allen drei** Übersichten einbinden (Verkauf vorhanden; Verfügbarkeit & Finanzen neu).
- Der gewählte Zeitraum steuert **sowohl KPIs/Kurven als auch die Listen** der jeweiligen Übersicht.

### B. Klickbare KPI-Kacheln mit Verlaufskurve (Punkt 1)

- Gemeinsamer Client-Wrapper `KpiTrend`: macht eine Kachel klickbar und klappt darunter **über die volle Reihenbreite** eine recharts-Linienkurve auf.
- **Akkordeon, genau eine Kurve gleichzeitig offen**: erneuter Klick schließt; Klick auf eine andere Kachel ersetzt die offene.
- **Datenfluss**: Zeitreihen werden **serverseitig vorberechnet** und an die Kacheln übergeben; der Klick blendet nur ein/aus (kein Nachladen, keine Ladezustände).
  - Bucket-Granularität automatisch nach Zeitraumlänge: täglich bei kurzen Zeiträumen, wöchentlich/monatlich bei langen — gemeinsame Helper-Funktion, damit alle Module gleich bündeln.
- **Wo Kurven kommen** (nur wo echte Historie existiert):
  - *Verfügbarkeit-Übersicht*: Gesamtbestand & daraus ableitbare Kennzahlen aus `stock_snapshots` (`src/verfuegbarkeit/history.ts`).
  - *Verkauf-Übersicht*: Umsatz, Anzahl Sales, Ø Belegwert (aus Bestellungen pro Bucket aggregiert).
  - *KPIs ohne Historie* — „Offene Angebote" (Verkauf) sowie **alle Finanzen-KPIs** (kein täglicher Snapshot der offenen Posten vorhanden): bleiben **nicht-klickbar**, Darstellung unverändert.
- Wiederverwendung von `chart-style.ts` + recharts; Kurven-Komponente an `StockSalesChart` angelehnt (Linie statt ComposedChart, sofern nur eine Serie).

### C. Sortier- & filterbare Tabellen (Punkt 2)

- **Wiederverwendbare Tabellen-Basis** mit eingebauter **Spalten-Sortierung + Pro-Spalte-Filter**.
  - Filtertyp je Spalte konfigurierbar: **Text** (enthält), **Dropdown** (diskrete Werte, z. B. Kanal/Status/Richtung), **Wertebereich** (numerisch, z. B. Betrag).
  - Sortierung je Spalte an-/abschaltbar; baut auf den vorhandenen Sort-Helfern auf.
- Zuerst auf die **Hauptlisten**:
  - Sales-Liste (`VerkaufList`): Kanal → Dropdown-Filter, Betrag → Wertebereich, Text-Suche bleibt; Sortierung auf allen sinnvollen Spalten.
  - Offene Posten (`OffenePostenListe`): Richtung/Status → Dropdown, Betrag → Wertebereich.
  - Verfügbarkeits-Hauptlisten (`BestandListe`/`MeldebestandListe` bzw. Kategorie-Rollup): Sortierung + passende Spaltenfilter.
- Ab dann **verbindlicher Standard**: jede neue Tabelle nutzt diese Basis. Wird in der Doku vermerkt.

### D. Menüpunkt „Neuer Beleg" entfernen (Punkt 4)

- Sidebar-Eintrag in `VerkaufSidebar.tsx` entfernen.
- Route `/verkauf/neu`, `NeuerBeleg` und `createOrderAction` bleiben unverändert.
- Der **„+ Neuer Beleg"-Button in `VerkaufList`** bleibt (einziger UI-Einstieg).

### E. „Belege" → „Sales" (Punkt 5)

- **Nur sichtbare Anzeige-Texte** auf „Sales" ändern: Überschriften, Sidebar-/Menübeschriftungen, Button-Texte, Spaltenköpfe.
- **Unverändert**: Routen (`/verkauf/belege`, `/verkauf/belege/[id]`), Komponentennamen (`VerkaufList` etc.), Server-Actions, DB-Felder/-Terminologie. Kein Redirect nötig.

## Tests & Verifikation

- **Vitest** (lokal):
  - `resolveRange` mit `start`/`end` (gültig, ungültig, nur eins gesetzt → Fallback auf `days`).
  - Zeitreihen-Bucket-Aggregation (täglich/wöchentlich/monatlich; Grenzen des Zeitraums; leere Buckets = 0/lückenlos).
  - Tabellen-Filter-/Sort-Logik (Text/Dropdown/Wertebereich; Kombination Filter + Sort).
- **UI-Verifikation** auf bryx-test im Browser: Zeitraum inkl. von-bis, Akkordeon-Kurven (eine offen), Spaltenfilter, entfernter Menüpunkt, „Sales"-Labels.

## Doku (Projektregel)

- Hilfe-Modul `src/lib/help/content.ts` mitpflegen: neuer von-bis-Zeitraum, klickbare KPI-Kurven, Tabellen-Filter, Umbenennung „Belege"→„Sales".
- Konvention „neue Tabellen nutzen die Tabellen-Basis" dokumentieren.

## Nicht im Scope

- Kein neues Snapshot-/Cron-Backend für Finanzen-Historie.
- Keine Umbenennung von Routen/Code/DB.
- Keine generische Umstellung aller Tabellen (nur Hauptlisten jetzt; Rest folgt der Konvention).
