import type { SupabaseClient } from '@supabase/supabase-js';
import type { CanonicalDataset, DateRange } from '@/lib/types';

function unwrap<T>(res: { data: T[] | null; error: { message: string } | null }): T[] {
  if (res.error) throw new Error(res.error.message);
  return res.data ?? [];
}

export async function loadDataset(supabase: SupabaseClient): Promise<CanonicalDataset> {
  const [dm, ord, cust, ads, subs] = await Promise.all([
    supabase.from('daily_metrics').select('date, source, channel, metricKey:metric_key, value'),
    supabase.from('orders').select('orderId:source_id, customerId:customer_uid, date, revenue, isFirstOrder:is_first_order'),
    supabase.from('customers').select('customerId:uid, firstOrderDate:first_order_date, lastOrderDate:last_order_date, ordersCount:orders_count, totalRevenue:total_revenue'),
    supabase.from('ad_spend').select('date, platform, spend, impressions, clicks, conversions, convValue:conv_value'),
    supabase.from('subscribers').select('date, source, signups, unsubscribes, npsScore:nps_score'),
  ]);
  return {
    dailyMetrics: unwrap(dm) as CanonicalDataset['dailyMetrics'],
    orders: unwrap(ord) as CanonicalDataset['orders'],
    customers: unwrap(cust) as CanonicalDataset['customers'],
    adSpend: (unwrap(ads) as any[]).map((r) => ({
      ...r, impressions: Number(r.impressions), clicks: Number(r.clicks), conversions: Number(r.conversions),
    })) as CanonicalDataset['adSpend'],
    subscribers: unwrap(subs) as CanonicalDataset['subscribers'],
  };
}

export async function loadDailySeries(
  supabase: SupabaseClient, metricKey: string, range: DateRange,
): Promise<{ date: string; value: number }[]> {
  const { data, error } = await supabase.rpc('daily_series', {
    p_metric_key: metricKey, p_start: range.start, p_end: range.end,
  });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: { date: string; value: number }) => ({ date: r.date, value: Number(r.value) }));
}
