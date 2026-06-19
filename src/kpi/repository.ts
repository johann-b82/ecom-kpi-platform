import { pool } from '@/lib/db';
import type { CanonicalDataset, DateRange } from '@/lib/types';

export async function loadDataset(): Promise<CanonicalDataset> {
  const [dm, ord, cust, ads, subs] = await Promise.all([
    pool.query('SELECT date::text, source, channel, metric_key AS "metricKey", value FROM daily_metrics'),
    pool.query('SELECT order_id AS "orderId", customer_id AS "customerId", date::text, revenue, is_first_order AS "isFirstOrder" FROM orders'),
    pool.query('SELECT customer_id AS "customerId", first_order_date::text AS "firstOrderDate", last_order_date::text AS "lastOrderDate", orders_count AS "ordersCount", total_revenue AS "totalRevenue" FROM customers'),
    pool.query('SELECT date::text, platform, spend, impressions, clicks, conversions, conv_value AS "convValue" FROM ad_spend'),
    pool.query('SELECT date::text, source, signups, unsubscribes, nps_score AS "npsScore" FROM subscribers'),
  ]);
  return {
    dailyMetrics: dm.rows, orders: ord.rows, customers: cust.rows,
    adSpend: ads.rows.map((r) => ({ ...r, impressions: Number(r.impressions), clicks: Number(r.clicks), conversions: Number(r.conversions) })),
    subscribers: subs.rows,
  };
}

export async function loadDailySeries(
  metricKey: string, range: DateRange,
): Promise<{ date: string; value: number }[]> {
  const res = await pool.query(
    `SELECT date::text, sum(value) AS value FROM daily_metrics
     WHERE metric_key = $1 AND date BETWEEN $2 AND $3
     GROUP BY date ORDER BY date`,
    [metricKey, range.start, range.end],
  );
  return res.rows.map((r) => ({ date: r.date, value: Number(r.value) }));
}
