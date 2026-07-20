import { describe, it, expect } from 'vitest';
import { campaignStage } from '@/kpi/campaigns';

describe('campaignStage', () => {
  it('leitet die Stage aus dem Kampagnennamen ab (case-insensitive)', () => {
    expect(campaignStage('Prospecting_Video')).toBe('see');
    expect(campaignStage('awareness_reels')).toBe('see');
    expect(campaignStage('Traffic_Discovery')).toBe('think');
    expect(campaignStage('Retargeting_Q3')).toBe('do');
    expect(campaignStage('Conversion_Catalog')).toBe('do');
    expect(campaignStage('Newsletter_Reactivation')).toBe('care');
  });
  it('liefert null, wenn keine Regel greift', () => {
    expect(campaignStage('Brandkampagne 2026')).toBeNull();
  });
});
