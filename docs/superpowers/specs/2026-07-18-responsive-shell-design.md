# Responsive Shell — Design

**Datum:** 2026-07-18
**Scope:** Nur Responsive. Die bestehende Shell (Rail + Per-App-Sidebars + Top-Bar)
wird an drei Breakpoints angepasst. Statuspuls & Kontextbrücke werden **nicht**
gebaut (existieren noch nicht) — ihre Regeln werden nur als vorwärtskompatible
Vorgabe festgehalten.

## Ausgangslage (Ist-Zustand)

- **Rail** — `src/components/AppRail.tsx`, global im `(shell)/layout.tsx`, `w-16`
  (64px), dunkel. Launchpad-Kachel oben, Apps in Registry-Reihenfolge
  (Gruppen `kette`/`zentral`), „lumeapps"-Fußzeile.
- **Sidebar** — kein einheitliches Bauteil. Jede App rendert ihre **eigene**
  Sidebar (`VerkaufSidebar`, `VerfuegbarkeitSidebar`, `FinanzenSidebar`,
  `KontakteSidebar`, `KatalogSidebar`, `BpmSidebar`, `HilfeSidebar` …), fest
  `w-56` (224px), im jeweiligen `(shell)/<app>/layout.tsx`. 7 App-Layouts
  rendern eine Sidebar (brickpm nested).
- **Top-Bar** — im `(shell)/layout.tsx`: Logo (links) + `UserMenu` (rechts).
  **Kein Modulname.**
- **DataTable** — `src/components/DataTable.tsx` hat bereits `overflow-x-auto`.

## Breakpoints

Tailwind-Standardwerte matchen die Spec exakt — keine Custom-Breakpoints.

| Zone            | `≥lg` (≥1024px) Desktop | `md–lg` (768–1023px) Tablet | `<md` (<768px) Mobile |
|-----------------|-------------------------|-----------------------------|-----------------------|
| **Rail**        | sichtbar (Ist)          | sichtbar                    | → **Bottom-Tab-Bar**  |
| **Sidebar**     | inline (Ist)            | **Overlay-Drawer** (links)  | **Fullscreen-Sheet** (unten) |
| **Trigger**     | —                       | Modulname im Top-Bar        | Modulname im Top-Bar  |

Desktop-Maße bleiben unverändert: Rail 64px (`w-16`), Sidebar 224px (`w-56`).

## Architektur: Shared Shell-Chrome

Der Trigger (Modulname) sitzt im Top-Bar (Shell-Layout), der Sidebar-Inhalt tief
in den App-Layouts. Ein schlanker Client-Context überbrückt das.

### `ShellNavProvider` (neu)
- Client-Context, im `(shell)/layout.tsx` um die Content-Spalte gelegt.
- Hält nur `open: boolean` + `setOpen` für Drawer/Sheet. Kein weiterer State.
- Schließt bei Routenwechsel (Link-Auswahl) automatisch.

### `ModuleBar` (neu, im Top-Bar)
- Zwischen Logo und `UserMenu` im Shell-Top-Bar.
- Leitet den aktiven Modulnamen aus `usePathname()` + `APPS` (aus
  `src/lib/apps.ts`) ab. Kein Modulname auf dem Launchpad (`/`).
- Darstellung:
  - `≥lg`: **nichts** (Sidebar ist ohnehin sichtbar).
  - `<lg`: Button mit Modulnamen (min. 44px Höhe), toggelt `open` im Context.

### `ModuleSidebar` (neu, Wrapper)
- Umschließt in jedem App-Layout die bestehende `<XSidebar/>` (Einzeiler pro
  Layout). Die ~9 Sidebar-Komponenten bleiben **inhaltlich unverändert**.
- Rendert Inhalt:
  - `≥lg`: inline an Ort und Stelle (wie heute).
  - `md–lg`: per Portal als **Overlay-Drawer** von links über dem Content, mit
    Backdrop. Öffnen via Context, schließt bei Backdrop-Tap oder Link-Auswahl.
  - `<md`: per Portal als **Fullscreen-Sheet** von unten. Gleiches Öffnen/
    Schließen.
