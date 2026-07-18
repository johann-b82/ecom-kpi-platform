import { pool } from '@/lib/db';
import { CONSUMPTION_WINDOW_DAYS } from './forecast';
import type { SeriesPoint, VariantForecastInput, CategoryRollupRow, CategoryVariantRow } from './types';
import type { DateRange } from '@/lib/types';

const SALES_FILTER = `o.status NOT IN ('angebot','storniert')`;

export async function stockSeries(variantId: string, days: number): Promise<SeriesPoint[]> {
  const r = await pool.query(
    `SELECT snapshot_date::text AS date, SUM(quantity_on_hand)::int AS value
       FROM stock_snapshots
      WHERE variant_id = $1 AND snapshot_date >= CURRENT_DATE - $2::int
      GROUP BY snapshot_date ORDER BY snapshot_date`, [variantId, days]);
  return r.rows.map((x: { date: string; value: number }) => ({ date: x.date, value: Number(x.value) }));
}

// Übersichts-Kurve: Gesamtbestand (Summe on_hand) je Snapshot-Tag im Bereich.
export async function stockTotalSeries(range: DateRange): Promise<SeriesPoint[]> {
  const r = await pool.query(
    `SELECT snapshot_date::text AS date, SUM(quantity_on_hand)::int AS value
       FROM stock_snapshots
      WHERE snapshot_date BETWEEN $1 AND $2
      GROUP BY snapshot_date ORDER BY snapshot_date`, [range.start, range.end]);
  return r.rows.map((x: { date: string; value: number }) => ({ date: x.date, value: Number(x.value) }));
}

export async function salesSeries(variantId: string, days: number): Promise<SeriesPoint[]> {
  const r = await pool.query(
    `SELECT COALESCE(o.placed_at, o.created_at)::date::text AS date, SUM(l.quantity)::int AS value
       FROM sales_order_lines l
       JOIN sales_orders o ON o.id = l.order_id
      WHERE l.variant_id = $1
        AND COALESCE(o.placed_at, o.created_at)::date >= CURRENT_DATE - $2::int
        AND ${SALES_FILTER}
      GROUP BY date ORDER BY date`, [variantId, days]);
  return r.rows.map((x: { date: string; value: number }) => ({ date: x.date, value: Number(x.value) }));
}

export async function stockSeriesByCategory(category: string, days: number): Promise<SeriesPoint[]> {
  const r = await pool.query(
    `SELECT s.snapshot_date::text AS date, SUM(s.quantity_on_hand)::int AS value
       FROM stock_snapshots s
       JOIN product_variants v ON v.id = s.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE COALESCE(p.category, 'Ohne Kategorie') = $1 AND s.snapshot_date >= CURRENT_DATE - $2::int
      GROUP BY s.snapshot_date ORDER BY s.snapshot_date`, [category, days]);
  return r.rows.map((x: { date: string; value: number }) => ({ date: x.date, value: Number(x.value) }));
}

export async function salesSeriesByCategory(category: string, days: number): Promise<SeriesPoint[]> {
  const r = await pool.query(
    `SELECT COALESCE(o.placed_at, o.created_at)::date::text AS date, SUM(l.quantity)::int AS value
       FROM sales_order_lines l
       JOIN sales_orders o ON o.id = l.order_id
       JOIN product_variants v ON v.id = l.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE COALESCE(p.category, 'Ohne Kategorie') = $1
        AND COALESCE(o.placed_at, o.created_at)::date >= CURRENT_DATE - $2::int
        AND ${SALES_FILTER}
      GROUP BY date ORDER BY date`, [category, days]);
  return r.rows.map((x: { date: string; value: number }) => ({ date: x.date, value: Number(x.value) }));
}

