# ERP Design System — warm Amber

**Status:** binding standard for this repo's frontend, effective phase 1 (2026-07-10).
**Source of truth for this document:** it must match the actual code — if they
disagree, the code wins and this file is out of date; fix the file.

Source spec/plan for the "why":
- `docs/superpowers/specs/2026-07-10-erp-design-system-foundation-design.md`
- `docs/superpowers/plans/2026-07-10-erp-design-system-foundation.md`

## 1. Tokens

### Warm neutral scale (`tailwind.config.ts` → `theme.extend.colors.neutral`)

Overrides Tailwind's built-in cold `gray`/`neutral` so every existing `neutral-*`
class (including `dark:bg-neutral-900/950`) warms up automatically.

| Stop | Hex | Typical role |
|------|---------|----|
| 0 | `#ffffff` | pure white — cards/surfaces only, never page background |
| 50 | `#fafaf8` | page background (light) |
| 100 | `#f5f2ec` | surface / sidebar |
| 150 | `#eceae4` | subtle surface step |
| 200 | `#e8e4dc` | border, light |
| 300 | `#d8d4cc` | border, default |
| 400 | `#c4c0b8` | border, strong |
| 500 | `#9a9488` | muted text / annotations |
| 600 | `#6b6560` | secondary text |
| 700 | `#4a4540` | — |
| 800 | `#2e2a26` | nav gradient end / dark surface 2 |
| 900 | `#1e1c1a` | primary text / nav bg / dark surface 1 |
| 950 | `#171513` | dark page background |

### Brand / accent (`globals.css` `:root` + `tailwind.config.ts`)

- `--brand` / `--brand-dark` — white-label brand color, DB-driven via `getBranding()`,
  default `#d9004c` (bryx magenta) / `#b2003e`. A customer white-label swaps it.
- `--accent: var(--brand)`, `--accent-hover: var(--brand-dark)` — the design
  system's accent always maps onto the white-label brand; never hardcode a
  competing accent color.
- Tailwind exposes both: `brand` / `brand-dark` (raw white-label vars) and
  `accent` / `accent-hover` (design-system alias). Prefer `accent`/`accent-hover`
  in new UI; `brand` remains for the few places that need the literal white-label
  color (e.g. `AppRail` logo tile).

### Status colors (`tailwind.config.ts`)

| Token | subtle | DEFAULT | border |
|-------|--------|---------|--------|
| `success` | `rgba(22,163,74,0.10)` | `#166534` | `rgba(22,163,74,0.25)` |
| `danger` | `rgba(220,38,38,0.08)` | `#dc2626` | `rgba(220,38,38,0.25)` |
| `warning` | `rgba(217,119,6,0.10)` | `#b45309` | `rgba(217,119,6,0.25)` |

Use as `bg-success-subtle`, `text-success`, `border-success-border`, etc.

### Radii (`tailwind.config.ts` → `borderRadius`)

`xs: 3px` · `sm: 4px` · `md: 6px` · `lg: 8px` · `xl: 10px` · `2xl: 12px`

### Shadows (`tailwind.config.ts` → `boxShadow`)

- `shadow-card`: `0 1px 3px rgba(0,0,0,0.06)` — cards, Launchpad tiles.
- `shadow-popover`: `0 8px 32px rgba(0,0,0,0.18), 0 2px 8px rgba(217,119,6,0.12)` —
  menus/dropdowns; carries a faint warm (Amber) tint, not neutral black.

## 2. Fonts

- **Plus Jakarta Sans** (400/500/600/700) — UI text, wired via `next/font/google`
  in `src/app/layout.tsx` as `--font-jakarta`, exposed as `font-sans` in
  `tailwind.config.ts`.
- **DM Mono** (400/500) — micro-labels/monospace, wired as `--font-dm-mono`,
  exposed as `font-mono`.
- `.anno` utility (`src/app/globals.css`): DM Mono, 9px, `letter-spacing: 0.07em`,
  `text-transform: uppercase`, color `#9a9488` (neutral-500). Use it for
  micro-labels/table headers/annotations — it is the **only** sanctioned
  UPPERCASE styling; don't uppercase body copy or headings by hand.
- **Base type scale** (`src/app/globals.css`): responsive root font-size
  `clamp(16px, 13px + 0.35vw, 21px)` so the rem-based Tailwind scale stays dense
  on laptops (~18px @ 1440px) and grows on large desktop monitors (21px @ 2560px)
  instead of reading too small. Absolute-px sizes (`.anno`, `AppRail`
  micro-labels) deliberately do not scale.

