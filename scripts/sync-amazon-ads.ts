import { AmazonAdsClient } from '../src/connectors/amazon-ads/client';
import { normalizeReport } from '../src/connectors/amazon-ads/connector';
import { writeAmazonAds } from '../src/connectors/amazon-ads/write';
import { pool } from '../src/lib/db';
import { getHubCredentials } from '../src/lib/hub';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 90;
}

async function main() {
  const days = parseDays(process.argv);
  const creds = await getHubCredentials('amazon_ads');
  const profileId = creds.accountConfig.profileId;
  if (!creds.clientId || !profileId) {
    throw new Error('Hub lieferte keine clientId/profileId für amazon_ads — Verbindung im Hub prüfen.');
  }
  const client = new AmazonAdsClient(creds.accessToken, creds.clientId, profileId);
  console.log(`Fetching Amazon Ads report (last ${days} days)…`);
  const rows = await client.fetchDailyReport(days);
  console.log(`Fetched ${rows.length} campaign-day rows.`);

  const data = normalizeReport(rows);
  console.log(`Normalized → ${data.adSpend.length} ad_spend rows (amazon_ads).`);

  await writeAmazonAds(data);
  console.log('Wrote amazon_ads ad_spend to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