export async function getVariantForecastInput(variantId: string): Promise<VariantForecastInput | null> {
  const head = await pool.query(
    `SELECT v.sku, p.name AS product_name, v.reorder_point,
            COALESCE((SELECT SUM(quantity_on_hand) FROM stock_levels WHERE variant_id = v.id), 0)::int AS on_hand
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.id = $1`, [variantId]);
  if (head.rows.length === 0) return null;
  const units = await pool.query(
    `SELECT COALESCE(SUM(l.quantity), 0)::int AS units
       FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id
      WHERE l.variant_id = $1
        AND COALESCE(o.placed_at, o.created_at)::date >= CURRENT_DATE - $2::int
        AND ${SALES_FILTER}`, [variantId, CONSUMPTION_WINDOW_DAYS]);
  const h = head.rows[0];
  return {
    variantId, sku: h.sku, productName: h.product_name,
    onHand: Number(h.on_hand), reorderPoint: Number(h.reorder_point ?? 0),
    unitsInWindow: Number(units.rows[0].units),
  };
}

export async function categoryRollup(): Promise<CategoryRollupRow[]> {
  const r = await pool.query(
    `WITH sold AS (
       SELECT l.variant_id, SUM(l.quantity)::int AS units
         FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id
        WHERE COALESCE(o.placed_at, o.created_at)::date >= CURRENT_DATE - 90
          AND o.status NOT IN ('angebot','storniert')
        GROUP BY l.variant_id
     ),
     stock AS (
       SELECT variant_id, SUM(quantity_on_hand)::int AS on_hand
         FROM stock_levels GROUP BY variant_id
     )
     SELECT COALESCE(p.category, 'Ohne Kategorie') AS category,
            COUNT(*)::int AS variant_count,
            COALESCE(SUM(st.on_hand), 0)::int AS gesamtbestand,
            COUNT(*) FILTER (WHERE v.reorder_point > 0
                              AND COALESCE(st.on_hand, 0) < v.reorder_point)::int AS unter_meldebestand,
            COUNT(*) FILTER (WHERE COALESCE(sd.units, 0) > 0
                              AND COALESCE(st.on_hand, 0) < sd.units)::int AS kritisch
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN stock st ON st.variant_id = v.id
       LEFT JOIN sold sd ON sd.variant_id = v.id
      GROUP BY COALESCE(p.category, 'Ohne Kategorie')
      ORDER BY category`);
  return r.rows.map((x: {
    category: string; variant_count: number; gesamtbestand: number;
    unter_meldebestand: number; kritisch: number;
  }) => ({
    category: x.category, variantCount: Number(x.variant_count),
    gesamtbestand: Number(x.gesamtbestand),
    anzahlUnterMeldebestand: Number(x.unter_meldebestand),
    anzahlKritisch: Number(x.kritisch),
  }));
}

export async function listCategoryVariants(category: string): Promise<CategoryVariantRow[]> {
  const r = await pool.query(
    `SELECT v.id AS variant_id, v.sku, p.name AS product_name, v.reorder_point,
            COALESCE((SELECT SUM(quantity_on_hand) FROM stock_levels WHERE variant_id = v.id), 0)::int AS on_hand
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE COALESCE(p.category, 'Ohne Kategorie') = $1
      ORDER BY p.name, v.sku`, [category]);
  return r.rows.map((x: {
    variant_id: string; sku: string; product_name: string; reorder_point: number; on_hand: number;
  }) => ({
    variantId: x.variant_id, sku: x.sku, productName: x.product_name,
    onHand: Number(x.on_hand), reorderPoint: Number(x.reorder_point ?? 0),
    belowReorder: Number(x.reorder_point ?? 0) > 0 && Number(x.on_hand) < Number(x.reorder_point),
  }));
}

export async function dashboardKpis(): Promise<{
  gesamtbestand: number; unterMeldebestand: number; kritisch: number;
}> {
  const rows = await categoryRollup();
  return rows.reduce((a, r) => ({
    gesamtbestand: a.gesamtbestand + r.gesamtbestand,
    unterMeldebestand: a.unterMeldebestand + r.anzahlUnterMeldebestand,
    kritisch: a.kritisch + r.anzahlKritisch,
  }), { gesamtbestand: 0, unterMeldebestand: 0, kritisch: 0 });
}
