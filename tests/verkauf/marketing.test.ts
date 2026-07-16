import { describe, it, expect } from 'vitest';
import { adPlatformEfficiency } from '@/verkauf/marketing';
import type { AdSpend } from '@/lib/types';

const ad = (platform: AdSpend['platform'], spend: number, convValue: number): AdSpend =>
  ({ date: '2026-07-01', platform, spend, impressions: 0, clicks: 0, conversions: 0, convValue });

describe('adPlatformEfficiency', () => {
  it('gruppiert je Plattform, summiert Spend und rechnet ROAS', () => {
    const r = adPlatformEfficiency([
      ad('google_ads', 100, 380), ad('google_ads', 100, 380), ad('meta_ads', 100, 290),
    ]);
    const google = r.find((x) => x.platform === 'google_ads')!;
    expect(google.spend).toBe(200);
    expect(google.roas!).toBeCloseTo(760 / 200, 4);
    expect(r[0].spend).toBeGreaterThanOrEqual(r[1].spend); // nach Spend absteigend sortiert
  });
  it('roas = null bei Spend 0', () => {
    expect(adPlatformEfficiency([ad('tiktok_ads', 0, 0)])[0].roas).toBeNull();
  });
});
