import { TikTokClient } from '../src/connectors/tiktok/client';
import { normalizeReport } from '../src/connectors/tiktok/connector';
import { writeTikTokAds } from '../src/connectors/tiktok/write';
import { pool } from '../src/lib/db';

function parseDays(argv: string[]): number {
  const i = argv.indexOf('--days');
  const n = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isInteger(n) && n > 0 ? n : 180;
}

async function main() {
  const accessToken = process.env.TIKTOK_ACCESS_TOKEN;
  const advertiserId = process.env.TIKTOK_ADVERTISER_ID;
  if (!accessToken || !advertiserId) {
    throw new Error('Missing TIKTOK_ACCESS_TOKEN / TIKTOK_ADVERTISER_ID in environment.');
  }
  const valueMetric = process.env.TIKTOK_VALUE_METRIC ?? 'total_complete_payment';
  const videoMetric = process.env.TIKTOK_VIDEO_METRIC ?? 'video_play_actions';
  const days = parseDays(process.argv);

  const client = new TikTokClient(accessToken, advertiserId, valueMetric, videoMetric);
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
