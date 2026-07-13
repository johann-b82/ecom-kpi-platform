# Admin-Exklusives absichern & markieren

**Datum:** 2026-07-13
**Branch:** `feat/admin-only-markers`

## Problem / Ziel

Ein Admin soll auf einen Blick erkennen, welche UI-Elemente **nur er** sieht
(und normale Nutzer nicht). Zusätzlich stellte sich bei der Analyse heraus, dass
die Einstellungsseite `/setup` zwar den Abschnitt „Gruppen & Zugriffe"
admin-gatet, der Rest (Branding, Nutzer, Verbindungen/Credentials, Sync) aber
**allen** angezeigt wird, die die Seite öffnen — und der Menülink „Einstellungen"
für jeden sichtbar ist. Das wird im Zuge dieser Änderung geschlossen.

## Rollenmodell (Ist-Zustand, Referenz)

Admin = Mitglied einer Gruppe mit `groups.is_admin = true`. Ermittelt in
`src/lib/groups.ts` → `getUserAccess(userId)` (`access.isAdmin`). Es gibt kein
Flag am User selbst.

Heute tatsächlich `isAdmin`-gegatete Oberflächen:
- Hilfe-Sidebar-Gruppe „Administration" (`HilfeSidebar.tsx`) und die
  „Administration"-Sektion der Hilfe-Startseite (`hilfe/page.tsx`).
- `/setup` → `GroupsForm` (nur dieser eine Abschnitt).

## Umfang (vom Nutzer bestätigt)

**Markieren _und_ `/setup` echt absichern.**

## Design

### 1. Marker-Komponente (neu) — `src/components/AdminOnlyTag.tsx`
- `LockIcon` — Inline-SVG-Schloss, `currentColor`, ~13px, dezent akzentgetönt
  (`text-accent`), für Menü-/Nav-Zeilen.
- `AdminOnlyTag` — `LockIcon` + `.anno`-Label „Nur Admin" (DM Mono, uppercase —
  die einzige sanktionierte Großschreibung laut Design-System), für
  Überschriften und den Setup-Banner.
- Design-System-konform: Akzent via `--accent`, warme `neutral`-Töne,
  Dark-Mode-Varianten. Kein konkurrierender Accent, kein kaltes Grau.

### 2. `/setup` absichern — `src/app/setup/page.tsx`
- Ganz oben (nach Ermittlung von `access`): `if (!access.isAdmin) redirect('/')`
  (`redirect` aus `next/navigation`).
- Der dadurch redundante `{access.isAdmin && <GroupsForm … />}`-Guard wird
  entfernt und `groups` unbedingt geladen (die ganze Seite ist jetzt admin-only).
- **Ein** Hinweis-Banner oben im Content: `AdminOnlyTag` +
  „nur für Administratoren sichtbar". Kein Marker pro Abschnitt (wäre nach der
  Absicherung nur Lärm).

### 3. Benutzermenü — `src/components/UserMenu.tsx` (+ `src/app/(shell)/layout.tsx`)
- Neue Prop `isAdmin: boolean`; `ShellLayout` reicht `access.isAdmin` durch.
- Der „Einstellungen"-Eintrag wird nur noch bei `isAdmin` gerendert, mit
  `LockIcon` dahinter. (Sonst klickt ein Nicht-Admin und wird sofort
  weggeleitet.)

### 4. Hilfe — Marker an „Administration"
- `HilfeSidebar.tsx`: `AdminOnlyTag` an der Gruppen-Überschrift „Administration".
- `hilfe/page.tsx`: `AdminOnlyTag` an der `<h2 class="anno">Administration`.
- Beide Stellen sind bereits `isAdmin`-gegatet → der Marker erscheint nur beim
  Admin.

### 5. Doku-Sync (Pflicht laut Projekt-CLAUDE.md — Zugriffslogik geändert)
- `src/lib/help/content.ts`, Seite `rollen-gruppen`: einen Hinweis ergänzen,
  dass „Einstellungen (/setup)" ausschließlich für Admins zugänglich ist.
- Registry-Test `tests/lib/help-content.test.ts` muss grün bleiben.

## Nicht im Umfang (YAGNI)

- Kein Marker an einzelnen Setup-Abschnitten (die ganze Seite ist admin-only).
- Keine Markierung von App-Kacheln in Rail/Launchpad (Sichtbarkeit ist dort
  pro-Nutzer/Gruppe, nicht global „admin-only").
- Keine Änderung am Rollenmodell selbst.

## Tests / Verifikation

TDD, Vitest (`tests/components/**` läuft unter jsdom mit
`@testing-library/react`):
- `admin-only-tag.test.tsx` — rendert Schloss + „Nur Admin".
- UserMenu — „Einstellungen" fehlt bei `!isAdmin`, vorhanden + Schloss bei
  `isAdmin`.
- HilfeSidebar — „Administration"-Gruppe fehlt bei `!isAdmin`, mit Marker bei
  `isAdmin`.
- `help-content.test.ts` bleibt grün.
- Der `/setup`-Redirect ist ein Server-Component-Redirect (nicht sinnvoll als
  Unit-Test) → **Browser-Verifikation** auf der Testumgebung: als `test.nutzer`
  (Redirect weg von `/setup`, kein „Einstellungen"-Link) und als Admin (Marker
  an Hilfe-Administration, Einstellungen-Link mit Schloss, Setup-Banner).

## Deployment

Nur **Testumgebung** (dieser Host, `bryx-test.lumeapps.de`, via
`/opt/budp-dev/deploy.sh`) — vom Nutzer bestätigt. **Production (budp) wird
nicht angefasst.**
