# Incremental WooCommerce order sync

**Date:** 2026-07-03
**Status:** Approved (design)

## Problem

The WooCommerce sync TRUNCATE-replaces `orders`/`customers` every run. The live
store has ~13k orders / 133 pages; a full resync takes ~6–9 min and refetches
everything hourly. Goal: fetch only orders modified since the last successful
sync and apply a delta, cutting steady-state syncs to seconds while keeping the
data identical to a full replace.

## Invariant to preserve

The KPI layer (`src/kpi/repository.ts`) reads the entire `orders` and
`customers` tables and computes metrics in memory. So after any sync:

- `orders` = exactly the current revenue orders (status `completed`/`processing`).
- `customers` = aggregates derived from `orders`.
- `orders.is_first_order` = earliest order per customer (exactly one true).

## Watermarks (`app_settings`)

- `woocommerce_orders_synced_at` (UTC ISO) — delta boundary. Null → full backfill.
- `woocommerce_orders_full_synced_at` (UTC ISO) — last full resync. Null or age
  ≥ 20h → this run does a full resync (self-heals hard-deleted orders ~once/day;
  cron-agnostic, no schedule branch needed).

Each run captures `startedAt` (UTC) **before** fetching. On success:
- full run: set both watermarks = `startedAt`.
- delta run: set `woocommerce_orders_synced_at` = `startedAt`.

Start-time (not end-time) watermark guarantees no gap: anything modified during a
run is re-fetched next run, and upserts are idempotent. Delta fetch uses
`modified_after = synced_at − 60s` (clock-skew insurance).

## Fetch

`fetchAllOrders(modifiedAfter?: Date)` — the existing paginated `_fields` call.
When `modifiedAfter` is given, add `modified_after=<ISO>&dates_are_gmt=true`.
Always `status=any`, so status changes into **and out of** the revenue set are
returned.

## Apply the delta

Partition the fetched orders:
- revenue status (`completed`/`processing`) → **UPSERT** into `orders`
  (`ON CONFLICT (order_id) DO UPDATE` customer_id, date, revenue).
- any other status → **DELETE** from `orders` by `order_id` (removes orders that
  left the revenue set: refunded/cancelled/trash/…).

## Recompute derived data (SQL, shared by both paths)

After applying rows, within one transaction:
1. `is_first_order`: `UPDATE orders` using
   `ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY date, order_id) = 1`.
2. Rebuild `customers`: `DELETE FROM customers` + `INSERT … SELECT … GROUP BY
   customer_id` from `orders` (first/last order date, count, sum(revenue)).

Cheap over ~12k local rows. This replaces the JS aggregation for the full path
too, so aggregates have one implementation.

## Component changes

- `connectors/woocommerce/connector.ts` — `normalizeOrders` → returns
  `{ upserts: Order[]; deleteIds: string[] }`. Drops JS customer/first-order
  aggregation (moves to SQL). `is_first_order` on upserts is a placeholder
  (recomputed in SQL).
- `connectors/woocommerce/client.ts` — `fetchAllOrders(modifiedAfter?)`.
- `connectors/woocommerce/write.ts` —
  - `deriveAggregates(client)` — shared SQL (first-order + customers rebuild).
  - `fullReplace(client, upserts)` — TRUNCATE orders+customers, insert, derive.
    Keeps the "abort on 0 orders" guard.
  - `applyDelta(client, upserts, deleteIds)` — upsert + delete + derive. 0
    modified orders = no-op (still advances watermark).
- `lib/settings.ts` (or a small `lib/sync/watermark.ts`) — get/set the two
  watermark keys.
- `scripts/sync-woocommerce.ts` — read watermarks, decide full vs delta, fetch,
  apply, set watermarks on success. Log which path ran and counts.

## Error handling

- Watermarks are set only on success (script throws → runner records `fehler`,
  watermarks unchanged → next run retries the same window).
- Full path keeps the 0-orders guard (never truncate to empty).
- Delta transaction rolls back on any error.

## Out of scope

- Shopware (still full-replace).
- A manual force-full UI button (nightly auto-resync covers hard-deletes).

## Testing

Unit:
- partition: revenue → upserts, non-revenue → deleteIds.
- `deriveAggregates`: is_first_order (earliest per customer), customer
  aggregates (count/sum/first/last) — against a seeded orders table.
- `applyDelta`: upsert updates an existing order; delete removes one; re-run is
  idempotent.
- path selection: null watermark → full; set → delta with `modified_after`;
  full_synced_at ≥ 20h → full.

Live (VPS): a delta run after a full backfill touches only changed orders and
leaves counts/KPIs correct.
