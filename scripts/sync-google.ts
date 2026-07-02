import { GoogleAdsClient } from '../src/connectors/google/client';
import { normalizeRows } from '../src/connectors/google/connector';
import { writeGoogleAds } from '../src/connectors/google/write';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';
import { isConnected, getOAuthAccessToken } from '../src/lib/oauth/token';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const cfg = await loadConnectorConfig('google');
  const days = parseDays(process.argv);
  const oauth = await isConnected('google');
  const client = new GoogleAdsClient(
    {
      developerToken: cfg.GOOGLE_ADS_DEVELOPER_TOKEN,
      clientId: cfg.GOOGLE_ADS_CLIENT_ID,
      clientSecret: cfg.GOOGLE_ADS_CLIENT_SECRET,
      refreshToken: cfg.GOOGLE_ADS_REFRESH_TOKEN ?? '',
      customerId: cfg.GOOGLE_ADS_CUSTOMER_ID,
      loginCustomerId: cfg.GOOGLE_ADS_LOGIN_CUSTOMER_ID,
    },
    fetch,
    oauth ? () => getOAuthAccessToken('google') : undefined,
  );

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
