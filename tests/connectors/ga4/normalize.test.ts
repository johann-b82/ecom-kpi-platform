import { describe, it, expect } from 'vitest';
import { normalizeReport } from '@/connectors/ga4/connector';
import type { Ga4Report } from '@/connectors/ga4/types';

const report: Ga4Report = {
  dimensionHeaders: [{ name: 'date' }],
  metricHeaders: [
    { name: 'sessions' }, { name: 'screenPageViews' }, { name: 'totalUsers' },
    { name: 'newUsers' }, { name: 'engagedSessions' }, { name: 'addToCarts' }, { name: 'checkouts' },
  ],
  rows: [
    { dimensionValues: [{ value: '20260101' }], metricValues: [{ value: '1000' }, { value: '3000' }, { value: '800' }, { value: '600' }, { value: '650' }, { value: '120' }, { value: '40' }] },
    { dimensionValues: [{ value: '20260102' }], metricValues: [{ value: '500' }, { value: '1500' }, { value: '400' }, { value: '500' }, { value: '480' }, { value: '60' }, { value: '20' }] },
  ],
};

function val(ds: ReturnType<typeof normalizeReport>, date: string, key: string): number {
  return ds.dailyMetrics.find((m) => m.date === date && m.metricKey === key)!.value;
}

describe('normalizeReport', () => {
  it('erzeugt 7 numerische daily_metrics je Tag, source ga4', () => {
    const ds = normalizeReport(report);
    expect(ds.dailyMetrics).toHaveLength(14); // 2 Tage × 7 Keys
    expect(ds.dailyMetrics.every((m) => m.source === 'ga4' && m.channel === 'default')).toBe(true);
    expect(ds.dailyMetrics.every((m) => typeof m.value === 'number')).toBe(true);
  });
  it('mappt direkte Metriken und konvertiert das Datum', () => {
    const ds = normalizeReport(report);
    expect(val(ds, '2026-01-01', 'sessions')).toBe(1000);
    expect(val(ds, '2026-01-01', 'pageviews')).toBe(3000);
    expect(val(ds, '2026-01-01', 'total_users')).toBe(800);
    expect(val(ds, '2026-01-01', 'add_to_carts')).toBe(120);
    expect(val(ds, '2026-01-01', 'checkouts_started')).toBe(40);
  });
  it('leitet returning_users und bounced_sessions ab (≥0 geklemmt)', () => {
    const ds = normalizeReport(report);
    expect(val(ds, '2026-01-01', 'returning_users')).toBe(200); // 800-600
    expect(val(ds, '2026-01-01', 'bounced_sessions')).toBe(350); // 1000-650
    expect(val(ds, '2026-01-02', 'returning_users')).toBe(0); // max(0, 400-500)
    expect(val(ds, '2026-01-02', 'bounced_sessions')).toBe(20); // 500-480
  });
  it('befüllt nur dailyMetrics', () => {
    const ds = normalizeReport(report);
    expect(ds.orders).toHaveLength(0);
    expect(ds.customers).toHaveLength(0);
    expect(ds.adSpend).toHaveLength(0);
    expect(ds.subscribers).toHaveLength(0);
  });
  it('ist robust gegen leeren Report', () => {
    expect(normalizeReport({}).dailyMetrics).toHaveLength(0);
  });
  it('ist order-robust bei vertauschten metricHeaders', () => {
    const shuffled: Ga4Report = {
      dimensionHeaders: [{ name: 'date' }],
      metricHeaders: [
        { name: 'checkouts' }, { name: 'addToCarts' }, { name: 'engagedSessions' },
        { name: 'newUsers' }, { name: 'totalUsers' }, { name: 'screenPageViews' }, { name: 'sessions' },
      ],
      rows: [
        { dimensionValues: [{ value: '20260101' }], metricValues: [{ value: '40' }, { value: '120' }, { value: '650' }, { value: '600' }, { value: '800' }, { value: '3000' }, { value: '1000' }] },
      ],
    };
    const ds = normalizeReport(shuffled);
    expect(val(ds, '2026-01-01', 'sessions')).toBe(1000);
    expect(val(ds, '2026-01-01', 'pageviews')).toBe(3000);
    expect(val(ds, '2026-01-01', 'total_users')).toBe(800);
    expect(val(ds, '2026-01-01', 'returning_users')).toBe(200);
    expect(val(ds, '2026-01-01', 'bounced_sessions')).toBe(350);
    expect(val(ds, '2026-01-01', 'checkouts_started')).toBe(40);
  });
  it('überspringt Zeilen ohne dimensionValues', () => {
    const malformed = { rows: [{ metricValues: [{ value: '1' }] }] } as unknown as Ga4Report;
    expect(normalizeReport(malformed).dailyMetrics).toHaveLength(0);
  });
});
