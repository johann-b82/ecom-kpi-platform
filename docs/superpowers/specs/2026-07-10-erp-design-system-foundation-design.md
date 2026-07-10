# ERP Design System — Fundament (Phase 1)

**Datum:** 2026-07-10
**Branch:** `feat/erp-design-system-foundation`
**Status:** Design freigegeben, bereit für Implementierungsplan

## Kontext & Ziel

Das heutige `ecom-kpi-platform` (Next.js 14, Tailwind, Recharts, Supabase) wird zur
**ersten App einer modularen ERP-Plattform** ausgebaut. Das im Anhang gelieferte
warme Amber-Design-System (Rail + Launchpad + Modul-Sidebar, Plus Jakarta Sans /
DM Mono, warm-neutrale Palette) wird zum **verbindlichen Standard**.

**Phase 1 (dieses Spec) = Fundament:** Design-Tokens ins Tailwind-Setup portieren,
App-Shell (Rail + Launchpad-Home + Modul-Sidebar) einführen, das bestehende
KPI-Dashboard als erste App in die Shell einhängen, den Standard verankern.

**Nicht in Phase 1 (YAGNI, je eigenes Folge-Spec):**
- Die 9 weiteren ERP-Apps (CRM, Finanzen, HR, …)
- Signature-Features Kontextbrücke™ und Statuspuls™ (brauchen echte Cross-Modul-Daten)
- Dark-Mode-Feinschliff über das hier Definierte hinaus

## Freigegebene Grundsatzentscheidungen

1. **Design vollständig übernehmen**, KPI-Dashboard wird eine App unter vielen.
2. **Dark-Mode bleibt** — das Design System wird um eine warm-dunkle Variante ergänzt.
3. **Amber-Default (`#D97706`) + White-Label bleibt** — `--accent` mappt auf den
   bestehenden `--brand`-Mechanismus; Tenant-Farbwechsel funktioniert unverändert.
4. **Launchpad zeigt nur real existierende Apps** (heute: `dashboard`, `brickpm`).
5. **Token-Ausdruck:** CSS-Custom-Properties + Tailwind-Theme-Extension (Approach A).
6. **Shell/Routing:** Route-Group `(shell)` mit persistenter Rail (Approach A),
   inkl. Umzug des Dashboards `/` → `/dashboard`, `/` wird das Launchpad.
7. **Fonts:** Roboto → Plus Jakarta Sans (UI) + DM Mono (Mono/Labels).

## Architektur

### 1. Token-System (CSS-Vars + Tailwind)

**CSS-Custom-Properties** in `globals.css` (angelehnt an die vier Token-Dateien des
Anhangs: colors / typography / spacing / effects). Warm-neutrale Skala, Amber-Akzent,
Status-Tokens, Radii, Schatten, Transitions.

**Tailwind-Theme-Extension** (`tailwind.config.ts`) exponiert die Tokens als Utilities.
Zentrale, chirurgische Maßnahme: die Tailwind-`neutral`-Palette wird auf **warme**
Werte überschrieben, sodass alle bestehenden `neutral-*`-Klassen (inkl.
`dark:bg-neutral-900/950`) automatisch warm werden — minimaler Diff, größter Effekt.

Warme Neutral-Skala (Mapping auf Tailwind-Stops):

| Stop | Wert | Rolle |
|------|--------|-------|
| 50 | `#fafaf8` | Seitenhintergrund (light) |
| 100 | `#f5f2ec` | Surface / Sidebar |
| 200 | `#e8e4dc` | Border light |
| 300 | `#d8d4cc` | Border default |
| 400 | `#c4c0b8` | Border strong |
| 500 | `#9a9488` | Text muted / Annotations |
| 600 | `#6b6560` | Text secondary |
| 700 | `#4a4540` | — |
| 800 | `#2e2a26` | Nav-Gradient-Ende / Dark-Surface-2 |
| 900 | `#1e1c1a` | Text primary / Nav-BG / Dark-Surface-1 |
| 950 | `#171513` | Dark-Seitenhintergrund |

Zusätzliche semantische Utilities: `accent` (→ `var(--accent)`), `accent-hover`,
Status (`success`/`danger`/`warning` mit `-subtle`/`-text`/`-border`), `shadow-card`,
`shadow-popover`, `rounded-{xs,sm,md,lg,xl,2xl}`, `font-mono`.

### 2. White-Label + Amber-Default

- `BRANDING_DEFAULTS.color` in `src/lib/settings.ts`: `#D9004C` → `#D97706`.
- In `globals.css`: `--accent: var(--brand)`, `--accent-hover: var(--brand-dark)`.
  Der bestehende `--brand`/`--brand-dark`-Mechanismus (DB-getrieben via `getBranding`
  + `RootLayout` inline style) bleibt die Quelle; `/setup → Branding` unverändert
  funktionsfähig. `brand` (Tailwind) bleibt `var(--brand)`.

### 3. Dark-Mode (warm-dunkel)

- `next-themes`/`ThemeProvider` bleiben. Dark-Mode nutzt die gewärmte Neutral-Skala:
  Flächen `neutral-900/950` (jetzt warm `#1e1c1a`/`#171513`), Amber-Akzent unverändert.
- Der Anhang ist Light-only; dieser Dark-Layer ist die dokumentierte Ergänzung und
  wird in der Guidelines-Datei festgehalten.

### 4. Typografie

- `next/font/google`: **Plus Jakarta Sans** (400/500/600/700) → `--font-sans`,
  **DM Mono** (400/500) → `--font-mono`. Roboto entfällt.
- `tailwind.config.ts`: `fontFamily.sans` → Plus Jakarta Sans, `fontFamily.mono` → DM Mono.
- `.anno`-Utility (mono, ~9–10px, UPPERCASE, `letter-spacing` 0.07em, `text-muted`)
  für Micro-Labels/Tabellenköpfe.

