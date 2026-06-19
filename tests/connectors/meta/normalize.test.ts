import { describe, it, expect } from 'vitest';
import { normalizeInsights } from '@/connectors/meta/connector';
import type { MetaInsightRow } from '@/connectors/meta/types';

const rows: MetaInsightRow[] = [
  {
    date_start: '2026-01-01', spend: '100.50', impressions: '50000', clicks: '800',
    actions: [
      { action_type: 'purchase', value: '12' },
      { action_type: 'video_view', value: '2000' },
      { action_type: 'link_click', value: '700' },
    ],
    action_values: [{ action_type: 'purchase', value: '1450.75' }],
  },
  {
    date_start: '2026-01-02', spend: '80', impressions: '40000', clicks: '600',
    actions: [{ action_type: 'video_view', value: '1500' }],
    action_values: [],
  },
];

function ad(ds: ReturnType<typeof normalizeInsights>, date: string) {
  return ds.adSpend.find((a) => a.date === date)!;
}
function vv(ds: ReturnType<typeof normalizeInsights>, date: string) {
  return ds.dailyMetrics.find((m) => m.date === date && m.metricKey === 'video_views')!;
}

describe('normalizeInsights', () => {
  it('mappt ad_spend inkl. purchase-Conversions/Wert', () => {
    const ds = normalizeInsights(rows);
    expect(ds.adSpend).toHaveLength(2);
    expect(ad(ds, '2026-01-01')).toMatchObject({
      platform: 'meta_ads', spend: 100.5, impressions: 50000, clicks: 800, conversions: 12, convValue: 1450.75,
    });
  });
  it('fehlende purchase-Action → conversions/convValue 0', () => {
    const ds = normalizeInsights(rows);
    expect(ad(ds, '2026-01-02')).toMatchObject({ conversions: 0, convValue: 0 });
  });
  it('extrahiert video_view in daily_metrics (source meta_ads)', () => {
    const ds = normalizeInsights(rows);
    expect(vv(ds, '2026-01-01')).toMatchObject({ source: 'meta_ads', channel: 'default', value: 2000 });
    expect(vv(ds, '2026-01-02').value).toBe(1500);
  });
  it('befüllt nur adSpend + dailyMetrics; Werte numerisch', () => {
    const ds = normalizeInsights(rows);
    expect(ds.orders).toHaveLength(0);
    expect(ds.customers).toHaveLength(0);
    expect(ds.subscribers).toHaveLength(0);
    expect(ds.adSpend.every((a) => typeof a.spend === 'number' && typeof a.conversions === 'number')).toBe(true);
  });
  it('nutzt den konfigurierbaren purchaseActionType', () => {
    const custom: MetaInsightRow[] = [{
      date_start: '2026-01-03', spend: '10', impressions: '1', clicks: '1',
      actions: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '5' }],
      action_values: [{ action_type: 'offsite_conversion.fb_pixel_purchase', value: '99' }],
    }];
    const ds = normalizeInsights(custom, { purchaseActionType: 'offsite_conversion.fb_pixel_purchase' });
    expect(ad(ds, '2026-01-03')).toMatchObject({ conversions: 5, convValue: 99 });
  });
});
