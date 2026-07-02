import { MetaClient } from '../src/connectors/meta/client';
import { normalizeInsights } from '../src/connectors/meta/connector';
import { writeMetaAds } from '../src/connectors/meta/write';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';
import { isConnected, getOAuthAccessToken } from '../src/lib/oauth/token';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const cfg = await loadConnectorConfig('meta');
  const purchaseActionType = cfg.META_PURCHASE_ACTION_TYPE ?? 'purchase';
  const days = parseDays(process.argv);

  const accessToken = (await isConnected('meta'))
    ? await getOAuthAccessToken('meta')
    : cfg.META_ACCESS_TOKEN;
  const client = new MetaClient(accessToken, cfg.META_AD_ACCOUNT_ID);
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