### 5. App-Shell (Route-Group `(shell)`)

Struktur (Route-Groups ändern keine URLs):

```
src/app/
  (shell)/
    layout.tsx        ← Rail (54px, warm-dunkel) + Shell-Topbar; immer sichtbar
    page.tsx          ← Launchpad (/) — App-Grid aus zugänglichen APPS
    dashboard/
      page.tsx        ← KPI-Dashboard (umgezogen von app/page.tsx)
    brickpm/          ← bestehend, an Shell angepasst (eigene Modul-Sidebar bleibt)
      layout.tsx
      page.tsx …
  login/page.tsx      ← außerhalb der Shell
  setup/…             ← Phase 1: unverändert erreichbar (Shell-Integration optional/später)
```

Shell-Komponenten:
- **Rail** (neu, `AppRail`): Logo-Button (= zurück zum Launchpad), Text-Kürzel-Icons
  pro zugänglicher App (`DB`, `BP`), aktive App amber; unten Powered-by-`lumeapps`-Mark
  (6px DM Mono, `rgba(255,255,255,.28)`), UserMenu-Avatar.
- **Launchpad** (`page.tsx`): rendert Kacheln aus `APPS` gefiltert über `getUserAccess`.
  Nur real existierende Apps.
- **Modul-Sidebar:** BrickPM behält `BpmSidebar` (Styling auf Tokens umgestellt);
  das Dashboard bekommt (optional) eine schlanke Sidebar oder läuft ohne — als
  Kanban/Phasen-Ansicht wie heute. Entscheidung im Plan; Default: Dashboard ohne
  eigene Sidebar, volle Content-Fläche.
- **Topbar:** `BrandHeader` + `Filters` + `UserMenu` wandern in die Shell-Topbar bzw.
  bleiben pro-App kontextuell (kein globaler schwerer Header).

Die App-Registry `src/lib/apps.ts` wird zur Quelle für Rail + Launchpad erweitert
(pro App: `key`, `label`, Kürzel/`abbr`, `href`). Kein neues Zugriffsmodell —
`getUserAccess`/`group_app_access` bleiben maßgeblich.

### 6. Standard verankern

- **Guidelines-Datei** `docs/design/README.md` (bzw. `docs/design/design-system.md`):
  kompakte, verbindliche Referenz (Tokens, Farb-/Typo-/Komponenten-Regeln, Dark-Layer,
  White-Label, Do/Don't). Single Source of Truth im Repo.
- **Projekt-`CLAUDE.md`:** Abschnitt „Design-Standard" ergänzen — verweist auf die
  Guidelines und listet die Nicht-brechen-Regeln (kein kaltes Grau, kein reines
  Weiß/Schwarz, Amber-Akzent via `--accent`, Plus Jakarta Sans/DM Mono, Tokens statt
  Hex-Literale).
- **Projekt-Memory:** „ERP-Design-System ist der verbindliche Frontend-Standard".

## Betroffene / neue Dateien (Richtwert)

- `src/app/globals.css` — Token-Vars, `.anno`, Body-Tokens (bereits leicht angepasst)
- `tailwind.config.ts` — warme `neutral`-Palette, `accent`/Status/Shadow/Radius, Fonts
- `src/lib/settings.ts` — Default-Farbe `#D97706`
- `src/app/layout.tsx` — Font-Wechsel (Plus Jakarta Sans + DM Mono)
- `src/lib/apps.ts` — App-Registry um `abbr`/`href` erweitern
- **Neu:** `src/app/(shell)/layout.tsx`, `src/app/(shell)/page.tsx` (Launchpad),
  `src/components/AppRail.tsx`, ggf. `src/components/Launchpad.tsx`
- **Umzug:** `src/app/page.tsx` → `src/app/(shell)/dashboard/page.tsx`
- `src/app/brickpm/*` → unter `(shell)` einhängen; `BpmSidebar`/`layout` an Tokens & Shell anpassen
- Komponenten mit Ad-hoc-Styling (`KpiCard`, `BrandHeader`, `UserMenu`, `Filters`,
  `PhaseColumn`, `BpmSidebar`, …) auf Tokens angleichen (schrittweise, im Plan gestaffelt)
- **Neu:** `docs/design/…` Guidelines; `CLAUDE.md` Abschnitt

## Testing & Verifikation

- **Automatisiert:** `npx vitest run` lokal grün (bestehende Tests dürfen nicht brechen;
  Routing-Umzug ggf. Test-Anpassung). Für neue Shell-Logik (Launchpad-App-Filterung
  aus `getUserAccess`) gezielte Unit-Tests (TDD).
- **Visuell:** Shell (Rail/Launchpad/Dashboard/BrickPM) im Browser prüfen
  (Chrome DevTools / Claude-in-Chrome), Light + Dark.
- **Deployment-Ziel:** vor dem Deploy klären — Projekt-`CLAUDE.md` nennt VPS
  `budp.lumeapps.de`, globale Guideline nennt diesen Host (bryx-test) als Test.
  Wird zum Verifikationszeitpunkt entschieden, nicht Teil der Implementierung.

## Risiken / offene Punkte

- **Routing-Umzug `/` → `/dashboard`:** bestehende Links/Tests/Redirects prüfen
  (`brickpm/layout` redirectet auf `/`; „← Dashboard"-Link zeigt auf `/`).
- **`neutral`-Palette überschreiben** betrifft die ganze App visuell — bewusst gewollt,
  aber breit; visuelle Regression durchsehen.
- **BrickPM-Shell-Refactor:** heutiges `brickpm/layout` rendert eine eigene
  Full-Screen-Shell; muss auf die geteilte Rail umgestellt werden ohne Funktionsverlust.
