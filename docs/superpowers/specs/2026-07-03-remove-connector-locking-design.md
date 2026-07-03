# Remove connector mutual-exclusion locking

**Date:** 2026-07-03
**Status:** Approved (user request: "remove this locking"; scope decided autonomously — user AFK, see Decision)

## Problem

The Einstellungen page locks Shopware while WooCommerce is configured and Klaviyo
while Mailchimp is configured (banner, disabled fields, API 409). The user wants
this lock removed so any connector can be configured at any time.

## Decision

Remove the lock entirely — UI, API guard, and the shared `EXCLUSIVE_GROUPS`
config — without changing the sync/data layer.

Rationale for not source-scoping the shop syncs in the same change:
- `orders`/`customers` use single-column primary keys with no `source` column;
  proper coexistence needs a PK migration and KPI-semantics decisions — a
  separate project.
- The DB is a rebuildable cache: shop syncs truncate and re-import from the shop
  API each run. With both shops configured, the tables reflect whichever synced
  last — confusing KPIs, but never permanent data loss.
- Klaviyo/Mailchimp writes are already source-scoped (`DELETE … WHERE source =`),
  so they coexist structurally; worst case is a double-counted signup KPI while
  both are active.

## Changes

1. `src/lib/connector-fields.ts` — delete `EXCLUSIVE_GROUPS` and
   `exclusiveSiblings()`.
2. `src/components/CredentialsForm.tsx` — delete the lock banner, disabled
   inputs, and disabled Speichern state.
3. `src/app/api/credentials/route.ts` — delete the 409 sibling guard.
4. Tests — replace lock assertions with regression tests asserting a connector
   stays editable/saveable while its former sibling is configured.

## Out of scope (possible follow-up)

Source-scoping `orders`/`customers` (add `source` column, composite PKs,
delete-by-source writes) so both shops can sync in parallel with correct KPIs.
