import { MetaClient } from '../src/connectors/meta/client';
import { normalizeInsights } from '../src/connectors/meta/connector';
import { writeMetaAds } from '../src/connectors/meta/write';
import { pool } from '../src/lib/db';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const accessToken = process.env.META_ACCESS_TOKEN;
  const adAccountId = process.env.META_AD_ACCOUNT_ID;
  if (!accessToken || !adAccountId) {
    throw new Error('Missing META_ACCESS_TOKEN / META_AD_ACCOUNT_ID in environment.');
  }
  const purchaseActionType = process.env.META_PURCHASE_ACTION_TYPE ?? 'purchase';
  const days = parseDays(process.argv);

  const client = new MetaClient(accessToken, adAccountId);
  console.log(`Fetching Meta insights (last ${days} days)…`);
  const rows = await client.fetchInsights(days);
  console.log(`Fetched ${rows.length} day rows.`);

  const data = normalizeInsights(rows, { purchaseActionType });
  console.log(`Normalized → ${data.adSpend.length} ad_spend + ${data.dailyMetrics.length} video_views rows (meta_ads).`);

  await writeMetaAds(data);
  console.log('Wrote meta_ads ad_spend + video_views to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
