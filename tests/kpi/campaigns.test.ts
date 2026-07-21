import { describe, it, expect } from 'vitest';
import { campaignStage, listCampaigns, campaignKpis } from '@/kpi/campaigns';

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

const rows = [
  { date: '2026-01-01', platform: 'meta_ads' as const, spend: 100, impressions: 1000, clicks: 20, conversions: 2, convValue: 300, campaignId: 'm1', campaignName: 'Prospecting_Video' },
  { date: '2026-01-03', platform: 'meta_ads' as const, spend: 200, impressions: 3000, clicks: 40, conversions: 5, convValue: 700, campaignId: 'm1', campaignName: 'Prospecting_Video' },
  { date: '2026-01-02', platform: 'meta_ads' as const, spend: 500, impressions: 4000, clicks: 60, conversions: 9, convValue: 1500, campaignId: 'm2', campaignName: 'Retargeting_DPA' },
  { date: '2026-02-01', platform: 'meta_ads' as const, spend: 999, impressions: 9, clicks: 9, conversions: 9, convValue: 9, campaignId: 'm2', campaignName: 'Retargeting_DPA' },
];
const range = { start: '2026-01-01', end: '2026-01-31' };

describe('listCampaigns', () => {
  it('aggregiert je Kampagne im Zeitraum und sortiert nach Spend', () => {
    const list = listCampaigns(rows, range);
    expect(list.map((c) => c.id)).toEqual(['meta_ads|m2', 'meta_ads|m1']); // 500 vor 300
    const m1 = list.find((c) => c.id === 'meta_ads|m1')!;
    expect(m1.spend).toBe(300);          // 100 + 200
    expect(m1.impressions).toBe(4000);
    expect(m1.clicks).toBe(60);
    expect(m1.firstDate).toBe('2026-01-01');
    expect(m1.lastDate).toBe('2026-01-03');
    expect(m1.stage).toBe('see');
    const m2 = list.find((c) => c.id === 'meta_ads|m2')!;
    expect(m2.spend).toBe(500);          // Zeile vom 2026-02-01 ist außerhalb des Range
    expect(m2.stage).toBe('do');
  });
  it('Zeilen ohne Kampagnenfelder landen als unzugeordnet', () => {
    const anon = [{ date: '2026-01-05', platform: 'google_ads' as const, spend: 50, impressions: 500, clicks: 5, conversions: 1, convValue: 60 }];
    const [c] = listCampaigns(anon, range);
    expect(c.id).toBe('google_ads|__account__');
    expect(c.stage).toBeNull();
  });
});

const doRows = [{ date: '2026-01-01', platform: 'meta_ads' as const, spend: 200,
  impressions: 10000, clicks: 100, conversions: 40, convValue: 800,
  campaignId: 'm2', campaignName: 'Retargeting_DPA' }];

describe('campaignKpis', () => {
  it('DO zeigt Conversions, ROAS, CAC (Ad), Conversion-Wert', () => {
    const ks = campaignKpis(doRows, 'do');
    const by = (k: string) => ks.find((x) => x.key === k)!;
    expect(ks.map((k) => k.key)).toEqual(['conversions', 'roas', 'cac_ads', 'conv_value']);
    expect(by('roas').value).toBeCloseTo(4);        // 800 / 200
    expect(by('cac_ads').value).toBeCloseTo(5);     // 200 / 40
    expect(by('conversions').value).toBe(40);
  });
  it('SEE zeigt Impressions, CPM, Klicks, CTR', () => {
    const ks = campaignKpis(doRows, 'see');
    const by = (k: string) => ks.find((x) => x.key === k)!;
    expect(ks.map((k) => k.key)).toEqual(['impressions', 'cpm', 'clicks', 'ctr']);
    expect(by('cpm').value).toBeCloseTo(20);        // 200 / 10000 * 1000
    expect(by('ctr').value).toBeCloseTo(0.01);      // 100 / 10000
  });
  it('markiert KPI als nicht verfügbar bei Division durch Null', () => {
    const empty = [{ date: '2026-01-01', platform: 'meta_ads' as const, spend: 0,
      impressions: 0, clicks: 0, conversions: 0, convValue: 0 }];
    const roas = campaignKpis(empty, 'do').find((k) => k.key === 'roas')!;
    expect(roas.available).toBe(false);
    expect(roas.value).toBeNull();
  });
});

