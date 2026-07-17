import { pool } from './db';
import { addDays } from './dates';
import { generateSeedData } from '@/connectors/seed/generator';
import { setDemoAdsEnabled } from './settings';

const PLATFORMS = ['google_ads', 'meta_ads', 'tiktok_ads'];
const CHUNK = 1000;

// Schaltet Demo-ad_spend ein: 180 Tage plausible Werte je Plattform mit is_demo=true.
// Idempotent — vorhandene Demo-Zeilen werden zuerst entfernt (kein PK-Konflikt).
export async function enableDemoAds(endDate: string = new Date().toISOString().slice(0, 10)): Promise<void> {
  const { adSpend } = generateSeedData({ start: addDays(endDate, -179), end: endDate });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const p of PLATFORMS) {
      await client.query(`DELETE FROM ad_spend WHERE platform = $1 AND is_demo = true`, [p]);
    }
    for (let i = 0; i < adSpend.length; i += CHUNK) {
      const part = adSpend.slice(i, i + CHUNK);
      const values: unknown[] = [];
      const tuples = part.map((a, j) => {
        const b = j * 7;
        values.push(a.date, a.platform, a.spend, a.impressions, a.clicks, a.conversions, a.convValue);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},true)`;
      });
      await client.query(
        `INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value, is_demo)
         VALUES ${tuples.join(',')}`,
        values,
      );
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
  await setDemoAdsEnabled(true);
}

// Schaltet Demo-ad_spend aus: entfernt ausschließlich Demo-Zeilen. Echte Daten bleiben.
export async function disableDemoAds(): Promise<void> {
  await pool.query(`DELETE FROM ad_spend WHERE is_demo = true`);
  await setDemoAdsEnabled(false);
}
