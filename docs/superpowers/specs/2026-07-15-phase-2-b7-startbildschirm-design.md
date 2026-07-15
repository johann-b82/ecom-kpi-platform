# B7 — Startbildschirm (Launcher, Ebene 0) · Design

> Vierter/vorletzter Phase-2-Baustein. Roadmap: „reiner Launcher (Ebene 0),
> aggregiert Bestehendes" (`2026-07-13-phase-2-umsetzungsplan-design.md`, B7).

## 1. Ziel

Der heutige Startbildschirm `/` ([Launchpad.tsx](../../../src/components/Launchpad.tsx))
zeigt nur Begrüßung + App-Grid. B7 erweitert ihn um eine **„Überblick"-Sektion**
mit **Aufmerksamkeits-Kacheln** entlang der Wertschöpfungskette
(Verkauf → Verfügbarkeit → Finanzen). Jede Kachel ist eine aggregierte Zahl mit
**Deep-Link** in die passende (gefilterte) Modul-Ansicht.

**Reiner Launcher (Ebene 0):** B7 erzeugt **keine** neuen Daten, kein neues
Datenmodell, keine neue App. Es liest ausschließlich vorhandene Repository-Reads
und verlinkt in bestehende Screens. Das App-Grid bleibt unverändert darunter.

## 2. Gesperrte Entscheidungen (Nutzer bestätigt)

- **Attention-Set** (nicht Umsatz-Dashboard, nicht Minimal): die Kacheln zeigen
  *aktionable* Signale, keine Umsatz-KPIs (die leben in Verkauf-Ebene-1).
- App-Access-gated: eine Kachel erscheint **nur**, wenn der Nutzer Zugriff auf das
  zugehörige Modul hat (`access.apps[<app>]` gesetzt). Kein Zugriff → keine Kachel.
- Überfällig/Attention nutzt das **`danger`-Token** (konsistent mit B5/B6), sonst
  warme `neutral`-Tokens; Geldbeträge via `eur()`.

## 3. Die Kacheln

| Modul | Signal | Quelle (bestehend) | Deep-Link |
|---|---|---|---|
| Verkauf | **offene Angebote** (Anzahl, status=`angebot`) | neu: `countOpenQuotes()` (kleiner unbounded COUNT) | `/verkauf/belege` |
| Verfügbarkeit | **Artikel unter Meldebestand** (Anzahl) | `listReorderSuggestions()` (B5) → `.length` | `/verfuegbarkeit/meldebestand` |
| Finanzen | **offene Posten Σ** + **davon überfällig Σ** | `listOpenItems()` (B6) → Σ `remaining` (status≠bezahlt) und Σ `remaining` (overdue) | `/finanzen` |

- Die Verkauf-Kachel braucht einen **unbounded** Zähler (aktuell offene Angebote,
  nicht zeitraumgebunden). `salesTotals()` ist zeitraumgebunden → B7 ergänzt
  `countOpenQuotes(): Promise<number>` (`SELECT COUNT(*) … WHERE status='angebot'`).
- Finanzen aggregiert im Page-Server aus `listOpenItems()`: `offenSumme` =
  Σ `remaining` über `status !== 'bezahlt'`; `ueberfaelligSumme` = Σ `remaining`
  über `overdue`. Kein neuer Repo-Read nötig.
- Verfügbarkeit: die Kachel bekommt bei **> 0** unter Meldebestand das
  `danger`-Token (Aufmerksamkeit), sonst neutral. Finanzen: die
  **überfällig**-Zeile ist `danger`, wenn > 0.

## 4. Architektur / Komponenten

- **`src/app/(shell)/page.tsx`** (bestehend, server, `force-dynamic`): lädt den
  `UserAccess`, ruft **bedingt** je nach `access.apps` die drei Signale ab
  (`Promise.all` nur über die zugänglichen), reicht ein `signals`-Objekt an die
  neue Sektion. Das App-Grid (`<Launchpad>`) bleibt.
- **`src/components/StartOverview.tsx`** (neu, server-render-fähig, kein Client-JS
  nötig — reine Anzeige mit `<Link>`): rendert die Kachelreihe („ÜBERBLICK"
  `.anno`-Label + Grid). Nimmt ein schmales, bereits aufbereitetes Props-Objekt
  (Zahlen + Flags), **keine** Repository-Typen, damit keine Server-Imports in eine
  evtl. später klientseitige Variante lecken. Kacheln mit `danger`-Flag rot.
- **`src/verkauf/repository.ts`**: `countOpenQuotes()` ergänzen (append, unbounded).
- Reihenfolge der Kacheln = Wertschöpfungskette: Verkauf, Verfügbarkeit, Finanzen.
- Leerer/Null-Zustand: fehlt der Zugriff auf **alle** drei Module (z.B. Nutzer nur
  mit `hilfe`), wird die Überblick-Sektion **nicht** gerendert (nur App-Grid).

## 5. Design-System (bindend)

- Kacheln = warme `neutral`-Flächen (`ChartCard` oder gleiche Tailwind-Strings wie
  die Finanzen-`Tile`), `.anno` „ÜBERBLICK"-Sektionslabel und Kachel-Micro-Labels.
- Accent nur via Token; Attention/überfällig via `danger` (kein Accent für
  Warnungen — B5/B6-Entscheid). `dark:`-Varianten auf allen neuen Flächen.
- Deep-Links als ganze Kachel klickbar (`<Link>`), Hover `hover:border-accent`
  analog zum App-Grid.

## 6. Doku / Hilfe

- Der Launcher ist **keine registrierte App** → `help-content.test` verlangt keine
  Modul-Hilfeseite. Kein neuer Help-Slug.
- Optional: kurzer Hinweis in einer bestehenden Übersichts-/Hilfeseite, dass der
  Startbildschirm die offenen Vorgänge bündelt. **Nicht** zwingend für DoD.

## 7. Tests

- **`countOpenQuotes()`**: Repository-Test (DB) — legt via `createOrder` ein
  `angebot` an, erwartet Count ≥ 1; ein zu `auftrag` überführter Beleg zählt nicht.
- **Aggregation**: die Finanzen-Σ-Logik (offen vs. überfällig) ist reine
  Page-Arithmetik über `listOpenItems()` — im Browser verifiziert (Zahlen matchen
  `/finanzen`-KPIs). Keine eigene Unit-Test-Pflicht über die vorhandenen
  `listOpenItems`/`listReorderSuggestions`-Tests hinaus.
- **Access-Gating**: browser-verifiziert mit Admin (alle Kacheln) — Nicht-Admin/
  Teilzugriff wird durch das vorhandene `accessibleApps`/`access.apps`-Muster
  garantiert (dieselbe Quelle wie das App-Grid).

## 8. Definition of Done

- `countOpenQuotes()` + Test grün; Vollsuite grün (26 rls-Host-Caveat), `tsc` clean.
- `/` zeigt für den Admin die drei Kacheln mit korrekten Zahlen (matchen die
  Modul-Screens), Deep-Links funktionieren, überfällig rot, App-Grid unverändert.
- Deploy bryx-test + Browser-Verifikation (Konsole clean). Nie Produktion.
