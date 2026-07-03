# BrickPM analytics pages (Phase 4) — Design

**Date:** 2026-07-03
**Status:** Approved (autonomous completion; recommendations chosen)
**Branch:** `brickpm-analytics`

## Context

Final phase. Adds the 4 new analytics pages that the DB makes possible, using **Tremor**
charts (already a budp dependency, rendered directly from server components as in the KPI
dashboard). Two need a **time dimension**, so we add two history tables seeded with
**deterministic synthetic history** (the demo had no real history).

## New pages & sidebar

A new sidebar group "Analytics" with 4 entries (added to `BpmSidebar`):
`analytics`, `preis-historie`, `lager`, `monitoring`.

1. **Analytics & Reporting** (`/brickpm/analytics`) — aggregations of *current* data (no new
   table): Aktions-Zielumsatz nach Kategorie (BarChart), Ø Marge nach Serie (BarChart),
   Sell-through je Aktion (BarList/Bar), Status-Verteilung der Produkte (DonutChart).
2. **Preis- & Margen-Historie** (`/brickpm/preis-historie`) — product `<select>` +
   LineChart of price and margin over time from `bpm_price_history`.
3. **Lager & Nachbestellung** (`/brickpm/lager`) — reorder table (products with
   `stock < minStock`, suggested reorder = `2*minStock - stock`) + BarChart Bestand vs.
   Mindestbestand per product (current data, no new table).
4. **Wettbewerbs-Monitoring** (`/brickpm/monitoring`) — LineChart eigener vs. Wettbewerbs-
   preis über Zeit (per product) from `bpm_competitor_prices` + Abweichungs-Alerts (current
   deviation with |dev| ≥ 5%).

## New tables (history) + synthetic seed

```sql
CREATE TABLE IF NOT EXISTS bpm_price_history (
  product_id TEXT NOT NULL, date DATE NOT NULL, price DOUBLE PRECISION, cost DOUBLE PRECISION,
  PRIMARY KEY (product_id, date)
);
CREATE TABLE IF NOT EXISTS bpm_competitor_prices (
  product_id TEXT NOT NULL, competitor TEXT NOT NULL, date DATE NOT NULL,
  own_price DOUBLE PRECISION, comp_price DOUBLE PRECISION,
  PRIMARY KEY (product_id, competitor, date)
);
```
RLS: enabled, no public policy (server-only, like the other `bpm_` tables).

**Deterministic synthetic history** (`src/brickpm/history.ts`, pure): for each product,
8 monthly points ending at the current values, drifting the price/cost by a small
deterministic factor derived from the month index + product id hash (NO `Math.random`, so
tests/seed are reproducible). Competitor prices likewise from the current `bpm_competitors`
rows. `scripts/seed-brickpm.ts` inserts them (idempotent upsert on the PKs).

## Data layer

`src/brickpm/repository.ts`: `listPriceHistory(productId?): Promise<PricePoint[]>` (date
`::text`), `listCompetitorPrices(): Promise<CompPoint[]>`. Pure aggregation helpers in
`src/brickpm/analytics.ts` (revenue-by-category, margin-by-series, sell-through,
status-distribution, reorder-list, deviation-alerts) — unit-tested.

## Testing

- Pure: `history.ts` (deterministic — same input → same output, correct point count/last
  point = current), `analytics.ts` aggregations.
- Repository (DB integration): history reads return seeded rows.
- RLS: the two new tables deny `authenticated`.
- Build + `tsc` clean; final user verification in the browser.

## Files
- Modify: `db/schema.sql`, `db/rls.sql`, `tests/db/rls.test.ts`, `scripts/seed-brickpm.ts`,
  `src/brickpm/repository.ts`, `src/components/BpmSidebar.tsx`.
- Create: `src/brickpm/history.ts`, `src/brickpm/analytics.ts`, the 4 pages + any small
  client chart wrappers, and their tests.

## Deploy
Additive tables + idempotent re-seed. After `migrate`: `seed-groups` + `seed-brickpm`.
