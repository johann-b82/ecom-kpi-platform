import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { enableDemoAds, disableDemoAds } from '@/lib/demo-ads';
import { getDemoAdsEnabled } from '@/lib/settings';

const END = '2026-07-17';

afterAll(async () => {
  await pool.query(`DELETE FROM ad_spend WHERE is_demo = true`);
  await pool.query(`DELETE FROM ad_spend WHERE platform = 'google_ads' AND date = '2024-01-01'`);
  await pool.query(`DELETE FROM app_settings WHERE key = 'demo_ads_enabled'`);
  await pool.end();
});

describe('demo ads', () => {
  it('enableDemoAds schreibt Demo-Zeilen für alle 3 Plattformen und setzt das Flag', async () => {
    await enableDemoAds(END);
    const r = await pool.query<{ platform: string; n: number }>(
      `SELECT platform, COUNT(*)::int AS n FROM ad_spend WHERE is_demo = true GROUP BY platform`);
    const by = new Map(r.rows.map((x) => [x.platform, x.n]));
    expect(by.get('google_ads')).toBe(180);
    expect(by.get('meta_ads')).toBe(180);
    expect(by.get('tiktok_ads')).toBe(180);
    expect(await getDemoAdsEnabled()).toBe(true);
  });

  it('enableDemoAds ist idempotent (kein PK-Konflikt beim erneuten Einschalten)', async () => {
    await enableDemoAds(END);
    const r = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ad_spend WHERE is_demo = true`);
    expect(r.rows[0].n).toBe(540);
  });

  it('disableDemoAds entfernt NUR Demo-Zeilen und lässt echte Daten stehen', async () => {
    // echte Zeile außerhalb des Demo-Fensters (kein PK-Konflikt)
    await pool.query(
      `INSERT INTO ad_spend(date, platform, spend, impressions, clicks, conversions, conv_value, is_demo)
       VALUES ('2024-01-01','google_ads',10,100,2,1,50,false)`);
    await disableDemoAds();
    const demo = await pool.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM ad_spend WHERE is_demo = true`);
    const real = await pool.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM ad_spend WHERE date = '2024-01-01' AND platform = 'google_ads'`);
    expect(demo.rows[0].n).toBe(0);
    expect(real.rows[0].n).toBe(1);
    expect(await getDemoAdsEnabled()).toBe(false);
  });
});
