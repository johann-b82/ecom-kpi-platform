import { KlaviyoClient } from '../src/connectors/klaviyo/client';
import { normalizeAggregates } from '../src/connectors/klaviyo/connector';
import { writeKlaviyoSubscribers } from '../src/connectors/klaviyo/write';
import { pool } from '../src/lib/db';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const apiKey = process.env.KLAVIYO_API_KEY;
  if (!apiKey) {
    throw new Error('Missing KLAVIYO_API_KEY in environment.');
  }
  const signupMetric = process.env.KLAVIYO_SIGNUP_METRIC ?? 'Subscribed to List';
  const unsubMetric = process.env.KLAVIYO_UNSUB_METRIC ?? 'Unsubscribed';
  const days = parseDays(process.argv);

  const client = new KlaviyoClient(apiKey);
  console.log('Resolving Klaviyo metric IDs…');
  const signupId = await client.resolveMetricId(signupMetric);
  const unsubId = await client.resolveMetricId(unsubMetric);

  console.log(`Fetching aggregates (last ${days} days)…`);
  const signupAgg = await client.metricAggregate(signupId, days);
  const unsubAgg = await client.metricAggregate(unsubId, days);

  const data = normalizeAggregates(signupAgg, unsubAgg);
  console.log(`Normalized → ${data.subscribers.length} subscriber day-rows (source=klaviyo).`);

  await writeKlaviyoSubscribers(data);
  console.log('Wrote klaviyo subscribers to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
