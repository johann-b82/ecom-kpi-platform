import { GoogleAdsClient } from '../src/connectors/google/client';
import { normalizeRows } from '../src/connectors/google/connector';
import { writeGoogleAds } from '../src/connectors/google/write';
import { pool } from '../src/lib/db';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN;
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  const customerId = process.env.GOOGLE_ADS_CUSTOMER_ID;
  if (!developerToken || !clientId || !clientSecret || !refreshToken || !customerId) {
    throw new Error('Missing GOOGLE_ADS_DEVELOPER_TOKEN / GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET / GOOGLE_ADS_REFRESH_TOKEN / GOOGLE_ADS_CUSTOMER_ID in environment.');
  }
  const loginCustomerId = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID;
  const days = parseDays(process.argv);

  const client = new GoogleAdsClient({ developerToken, clientId, clientSecret, refreshToken, customerId, loginCustomerId });
  console.log(`Fetching Google Ads report (last ${days} days)…`);
  const rows = await client.search(days);
  console.log(`Fetched ${rows.length} day rows.`);

  const data = normalizeRows(rows);
  console.log(`Normalized → ${data.adSpend.length} ad_spend + ${data.dailyMetrics.length} video_views rows (google_ads).`);

  await writeGoogleAds(data);
  console.log('Wrote google_ads ad_spend + video_views to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
