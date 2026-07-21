/**
 * Integration-test helper: wraps the pg Pool in a minimal SupabaseClient-shaped
 * object so that loadDataset(supabase) can verify real DB state without a live
 * PostgREST / Supabase instance.
 *
 * Only implements .from(table).select() — sufficient for loadDataset.
 */
import { pool } from '@/lib/db';

const TABLE_SQL: Record<string, string> = {
  daily_metrics: `SELECT date::text AS date, source, channel, metric_key AS "metricKey", value FROM daily_metrics`,
  orders: `SELECT source_id AS "orderId", customer_uid AS "customerId", date::text AS date, revenue, is_first_order AS "isFirstOrder" FROM orders`,
  customers: `SELECT uid AS "customerId", first_order_date::text AS "firstOrderDate", last_order_date::text AS "lastOrderDate", orders_count AS "ordersCount", total_revenue AS "totalRevenue" FROM customers`,
  ad_spend: `SELECT date::text AS date, platform, spend, impressions, clicks, conversions, conv_value AS "convValue", campaign_id AS "campaignId", campaign_name AS "campaignName" FROM ad_spend`,
  subscribers: `SELECT date::text AS date, source, signups, unsubscribes, nps_score AS "npsScore" FROM subscribers`,
};

export function pgSupabase() {
  return {
    from: (table: string) => ({
      select: async () => {
        const sql = TABLE_SQL[table];
        if (!sql) return { data: [], error: null };
        const res = await pool.query(sql);
        return { data: res.rows, error: null };
      },
    }),
    rpc: async () => ({ data: [], error: null }),
  } as any;
}
