# Design: Hilfe/Dokumentations-Modul

**Datum:** 2026-07-13
**Branch (Ausgangspunkt):** feat/bryx-phase1-kontakte-katalog
**Status:** Design abgestimmt

## Ziel

Ein in die Plattform integriertes Hilfe-/Dokumentationsmodul mit zwei Ebenen:

- **a) Nutzer-Doku** — kurze Erklärung der Funktionen je Modul, für alle
  Plattform-Nutzer sichtbar.
- **b) Admin-Doku** — zusätzlich technische Dokumentation (Datenmodell,
  Rollen/Gruppen, Connectors, Branding), nur für Admins.

Die Doku wird bei jeder relevanten Funktionsänderung mitgepflegt (durchgesetzt
über eine verbindliche CLAUDE.md-Regel).

## Nicht-Ziele (YAGNI)

- Keine Suche, keine Volltext-Indizierung, keine Versionierung der Doku.
- Kein Markdown-/MDX-Renderer und keine neue Dependency — Inhalte sind
  strukturierte TS-Daten (folgt „Simplicity first / built-in primitives").
- Keine gruppenbasierte Zugriffskonfiguration für das Hilfe-Modul selbst; es ist
  wie das Dashboard immer sichtbar. Nur der Admin-Bereich darin ist geschützt.
- Keine In-App-Bearbeitung der Doku durch Nutzer (Pflege erfolgt im Repo).

## Architektur

### 1. Shell-Integration

- Neue App in `src/lib/apps.ts`:
  - `AppKey` um `'hilfe'` erweitern.
  - Eintrag `{ key: 'hilfe', label: 'Hilfe', abbr: 'HI', href: '/hilfe' }` ans
    Ende von `APPS`.
- `accessibleApps()` in `src/lib/groups.ts` so anpassen, dass `hilfe` — analog
  zu `dashboard` — **immer** enthalten ist:
  `a.key === 'dashboard' || a.key === 'hilfe' || access.isAdmin || !!access.apps[a.key]`.
- Mount unter `src/app/(shell)/hilfe/`:
  - `layout.tsx` (Server): liest `getUserAccess()` → `isAdmin`, rendert
    `HilfeSidebar` (mit `isAdmin`-Prop) + scrollbaren `<main>`. **Kein**
    `requireAppAccess`-Gate (Modul ist für alle offen).
  - `page.tsx`: Startseite (`/hilfe`).
  - `[slug]/page.tsx`: Detailseite je Doku-Seite.

Muster orientiert sich an `src/app/(shell)/kontakte/layout.tsx` +
`src/components/KontakteSidebar.tsx` (`w-56`-Sidebar, `border-r`, warme
Neutrals, aktive Zeile `bg-accent text-white`).

### 2. Inhaltsmodell — `src/lib/help/content.ts`

```ts
export type DocBlock =
  | { type: 'p'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'steps'; items: string[] }
  | { type: 'table'; head: string[]; rows: string[][] }
  | { type: 'note'; text: string };

export interface DocSection {
  heading: string;
  blocks: DocBlock[];
}

export interface DocPage {
  slug: string;        // eindeutig, URL-Segment unter /hilfe/
  title: string;
  summary: string;     // 1 Satz, für Startseiten-Karten + Sidebar-Tooltip
  admin?: boolean;     // true = nur für Admins
  group: 'start' | 'module' | 'admin';  // Sidebar-Gruppierung
  sections: DocSection[];
}

export const HELP_PAGES: DocPage[] = [ /* … */ ];

// Helfer
export function getHelpPage(slug: string): DocPage | undefined;
export const HELP_USER_PAGES: DocPage[];   // group !== 'admin'
export const HELP_ADMIN_PAGES: DocPage[];  // admin === true
```

Die Slug-Liste bleibt bewusst flach (ein Segment). Beispiel-Slugs:
`uebersicht`, `dashboard`, `brickpm`, `kontakte`, `katalog` (Nutzer);
`rollen-gruppen`, `datenmodell`, `verbindungen`, `branding` (Admin).

### 3. Rendering — `src/components/help/DocArticle.tsx`

- Client- oder Server-Komponente (Server reicht, rein darstellend).
- Rendert `DocPage.sections` → Blöcke:
  - `p` → Absatz (`text-neutral-700 dark:text-neutral-300`).
  - `list` → `ul` mit Punkten.
  - `steps` → `ol` nummeriert.
  - `table` → responsive Tabelle in `overflow-x-auto`-Container, für das
    Datenmodell (Spalten z. B. „Feld / Typ / Bedeutung").
  - `note` → hervorgehobener Hinweis-Block (`--accent`-getönt).
- Überschriften der Sektionen als `.anno`-Micro-Label + Titel, gemäß
  Design-System (font-sans, DM Mono nur für `.anno`).
- Dark-Mode-Varianten durchgängig; Akzent immer via `--accent`.

### 4. Sidebar — `src/components/help/HilfeSidebar.tsx`

- `'use client'`, `usePathname()` für aktive Zeile (analog KontakteSidebar).
- Props: `{ isAdmin: boolean }`.
- Gruppen mit `.anno`-Überschriften:
  - **Erste Schritte** → `uebersicht`
  - **Module** → `dashboard`, `brickpm`, `kontakte`, `katalog`
  - **Administration** (nur wenn `isAdmin`) → `rollen-gruppen`, `datenmodell`,
    `verbindungen`, `branding`
- Einträge werden aus `HELP_PAGES` abgeleitet (nicht doppelt gepflegt).

### 5. Admin-Gating

- Sidebar zeigt die Admin-Gruppe nur bei `isAdmin` (rein kosmetisch).
- Echte Durchsetzung in `[slug]/page.tsx`: nach `getHelpPage(slug)`
  - unbekannter Slug → `notFound()`.
  - `page.admin && !isAdmin` → `redirect('/hilfe')`.
- `isAdmin` kommt serverseitig aus `getUserAccess(user.id)`.

### 6. Startseite — `/hilfe`

- Kurzer Einleitungstext (Was ist die Plattform).
- Karten-Grid der Nutzer-Modulseiten (`HELP_USER_PAGES`) mit `title` + `summary`,
  Link auf `/hilfe/<slug>`.
- Wenn `isAdmin`: zusätzlicher Abschnitt „Administration" mit den Admin-Karten.

## Seed-Inhalt (initial)

**Nutzer**
- `uebersicht` — Plattform-Überblick, Navigation (AppRail, Top-Bar, Benutzermenü),
  Theme/Abmelden.
- `dashboard` — KPI-Überblick, Datenquellen.
- `brickpm` — Sortiment/Preise/Aktionen/Wettbewerb (knapp, nach vorhandenen
  BrickPM-Bereichen).
- `kontakte` — Kontaktliste, Detail, Verbindungen.
- `katalog` — Produkte/Varianten/Preise, Einstellungen/Verbindungen.

**Admin**
- `rollen-gruppen` — Gruppen, `is_admin`, App-Zugriffe (view/edit), Standard-Gruppe.
- `datenmodell` — Tabellen je Domäne als `table`-Blöcke, abgeleitet aus
  `db/schema.sql`:
  - Kontakte: `contacts`, `contact_addresses`, `contact_persons`
  - Katalog: `products`, `product_variants`, `prices`, `product_bundles`,
    `product_documents`
  - Plattform/Zugriff: `groups`, `group_members`, `group_app_access`
  - Integrationen: `connector_credentials`, `oauth_connections`,
    `integration_connections`, `external_references`, `sync_state`
  - BrickPM (`bpm_*`) bleibt vorerst **bewusst ausgeklammert** (später ergänzen).
- `verbindungen` — Connector-/OAuth-Konzept, Zugangsdaten, Sync.
- `branding` — White-Label (`getBranding()` → RootLayout), Logo/Titel.

Inhalte werden knapp gehalten und aus dem tatsächlichen Code/Schema abgeleitet,
nicht spekulativ.

## Aktuell-halten (Prozess)

Neue Sektion in `CLAUDE.md` (Projekt-Instruktionen):

```
## Dokumentation
- Bei jeder relevanten Funktionsänderung die Hilfe-Doku (Nutzer + Admin) unter
  `src/lib/help/content.ts` mitpflegen. Neue App/Modul → neue Hilfeseite +
  Registrierung. Datenmodell-Änderung → `datenmodell`-Seite aktualisieren.
```

## Tests

Vitest (`tests/…`), leichtgewichtig, ohne DB/Netzwerk:

1. **Registry-Konsistenz** (`src/lib/help/content.ts`):
   - Slugs sind eindeutig und URL-safe.
   - Jede in `apps.ts` registrierte App (außer `hilfe` selbst) hat eine
     Modul-Hilfeseite (`group === 'module'`).
   - Admin-Seiten haben `admin === true` und `group === 'admin'`; Nutzerseiten
     nicht.
   - `getHelpPage()` liefert für bekannte Slugs die Seite, für unbekannte
     `undefined`.

Kein UI-/Route-Rendering-Test nötig (das Gating ist trivialer Server-Code);
manuelle Browser-Verifikation der beiden Ansichten (Nutzer vs. Admin) beim
Abschluss.

## Betroffene / neue Dateien

**Neu**
- `src/lib/help/content.ts` — Inhaltsmodell + Registry + Helfer.
- `src/components/help/DocArticle.tsx` — Block-Renderer.
- `src/components/help/HilfeSidebar.tsx` — Sidebar.
- `src/app/(shell)/hilfe/layout.tsx`
- `src/app/(shell)/hilfe/page.tsx`
- `src/app/(shell)/hilfe/[slug]/page.tsx`
- `tests/help-content.test.ts`

**Geändert**
- `src/lib/apps.ts` — `hilfe` registrieren.
- `src/lib/groups.ts` — `accessibleApps()` um `hilfe` erweitern.
- `CLAUDE.md` — Sektion „Dokumentation".

## Verifikation

- `npx vitest` grün (inkl. neuem Registry-Test).
- Deploy auf dem VPS (per Projekt-Regel), danach Browser-Check:
  - Nutzer ohne Admin: sieht Hilfe-App, Nutzer-Seiten; **keine** Admin-Gruppe;
    direkter Aufruf einer Admin-Slug-URL → Redirect auf `/hilfe`.
  - Admin: sieht zusätzlich Administration inkl. Datenmodell-Tabellen.
  - Dark-Mode + White-Label unverändert funktionsfähig.
