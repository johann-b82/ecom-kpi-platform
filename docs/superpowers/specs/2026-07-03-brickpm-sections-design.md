# BrickPM sections (Phase 3) — Design

**Date:** 2026-07-03
**Status:** Approved (user pre-authorized autonomous completion; recommendations chosen on ambiguity)
**Branch:** `brickpm-sections`

## Context

Phase 2 shipped the gated `/brickpm` shell + Cockpit, backed by the `bpm_` tables. Phase 3
fills in the **9 remaining sidebar sections** as real, DB-backed pages in **budp CI**,
replacing the `[section]` placeholder. Reads use the existing `src/brickpm/repository.ts`
(extended); writes use gated server actions requiring `brickpm` **edit** permission and
append to `bpm_audit_log`.

## Scope & recommendations

| Section | Content | Interaction |
|---|---|---|
| Sortiment | product table, search + category/status filter, row → detail card | read-only |
| Aktionen & Preorder | promotions table + Fortschritt (sold/targetUnits) | read-only |
| Marge & Sales-Ziele | live margin calculator per product | pure client compute |
| Goodies & Bundles | goodies table + Goodie-vs-Rabatt compare | read-only |
| Wettbewerb | competitor rows, own vs comp price + Abweichung % | read-only |
| Notifications | list + status/priority filter | **status change** (write + audit) |
| Schnittstellen | integration cards | **Sync simulieren** (updates last_sync + audit) |
| Admin & Export | JSON/CSV export + Audit-Log view | export (client), audit read |
| Demo-Skript | guided walkthrough | links to the real sections (see below) |

**Recommendation calls (ambiguity → chosen):**
- **Demo-Skript**: the original demo ran 4 scripted state machines that mutated fake state.
  Since Phase 3 provides the *real* interactions (notification status, sync sim, etc.), a
  re-implemented scripted engine adds little real value. The Demo section becomes a short
  **guided page** that explains the 4 example flows and deep-links to the relevant section
  (Notifications, Marge, Goodies, Wettbewerb). YAGNI over a duplicate mutation engine.
- **Writes gate on edit**: server actions call `requireAppAccess('brickpm', 'edit')`; the
  layout already gates view. All current users have edit (`Alle Nutzer`).
- **`note` field** (Phase-2 backlog): add optional `note` to `BpmNotification` + a
  `bpm_notifications.note` column, repopulate from the bundle. The Notifications section
  shows it.

Out of scope (Phase 4): the 4 new analytics pages; charts.

## Margin calculator (Marge section)

Pure functions in `src/brickpm/marge.ts` (unit-tested), driven by a product + inputs:

```
Deckungsbeitrag = Verkaufspreis - Einkaufskosten - GoodieKosten
Marge%          = Deckungsbeitrag / Verkaufspreis
MaxRabattpreis  = Einkaufskosten / (1 - Mindestmarge)
MaxRabatt€      = UVP - MaxRabattpreis
BenötigteStück  = ceil(Zielumsatz / effektiverVerkaufspreis)
```
Recommendation (first match): `m >= tMgn` → "Keine Maßnahme nötig"; `goodieCost < disc` →
"Goodie statt Rabatt empfohlen"; `m >= mMgn+0.05` → "Bundle statt Rabatt empfohlen";
`m >= mMgn+0.02` → "Moderater Rabatt möglich"; `m >= mMgn` → "Abverkaufsaktion empfehlen";
`m < mMgn` → "Rabatt gesperrt – Mindestmarge unterschritten". Inputs: product, discount
(% or €), goodie cost, target revenue.

## Data layer additions (`src/brickpm/repository.ts`)

- Reads: `listGoodies()`, `listCompetitors()`, `getProduct(id)`, `listAuditLog(limit)`.
- Writes (each appends to `bpm_audit_log` via a `writeAudit(actor, action, detail)` helper):
  - `setNotificationStatus(id, status)` — status ∈ {offen, in Prüfung, Aktion gestartet, erledigt, verworfen}.
  - `simulateIntegration(id)` — sets `last_sync` to now (server timestamp string).
- All existing DATE columns keep the `::text` cast pattern.

## Server actions & gating

- `src/app/brickpm/actions.ts` (`'use server'`): `changeNotificationStatus(id, status)` and
  `simulateSync(id)` — each `await requireAppAccess('brickpm','edit')` first, then the
  repository write, then `revalidatePath`. The actor is the current user's email.
- Export runs client-side (Blob download) from data already rendered; no server action.

## Pages (all under `src/app/brickpm/[section]/` replaced by real routes)

Each is a route segment: `src/app/brickpm/sortiment/page.tsx`, `.../aktionen/page.tsx`,
`.../marge/page.tsx`, `.../goodies/page.tsx`, `.../wettbewerb/page.tsx`,
`.../notifications/page.tsx`, `.../schnittstellen/page.tsx`, `.../admin/page.tsx`,
`.../demo/page.tsx`. The generic `[section]/page.tsx` placeholder is removed (all sidebar
links now resolve to real pages). Shared table/card styling reuses budp tokens; a small
`bpm_status_chip` helper renders status/priority chips.

## Testing

- Pure: `marge.ts` (formulas + recommendation thresholds); a `deviation(own, comp)` helper
  for Wettbewerb; goodie-vs-rabatt compare.
- Repository (DB integration): new reads return mapped rows; `setNotificationStatus` /
  `simulateIntegration` mutate + write an audit row.
- Actions: `requireAppAccess('brickpm','edit')` enforced (a view-only user is rejected) —
  unit-tested against the mocked access layer.
- Build + `tsc` clean; browser check deferred to final user verification.

## Files (high level)

- Modify: `db/schema.sql` (note column), `db/rls.sql` (n/a), `src/brickpm/types.ts`
  (`note`), `src/brickpm/seed-data.ts` + `scripts/seed-brickpm.ts` (note), `src/brickpm/repository.ts`.
- Create: `src/brickpm/marge.ts`, `src/brickpm/format.ts` (chips/helpers), `src/app/brickpm/actions.ts`,
  the 9 section pages, shared `src/components/BpmTable.tsx` if useful, and their tests.
- Remove: `src/app/brickpm/[section]/page.tsx` (replaced by real routes).

## Risks

- **Write gating**: server actions must gate on edit, not just view — covered by action tests.
- **Prod deploy**: additive `note` column + re-seed; `seed-brickpm` re-run (idempotent).
