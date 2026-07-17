import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { getDemoAdsEnabled, setDemoAdsEnabled } from '@/lib/settings';

afterAll(async () => {
  await pool.query(`DELETE FROM app_settings WHERE key = 'demo_ads_enabled'`);
  await pool.end();
});

describe('demo_ads_enabled setting', () => {
  it('default false, roundtrips true/false', async () => {
    await pool.query(`DELETE FROM app_settings WHERE key = 'demo_ads_enabled'`);
    expect(await getDemoAdsEnabled()).toBe(false);
    await setDemoAdsEnabled(true);
    expect(await getDemoAdsEnabled()).toBe(true);
    await setDemoAdsEnabled(false);
    expect(await getDemoAdsEnabled()).toBe(false);
  });
});
