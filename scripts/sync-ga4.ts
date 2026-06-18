import { Ga4Client } from '../src/connectors/ga4/client';
import { normalizeReport } from '../src/connectors/ga4/connector';
import { writeGa4Metrics } from '../src/connectors/ga4/write';
import { pool } from '../src/lib/db';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const propertyId = process.env.GA4_PROPERTY_ID;
  if (!propertyId || !process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    throw new Error('Missing GA4_PROPERTY_ID / GOOGLE_APPLICATION_CREDENTIALS in environment.');
  }
  const days = parseDays(process.argv);

  const client = Ga4Client.fromEnv(propertyId);
  console.log(`Fetching GA4 report (last ${days} days)…`);
  const report = await client.runReport(days);
  console.log(`Fetched ${report.rows?.length ?? 0} day rows.`);

  const data = normalizeReport(report);
  console.log(`Normalized → ${data.dailyMetrics.length} daily_metrics rows (source=ga4).`);

  await writeGa4Metrics(data);
  console.log('Wrote ga4 daily_metrics to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
