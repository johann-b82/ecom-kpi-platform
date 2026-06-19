import { describe, it, expect } from 'vitest';
import { normalizeRows } from '@/connectors/google/connector';
import type { GoogleAdsRow } from '@/connectors/google/types';

const rows: GoogleAdsRow[] = [
  {
    segments: { date: '2026-01-01' },
    metrics: { costMicros: '150250000', impressions: '70000', clicks: '1000', conversions: 18, conversionsValue: 2100.75, videoViews: '4000' },
  },
  {
    segments: { date: '2026-01-02' },
    metrics: { costMicros: '90000000', impressions: '50000', clicks: '800' },
  },
];

function ad(ds: ReturnType<typeof normalizeRows>, date: string) {
  return ds.adSpend.find((a) => a.date === date)!;
}
function vv(ds: ReturnType<typeof normalizeRows>, date: string) {
  return ds.dailyMetrics.find((m) => m.date === date && m.metricKey === 'video_views')!;
}

describe('normalizeRows', () => {
  it('rechnet cost_micros in Währung um und mappt ad_spend', () => {
    const ds = normalizeRows(rows);
    expect(ds.adSpend).toHaveLength(2);
    expect(ad(ds, '2026-01-01')).toMatchObject({
      platform: 'google_ads', spend: 150.25, impressions: 70000, clicks: 1000, conversions: 18, convValue: 2100.75,
    });
  });
  it('fehlende conversions/value/video → 0', () => {
    const ds = normalizeRows(rows);
    expect(ad(ds, '2026-01-02')).toMatchObject({ conversions: 0, convValue: 0 });
    expect(vv(ds, '2026-01-02').value).toBe(0);
  });
  it('extrahiert video_views, source google_ads', () => {
    const ds = normalizeRows(rows);
    expect(vv(ds, '2026-01-01')).toMatchObject({ source: 'google_ads', channel: 'default', value: 4000 });
  });
  it('befüllt nur adSpend + dailyMetrics; Werte numerisch', () => {
    const ds = normalizeRows(rows);
    expect(ds.orders).toHaveLength(0);
    expect(ds.customers).toHaveLength(0);
    expect(ds.subscribers).toHaveLength(0);
    expect(ds.adSpend.every((a) => typeof a.spend === 'number' && typeof a.conversions === 'number')).toBe(true);
  });
});
