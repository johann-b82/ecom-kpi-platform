import { TikTokClient } from '../src/connectors/tiktok/client';
import { normalizeReport } from '../src/connectors/tiktok/connector';
import { writeTikTokAds } from '../src/connectors/tiktok/write';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const cfg = await loadConnectorConfig('tiktok');
  const valueMetric = cfg.TIKTOK_VALUE_METRIC ?? 'total_complete_payment';
  const videoMetric = cfg.TIKTOK_VIDEO_METRIC ?? 'video_play_actions';
  const days = parseDays(process.argv);

  const client = new TikTokClient(cfg.TIKTOK_ACCESS_TOKEN, cfg.TIKTOK_ADVERTISER_ID, valueMetric, videoMetric);
  console.log(`Fetching TikTok report (last ${days} days)…`);
  const rows = await client.fetchReport(days);
  console.log(`Fetched ${rows.length} day rows.`);

  const data = normalizeReport(rows, { valueMetric, videoMetric });
  console.log(`Normalized → ${data.adSpend.length} ad_spend + ${data.dailyMetrics.length} video_views rows (tiktok_ads).`);

  await writeTikTokAds(data);
  console.log('Wrote tiktok_ads ad_spend + video_views to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
