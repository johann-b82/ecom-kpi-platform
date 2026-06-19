import { describe, it, expect } from 'vitest';
import { normalizeReport } from '@/connectors/tiktok/connector';
import type { TikTokReportRow } from '@/connectors/tiktok/types';

const rows: TikTokReportRow[] = [
  {
    dimensions: { stat_time_day: '2026-01-01 00:00:00' },
    metrics: { spend: '120.25', impressions: '60000', clicks: '900', conversion: '15', total_complete_payment: '1800.50', video_play_actions: '3000' },
  },
  {
    dimensions: { stat_time_day: '2026-01-02 00:00:00' },
    metrics: { spend: '90', impressions: '45000', clicks: '700', conversion: '8', video_play_actions: '2200' },
  },
];

function ad(ds: ReturnType<typeof normalizeReport>, date: string) {
  return ds.adSpend.find((a) => a.date === date)!;
}
function vv(ds: ReturnType<typeof normalizeReport>, date: string) {
  return ds.dailyMetrics.find((m) => m.date === date && m.metricKey === 'video_views')!;
}

describe('normalizeReport', () => {
  it('mappt ad_spend inkl. conversion + default value-Metrik, Datum gekürzt', () => {
    const ds = normalizeReport(rows);
    expect(ds.adSpend).toHaveLength(2);
    expect(ad(ds, '2026-01-01')).toMatchObject({
      platform: 'tiktok_ads', spend: 120.25, impressions: 60000, clicks: 900, conversions: 15, convValue: 1800.5,
    });
  });
  it('fehlende value-Metrik → convValue 0', () => {
    expect(ad(normalizeReport(rows), '2026-01-02').convValue).toBe(0);
  });
  it('extrahiert video_views (default Metrik), source tiktok_ads', () => {
    const ds = normalizeReport(rows);
    expect(vv(ds, '2026-01-01')).toMatchObject({ source: 'tiktok_ads', channel: 'default', value: 3000 });
    expect(vv(ds, '2026-01-02').value).toBe(2200);
  });
  it('befüllt nur adSpend + dailyMetrics; Werte numerisch', () => {
    const ds = normalizeReport(rows);
    expect(ds.orders).toHaveLength(0);
    expect(ds.customers).toHaveLength(0);
    expect(ds.subscribers).toHaveLength(0);
    expect(ds.adSpend.every((a) => typeof a.spend === 'number' && typeof a.conversions === 'number')).toBe(true);
  });
  it('nutzt konfigurierbare value-/video-Metriknamen', () => {
    const custom: TikTokReportRow[] = [{
      dimensions: { stat_time_day: '2026-01-03 00:00:00' },
      metrics: { spend: '1', impressions: '1', clicks: '1', conversion: '1', total_purchase_value: '77', video_watched_2s: '50' },
    }];
    const ds = normalizeReport(custom, { valueMetric: 'total_purchase_value', videoMetric: 'video_watched_2s' });
    expect(ad(ds, '2026-01-03').convValue).toBe(77);
    expect(vv(ds, '2026-01-03').value).toBe(50);
  });
});
