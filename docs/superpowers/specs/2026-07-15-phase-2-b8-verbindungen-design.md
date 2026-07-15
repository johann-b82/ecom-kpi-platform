# B8 — Zentrale Verbindungen / API-Verwaltung (Admin) · Design

> Letzter Phase-2-Baustein. Roadmap-Ausgangspunkt: „Verbindungsmenüs je Modul"
> (`2026-07-13-phase-2-umsetzungsplan-design.md`, B8). **Nutzer-Redesign:** statt
> vieler Modul-Untermenüs **eine zentrale, admin-seitige API-Verwaltung** für alle
> Apps.

## 1. Ziel

Alle Integrationsverbindungen (`integration_connections`) **aller** Apps werden an
**einer** Stelle gepflegt: im bestehenden Admin-Bereich **`/setup`**
(„Einstellungen", bereits `isAdmin`-gated, aus dem UserMenu erreichbar). Die heute
verstreuten Modul-Untermenüs (Kontakte, Katalog → `einstellungen/verbindungen`)
werden dorthin **konsolidiert**.

**Bewusste Access-Verschiebung:** Verbindungen werden damit **admin-only**
(heute: pro-App-`edit`). Nutzer-Entscheidung („eine zentrale API-Verwaltung **für
Admins**").

## 2. Gesperrte Entscheidungen (Nutzer bestätigt)

- **Zentral statt je Modul:** eine Admin-Sektion unter `/setup`, kein
  Modul-Untermenü.
- **Alle Module mit plausiblen Demo-Connectoren** geseedet (Demo-Stubs wie bisher,
  kein echter API-Call):
  - Verkauf: **Shopware**, **Amazon** (Marketplace)
  - Verfügbarkeit: **DHL** (Versand), **Lieferanten-EDI**
  - Finanzen: **DATEV**, **Bank (FinTS)**
  - (Kontakte: DATEV, HubSpot · Katalog: Amazon, Shopware — bereits geseedet.)
- **Status-Pille auf warmes Token** angleichen (Design-Standard): `verbunden` →
  `bg-accent/15 text-accent`, `nicht verbunden` → `bg-neutral-100 text-neutral-500`
  (+ `dark:`). Betrifft die geteilte `ConnectionStubs`-Komponente.
- **Status-Vokabular (vertagter Punkt #2):** Repo-Wording (`nicht verbunden` /
  `verbunden (Demo)`) bleibt maßgeblich; die Fachspec-Begriffe
  (`bereit`/`nicht_konfiguriert`) werden **nicht** übernommen. Nur Doku angleichen.

## 3. Architektur / Komponenten

### 3.1 Datenzugriff
- **`src/lib/integrations.ts`**: `listAllConnections(): Promise<Connection[]>`
  ergänzen — alle `integration_connections`, sortiert `app, label`. `simulateConnect`
  (bestehend) bleibt der geteilte Demo-Writer.

### 3.2 Zentrale Admin-Sektion
- **`src/app/setup/page.tsx`** (bestehend, `isAdmin`-gated, `redirect('/')` sonst):
  lädt zusätzlich `listAllConnections()` und rendert eine neue Sektion.
- **`src/components/ConnectionsAdmin.tsx`** (neu, `'use client'`): gruppiert die
  Verbindungen nach `app` (Reihenfolge via `APPS`-Labels aus `@/lib/apps`), rendert
  je Gruppe eine Überschrift + `ConnectionStubs`. Ruft eine **zentrale** Server-
  Action zum Verbinden.
- **Zentrale Action** `simulateConnectAction(id)` (neu, im `/setup`-Umfeld):
  gated auf **`isAdmin`** (nicht `requireAppAccess`), ruft `simulateConnect(id)`,
  `revalidatePath('/setup')`. Ort: `src/app/setup/actions.ts` (neu) — `'use server'`.

### 3.3 Konsolidierung (Entfernen der Modul-Untermenüs)
- Entfernen:
  - `src/app/(shell)/kontakte/einstellungen/verbindungen/page.tsx`
  - `src/app/(shell)/katalog/einstellungen/verbindungen/page.tsx`
  - die `simulateConnectAction`-Exports aus `src/app/(shell)/kontakte/actions.ts`
    und `src/app/(shell)/katalog/actions.ts` (nur diese Action; übrige Actions
    bleiben).
  - die „Verbindungen"-Einträge aus `KontakteSidebar.tsx` und `KatalogSidebar.tsx`.
- Verwaiste leere `einstellungen/`-Verzeichnisse entfernen.

### 3.4 Seed
- **Dediziertes Seed** (analog `seed-finanzen`): `src/lib/verbindungen-seed.ts`
  (typisierte Const `CONNECTION_SEED`) + `scripts/seed-verbindungen.ts`
  (`seedVerbindungen()`, `ON CONFLICT (id) DO UPDATE`, stabile UUIDs `44444444-…`,
  Direktausführungs-Guard), npm-Script `seed-verbindungen`. Fügt die neuen
  Demo-Connectoren (Verkauf/Verfügbarkeit/Finanzen) ein; die bestehenden
  Kontakte/Katalog-Connection-Seeds bleiben unangetastet.

## 4. Design-System (bindend)

- `ConnectionStubs`-Statuspille auf warme Tokens (s. §2). Kein kaltes
  Grün/Slate mehr. `.anno` für Provider-Micro-Label bleibt.
- Admin-Sektion: warme `neutral`-Flächen, `dark:`-Varianten, Accent nur via Token.
  Gruppen-Überschriften als schlichte `.anno`- oder `font-semibold`-Labels.

## 5. Doku / Hilfe

- **`verbindungen`**-Admin-Hilfeseite (`src/lib/help/content.ts`, `group:'admin'`)
  aktualisieren: zentrale Verwaltung unter Einstellungen/`setup`, admin-only,
  alle Apps an einer Stelle, Demo-Verbindungen (Stubs). Status-Vokabular
  (`nicht verbunden` / `verbunden (Demo)`) benennen.
- **`datenmodell`** nur anpassen, falls sich am `integration_connections`-Modell
  etwas ändert — tut es **nicht** (nur neue Seed-Zeilen). Keine Änderung nötig.

## 6. Tests

- **`tests/app/connection-stub.test.ts`** umschreiben: statt der (entfernten)
  kontakte-`simulateConnectAction` die **zentrale** Admin-Action testen — gated auf
  `isAdmin`, ruft `simulateConnect(id)`, `revalidatePath('/setup')`.
- **`listAllConnections()`**: kleiner Repository-Test (DB) — nach Seed erscheinen
  Verbindungen mehrerer Apps (mind. verkauf + finanzen), sortiert nach `app,label`.
- **Seed-Idempotenz**: Doppellauf ohne Duplikate/FK-Fehler (wie B6-Seed).
- Vollsuite grün (26 rls-Host-Caveat), `tsc` clean.

## 7. Definition of Done

- `/setup` zeigt (als Admin) alle Verbindungen aller Apps gruppiert; „Verbinden
  (Demo)" setzt Status → `verbunden (Demo)`, Statuspille warm.
- Kontakte/Katalog haben **kein** Verbindungen-Untermenü mehr; keine toten Links.
- Seed-Demo-Connectoren für Verkauf/Verfügbarkeit/Finanzen sichtbar.
- `connection-stub`-Test + `listAllConnections`-Test grün; Vollsuite grün; `tsc`
  clean. `verbindungen`-Hilfeseite aktualisiert.
- Deploy bryx-test + Browser-Verifikation (Konsole clean). Nie Produktion.