## 3. Shell architecture

Route group `src/app/(shell)/` holds every "in the ERP" screen:

- `(shell)/layout.tsx` — persistent `w-16` dark `AppRail` (`src/components/AppRail.tsx`)
  + a flex content column. Fetches `getUserAccess`/`getBranding`, passes
  `accessibleApps(access)` (from `src/lib/groups.ts`) into the rail. It also renders
  the platform-wide **top bar** (brand logo → `/`, `UserMenu` on the right) above the
  content column, so every shell screen shares one brand + profile/theme control.
  App layouts (`verfuegbarkeit`/`kontakte`/`katalog`) therefore only add their own
  module sidebar, not their own header.
- `(shell)/page.tsx` — the Launchpad (`/`), rendering `Launchpad`
  (`src/components/Launchpad.tsx`): an app grid over the same `accessibleApps` list.
- `(shell)/dashboard/` — the KPI dashboard, moved here from the old `/` route.
- `(shell)/verfuegbarkeit/` — Verfügbarkeit, gated by `requireAppAccess('verfuegbarkeit')`;
  keeps its own module sidebar (`VerfuegbarkeitSidebar`) inside a nested
  `verfuegbarkeit/layout.tsx`, nested inside the shell rail.

App registry: `src/lib/apps.ts` defines `AppDef { key, label, abbr, href }` and the
`APPS`/`APP_KEYS` arrays — this is the single source for both the Rail and the
Launchpad. `accessibleApps(access)` in `src/lib/groups.ts` filters `APPS` down to
what a user may see (dashboard is always shown; other apps require access or
admin). **To add a new app:** add one entry to `APPS` in `src/lib/apps.ts`, mount
its routes under `src/app/(shell)/<key>/`, and gate it with `requireAppAccess`
if it needs its own permission — no other registry to touch.

`login/` stays outside `(shell)` (no rail). `setup/` lives **inside** `(shell)`
(`(shell)/setup/`, URL `/setup`) so the settings screen carries the same
AppRail + top bar as every other screen; it is not a registered `APPS` entry and
is reached from the `UserMenu` (admin-only), with its own thin
`(shell)/setup/layout.tsx` providing the scroll container (no module sidebar).

## 4. White-label

The accent color is not hardcoded: `--accent: var(--brand)` in `globals.css`.
`--brand`/`--brand-dark` are set at request time by `RootLayout`
(`src/app/layout.tsx`) via an inline `style` on `<html>`, sourced from
`getBranding()` (`src/lib/settings.ts`), which reads `app_settings` in Postgres
and falls back to `BRANDING_DEFAULTS` (`color: '#D97706'`, the Amber default) on
any error or unset value. Changing a tenant's brand color in `/setup` therefore
re-colors `accent`/`accent-hover` everywhere without touching component code.

## 5. Dark mode (documented extension)

The source design system (see spec) is light-only. Dark mode is the one
documented extension this repo adds on top of it: `next-themes`/`ThemeProvider`
toggle Tailwind's `dark` class (`darkMode: 'class'`), and dark surfaces are
expressed purely through the *same* warmed `neutral` scale plus `dark:` variants
(e.g. `dark:bg-neutral-950 dark:text-neutral-100`) — no separate dark palette,
no cold gray reappearing in dark mode. The Amber accent is unchanged between
light and dark.

## 6. Do / Don't

**Do:**
- Use `accent`/`accent-hover`, the warm `neutral-*` scale, `success`/`danger`/
  `warning`, `rounded-{xs..2xl}`, `shadow-card`/`shadow-popover` — tokens over
  raw hex, always.
- Use `.anno` for the only sanctioned uppercase micro-labels.
- Write UI copy in German, sentence case (e.g. "Apps — tippen zum Öffnen", not
  "Apps — Tippen Zum Öffnen").
- Support both light and dark (`dark:` variants) for anything new.
- Register new apps in `src/lib/apps.ts` and mount them under `(shell)`.

**Don't:**
- Don't reach for Tailwind's stock cold `gray`/`slate`/`zinc`/`stone` palettes —
  the warm `neutral` scale is the only neutral palette in this app.
- Don't use pure white (`#fff`)/pure black (`#000`) directly outside the `neutral-0`
  token and dark-mode `color-scheme` declarations — use `neutral-0`/`neutral-950`
  instead so tone stays warm.
- Don't use emoji in UI copy or component code.
- Don't hand-uppercase text with CSS/JS outside of `.anno`.
- Don't hardcode an accent color that bypasses `--accent`/`var(--brand)` — it
  breaks white-label tenants.
