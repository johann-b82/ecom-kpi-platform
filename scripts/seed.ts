import { pool } from '../src/lib/db';
import { generateSeedData } from '../src/connectors/seed/generator';
import { addDays } from '../src/lib/dates';

async function main() {
  // 180 Tage bis „heute" (Argument optional: YYYY-MM-DD als Enddatum).
  const end = process.argv[2] ?? new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -179), end };
  const data = generateSeedData(range);

  await pool.query('TRUNCATE daily_metrics, orders, customers, ad_spend, subscribers');

  for (const m of data.dailyMetrics) {
    await pool.query(
      'INSERT INTO daily_metrics(date, source, channel, metric_key, value) VALUES($1,$2,$3,$4,$5)',
      [m.date, m.source, m.channel, m.metricKey, m.value],
    );
  }
  for (const c of data.customers) {
    await pool.query(
      'INSERT INTO customers(uid, source, first_order_date, last_order_date, orders_count, total_revenue) VALUES($1,$2,$3,$4,$5,$6)',
      [`seed:${c.customerId}`, 'seed', c.firstOrderDate, c.lastOrderDate, c.ordersCount, c.totalRevenue],
    );
  }
  for (const o of data.orders) {
    await pool.query(
      'INSERT INTO orders(source, source_id, customer_uid, date, revenue, is_first_order) VALUES($1,$2,$3,$4,$5,$6)',
      ['seed', o.orderId, `seed:${o.customerId}`, o.date, o.revenue, o.isFirstOrder],
    );
  }
  for (const a of data.adSpend) {
    await pool.query(
      'INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [a.date, a.platform, a.spend, a.impressions, a.clicks, a.conversions, a.convValue],
    );
  }
  for (const s of data.subscribers) {
    await pool.query(
      'INSERT INTO subscribers(date, source, signups, unsubscribes, nps_score) VALUES($1,$2,$3,$4,$5)',
      [s.date, s.source, s.signups, s.unsubscribes, s.npsScore],
    );
  }
  console.log(`Seeded ${data.orders.length} orders, ${data.dailyMetrics.length} daily metrics.`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
