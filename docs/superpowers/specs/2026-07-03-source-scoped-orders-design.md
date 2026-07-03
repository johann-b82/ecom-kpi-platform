# Source-scoped orders & customers

**Date:** 2026-07-03
**Status:** Approved (design)

## Problem

`orders` is keyed by single `order_id` and `customers` by `customer_id`, and shop
syncs TRUNCATE-replace both tables. So only one shop source can be active at a
time (last full sync wins) — the reason the Shopware↔WooCommerce mutual-exclusion
lock existed (removed in PR #50). Adopt lumeapps-platform's source-scoped shape so
sources coexist: composite key `(source, source_id)`, customers keyed by
`source:customer_id`, delete-by-source instead of TRUNCATE.

## Scope

`orders` + `customers` only. `daily_metrics`, `ad_spend`, `subscribers` already
carry a `source` column (the email/ads connectors are already source-scoped). The
`daily_series` RPC reads `daily_metrics` only — unchanged. Revenue KPIs come from
GA4 `daily_metrics`; `orders`/`customers` feed **only** the Care/retention KPIs
(`src/kpi/care.ts`).

Cross-source customer unification (same email across shops → one customer) is
**out of scope** (YAGNI); customers are keyed per source.

## Schema (`db/schema.sql`)

```sql
CREATE TABLE IF NOT EXISTS customers (
  uid              TEXT PRIMARY KEY,   -- 'source:customer_id'
  source           TEXT NOT NULL,
  first_order_date DATE NOT NULL,
  last_order_date  DATE NOT NULL,
  orders_count     INTEGER NOT NULL,
  total_revenue    DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  source        TEXT NOT NULL,
  source_id     TEXT NOT NULL,         -- the shop's order id
  customer_uid  TEXT NOT NULL,         -- 'source:customer_id'
  date          DATE NOT NULL,
  revenue       DOUBLE PRECISION NOT NULL,
  is_first_order BOOLEAN NOT NULL,
  PRIMARY KEY (source, source_id)
);
CREATE INDEX IF NOT EXISTS orders_date_idx ON orders (date);
CREATE INDEX IF NOT EXISTS orders_customer_idx ON orders (customer_uid);
```

## Migration (drop + recreate + resync)

`orders`/`customers` are a rebuildable cache. Prepend to the orders/customers
section of `schema.sql` an idempotent guard that fires only on the old shape:

```sql
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'orders' AND column_name = 'order_id') THEN
    DROP TABLE IF EXISTS orders CASCADE;
    DROP TABLE IF EXISTS customers CASCADE;
    -- Force a full WooCommerce backfill; else the delta path runs against empty tables.
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'app_settings') THEN
      DELETE FROM app_settings
       WHERE key IN ('woocommerce_orders_synced_at', 'woocommerce_orders_full_synced_at');
    END IF;
  END IF;
END $$;
```

Idempotent: once migrated (no `order_id` column) it is a no-op; on a fresh DB it
is a no-op and the `CREATE TABLE IF NOT EXISTS` below builds the new shape.
Post-deploy, a WooCommerce full backfill (watermarks cleared → `shouldFullResync`
true) repopulates. Brief window where Care KPIs are empty until the resync.

## Domain types (`src/lib/types.ts`)

Field names stay stable so the KPI engine is untouched; **values** become
source-scoped. `Order.customerId` and `Customer.customerId` carry the
`source:customer_id` uid; `Order.orderId` carries `source:source_id`.

## Write layer — one shared source-scoped module

Extract `src/lib/orders-store.ts` used by **both** shop connectors (removes the
duplicated `writeOrdersAndCustomers`):

- `fullReplace(source: string, orders: Order[]): Promise<void>` — `DELETE FROM
  orders WHERE source=$1`, insert, then `deriveAggregates` (which rebuilds the
  whole `customers` table — no separate customers delete needed). Keeps the
  "abort on 0 orders" guard (checked before the delete, so a source's rows are
  never left empty on an API hiccup).
- `applyDelta(source, upserts: Order[], deleteIds: string[]): Promise<void>` —
  upsert on `(source, source_id)`, `DELETE … WHERE source=$1 AND source_id =
  ANY($2)`, then `deriveAggregates`.
- `deriveAggregates(client)` — SQL over the whole `orders` table:
  - `is_first_order`: `ROW_NUMBER() OVER (PARTITION BY customer_uid ORDER BY date,
    source_id) = 1`.
  - rebuild `customers`: `DELETE FROM customers` + `INSERT … SELECT customer_uid,
    source, MIN(date), MAX(date), COUNT(*), ROUND(SUM(revenue),2) FROM orders
    GROUP BY customer_uid, source`.

Insert maps each `Order`: `source_id = orderId`, `customer_uid = source || ':' ||
customerId`.

Both connectors call these; `applyDelta` is used only by WooCommerce (incremental).
Shopware moves from TRUNCATE to `fullReplace('shopware', …)`.

## Connector changes

- **WooCommerce** (`src/connectors/woocommerce/write.ts`) — delete its local
  `fullReplace`/`applyDelta`; re-export or call the shared module with
  `source='woocommerce'`. `normalizeDelta` unchanged (produces raw ids;
  source stamped at write). `scripts/sync-woocommerce.ts` passes `'woocommerce'`.
- **Shopware** (`src/connectors/shopware/{connector,write}.ts`) — `normalizeOrders`
  → produce `Order[]` (drop JS customer/first-order aggregation; SQL derives it).
  Script calls `fullReplace('shopware', orders)`. `scripts/sync-shopware.ts`
  updated.

## KPI read (`src/kpi/repository.ts`)

`loadDataset` maps new columns to stable domain fields:
- orders: `source_id`→`orderId` (as `source||':'||source_id` for global
  uniqueness), `customer_uid`→`customerId`, `date`, `revenue`,
  `is_first_order`→`isFirstOrder`.
- customers: `uid`→`customerId`, plus the aggregate fields.

`src/kpi/care.ts` is **unchanged** (matches orders↔customers by `customerId`,
whatever the value). Update the integration test helper
`tests/helpers/pg-supabase.ts` `TABLE_SQL` for the new columns.

## RLS (`db/rls.sql`)

`orders`/`customers` keep `GRANT SELECT TO authenticated` + `USING (true)`
read-only policies (recreated after the drop). No predicate change.

## Error handling

- `fullReplace` keeps the 0-orders guard (never delete-then-leave-empty for a
  source).
- Delta/full run in a transaction, rollback on error.
- Migration guard is idempotent and only fires on the legacy shape.

## Testing

- `orders-store` (integration, real PG): `fullReplace('woocommerce', …)` then
  `fullReplace('shopware', …)` — both sources coexist, neither clobbers the other;
  customers/`is_first_order` correct per source-scoped uid; `applyDelta` upsert/
  delete scoped to its source only; 0-orders guard.
- WooCommerce write/normalize tests updated for source-scoped keys.
- Shopware write test: `fullReplace('shopware', …)` populates + derives.
- `care.ts` KPI tests still green (values now source-scoped uids).
- Migration: seed an old-shape `orders` (with `order_id`) + a woo watermark, run
  `migrate`, assert tables recreated in new shape and watermarks cleared.
- Live (VPS): deploy → full backfill repopulates ~12.9k woo orders stamped
  `source='woocommerce'`; Care KPIs return.

## Out of scope

Cross-source customer unification; Shopware incremental sync (stays full-replace,
now delete-by-source); the other two lumeapps-alignment items (in-repo deploy,
src/apps registry).