- **Volle Breite** als Overlay/Sheet — nie als gequetschte Spalte (Regel 2).

## Bottom-Tab-Bar (Rail → Mobile)

- Neue Client-Komponente. `<md` sichtbar, Rail `<md` versteckt
  (`hidden md:flex` an der Rail, `flex md:hidden` an der Tab-Bar).
- Fix am unteren Rand, **max. 5 Slots**: die **ersten 4 zugänglichen Apps**
  (Registry-Reihenfolge, dieselbe Quelle wie die Rail) **+ „Mehr"**.
- Ist die **aktive App nicht** unter den ersten 4, ersetzt sie **Slot 4** →
  die aktive App ist immer sichtbar und **amber** markiert (wie im Rail,
  Regel 1). „Mehr" öffnet den Launchpad (`/`).
- Min. 44px Höhe je Slot; unten `env(safe-area-inset-bottom)` respektieren.
- Content erhält `<md` unteres Padding, damit die Bar nichts verdeckt.

## Touch & Tabellen (Regel 5)

- `<lg`: alle interaktiven Elemente min. 44px Höhe — Sidebar-Links (`py-1.5`
  → zusätzlich `min-h-11` auf Touch), Tab-Bar-Slots, Modulname-Trigger.
- Tabellen scrollen horizontal statt Spalten zu verstecken: `DataTable` hat
  bereits `overflow-x-auto`. Verifikation: keine rohe `<table>` ohne
  Scroll-Wrapper in den Apps.

## Bewusst NICHT im Scope

- **Statuspuls (Regel 4)** und **Kontextbrücke (Regel 3, Long-Press)**:
  existieren noch nicht (im Design-Foundation-Plan als „future phases"). Werden
  nicht gebaut. Vorwärtskompatible Vorgabe für ihre spätere Umsetzung:
  - Statuspuls muss auf **jedem** Breakpoint sichtbar bleiben — nie in ein
    Overflow-Menü. Sinnvoller Platz: fester Slot im Top-Bar (überlebt Drawer/
    Sheet/Tab-Bar-Umbau).
  - Kontextbrücke: ab Tablet abwärts ersetzt **Long-Press** den Hover-Trigger.
- **Desktop-Restyle**: Rail/Sidebar bleiben 64px/224px (nicht auf die in der
  Spec genannten 54/196 verschmälert).

## Verifikation

- **Automatisiert:** `npx vitest` grün (bestehende Suite; neue Komponenten
  erhalten Tests für die App-Auswahl-Logik der Tab-Bar und die aktive-App-
  Ersetzung).
- **Manuell im Browser** (auf dem VPS, gemäß Projektvorgabe): je Breakpoint
  (Desktop/Tablet/Mobile) Rail↔Tab-Bar, Sidebar-Drawer/-Sheet öffnen/schließen,
  aktive-App-Markierung, „Mehr"→Launchpad, 44px-Touch-Targets, horizontaler
  Tabellen-Scroll.

## Betroffene Dateien (Überblick)

- `src/app/(shell)/layout.tsx` — `ShellNavProvider` + `ModuleBar` im Top-Bar,
  Content-Padding für die Tab-Bar.
- `src/components/AppRail.tsx` — `<md` ausblenden.
- **neu** `src/components/BottomTabBar.tsx`, `ShellNav`-Context/Provider,
  `ModuleBar`, `ModuleSidebar`-Wrapper.
- `src/app/(shell)/<app>/layout.tsx` (7×) + `brickpm/layout.tsx` — bestehende
  Sidebar in `<ModuleSidebar>` hüllen.
- Sidebar-Links: `min-h-11` auf Touch.
- Hilfe-Modul (`src/lib/help/content.ts`): keine neue App/kein neues Datenmodell
  → keine Doku-Pflicht ausgelöst; Änderung ist rein Layout.
