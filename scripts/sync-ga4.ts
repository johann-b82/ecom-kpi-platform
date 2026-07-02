import { Ga4Client } from '../src/connectors/ga4/client';
import { normalizeReport } from '../src/connectors/ga4/connector';
import { writeGa4Metrics } from '../src/connectors/ga4/write';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';
import { isConnected, getOAuthAccessToken } from '../src/lib/oauth/token';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const cfg = await loadConnectorConfig('ga4');
  const days = parseDays(process.argv);

  const client = (await isConnected('google'))
    ? new Ga4Client(cfg.GA4_PROPERTY_ID, () => getOAuthAccessToken('google'))
    : Ga4Client.fromCredentials(cfg.GA4_PROPERTY_ID, JSON.parse(cfg.GA4_SERVICE_ACCOUNT_JSON));

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
