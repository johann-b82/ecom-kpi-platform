# Connector Registry Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Derive the sync runner's connector list from the `connector-fields.ts` registry so it can't drift.

**Architecture:** Replace the hardcoded `SYNC_CONNECTORS` array in `src/lib/sync/runner.ts` with `CONNECTORS.map((key) => ({ key, label: CONNECTOR_LABELS[key] }))`, imported from the registry. A test locks the two together.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- `connector-fields.ts` is the single source of truth (`CONNECTORS`, `CONNECTOR_LABELS`).
- `apps.ts` (RBAC), `CONNECTOR_FIELDS`/`GROUPS`, credential vault, connector dirs, sync scripts: untouched.
- Connectors stay in `src/connectors/` (no physical move).

---

### Task 1: Derive SYNC_CONNECTORS from the registry

**Files:**
- Modify: `src/lib/sync/runner.ts` (imports + the `SYNC_CONNECTORS` export)
- Modify: `src/lib/connector-fields.ts` (header comment only)
- Test: `tests/lib/sync-runner.test.ts` (add one case)

**Interfaces:**
- Consumes: `CONNECTORS: Connector[]`, `CONNECTOR_LABELS: Record<Connector,string>` from `@/lib/connector-fields`.
- Produces: `SYNC_CONNECTORS: { key: Connector; label: string }[]` — one entry per registry connector, label from `CONNECTOR_LABELS`.

- [ ] **Step 1: Write the failing test** — append to `tests/lib/sync-runner.test.ts`:

```ts
import { SYNC_CONNECTORS } from '@/lib/sync/runner';
import { CONNECTORS, CONNECTOR_LABELS } from '@/lib/connector-fields';

describe('SYNC_CONNECTORS is derived from the connector registry', () => {
  it('covers exactly CONNECTORS with labels from CONNECTOR_LABELS', () => {
    expect(SYNC_CONNECTORS.map((c) => c.key)).toEqual(CONNECTORS);
    for (const { key, label } of SYNC_CONNECTORS) {
      expect(label).toBe(CONNECTOR_LABELS[key]);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres npx vitest run tests/lib/sync-runner.test.ts`
Expected: FAIL — the hardcoded array's order (`ga4, google, meta, …`) ≠ `CONNECTORS` order, and the GA4 label differs (`'Google Analytics (GA4)'` ≠ `'Google Analytics 4'`).

- [ ] **Step 3: Implement** — in `src/lib/sync/runner.ts`, add the import (top of file, after the existing imports) and replace the hardcoded `SYNC_CONNECTORS` block:

```ts
import { CONNECTORS, CONNECTOR_LABELS, type Connector } from '@/lib/connector-fields';
```

```ts
/** Connectors the scheduler knows about; `key` matches `npm run sync:<key>`.
 *  Derived from the connector registry (connector-fields.ts) so the two never drift. */
export const SYNC_CONNECTORS: { key: Connector; label: string }[] =
  CONNECTORS.map((key) => ({ key, label: CONNECTOR_LABELS[key] }));
```

(Delete the old 8-entry hardcoded array.)

Then add a header comment at the top of `src/lib/connector-fields.ts`:

```ts
// Canonical connector registry: the single source of truth for every connector's
// credential fields, label, and UI group. The sync runner derives its list from here.
```

- [ ] **Step 4: Run tests + typecheck**

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres bash -c 'npx vitest run tests/lib/sync-runner.test.ts && npx tsc --noEmit && echo tsc-clean'`
Expected: tests PASS, `tsc-clean`.

- [ ] **Step 5: Full suite** (nothing else should break)

Run: `DATABASE_URL=postgres://postgres:postgres@localhost:5544/postgres bash -c 'npm run migrate && npx vitest run'`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/sync/runner.ts src/lib/connector-fields.ts tests/lib/sync-runner.test.ts
git commit -m "refactor: derive sync runner connector list from the connector registry"
```
