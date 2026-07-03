# Connector registry consolidation

**Date:** 2026-07-03
**Status:** Approved (design)

## Problem

The set of connectors is declared twice: `src/lib/connector-fields.ts`
(`CONNECTORS`, `CONNECTOR_LABELS`, `CONNECTOR_FIELDS`, `CONNECTOR_GROUPS` — the
credential/UI registry) and `src/lib/sync/runner.ts` (`SYNC_CONNECTORS`, a
hardcoded 8-entry `{key,label}` array). Adding or renaming a connector needs two
edits and they can drift (the GA4 label already differs:
`'Google Analytics (GA4)'` vs `'Google Analytics 4'`).

This is the "registry consolidation" half of the lumeapps `src/apps`+registry
alignment. The physical connector move (`src/connectors → src/apps`) is
explicitly **out of scope** (cosmetic churn, no functional gain).

## Change

Make `connector-fields.ts` the single source of truth and derive the runner's
list from it:

```ts
// src/lib/sync/runner.ts
import { CONNECTORS, CONNECTOR_LABELS, type Connector } from '@/lib/connector-fields';

/** Connectors the scheduler knows about; `key` matches `npm run sync:<key>`.
 *  Derived from the connector registry so the two never drift. */
export const SYNC_CONNECTORS: { key: Connector; label: string }[] =
  CONNECTORS.map((key) => ({ key, label: CONNECTOR_LABELS[key] }));
```

Delete the hardcoded array. Add a header comment to `connector-fields.ts`
marking it the canonical connector registry.

## Consequences

- `SYNC_CONNECTORS[].key` type tightens `string → Connector`; `runConnector(key:
  string)` and `SyncStateRow.connector: string` are unaffected (Connector ⊂ string).
- Two cosmetic deltas: the GA4 sync-status label unifies to
  `'Google Analytics 4'`; the sync-status list order follows registry order
  (`shopware, woocommerce, ga4, klaviyo, mailchimp, meta, tiktok, google`).
- Adding a connector to `CONNECTOR_FIELDS` now auto-registers it for sync.

## Untouched

`src/lib/apps.ts` (RBAC apps — a separate concept), `CONNECTOR_FIELDS`/`GROUPS`/
`LABELS`, the credential vault, all connector directories, the sync scripts.

## Testing

A `tests/lib/sync-runner.test.ts` case asserting `SYNC_CONNECTORS` keys equal
`CONNECTORS` and each label equals `CONNECTOR_LABELS[key]` — so the runner list
can never drift from the registry again. Existing runner tests stay green (no
test pins the old GA4 label or the old order).
