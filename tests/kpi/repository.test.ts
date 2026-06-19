import { describe, it, expect, vi } from 'vitest';

function fakeSupabase(tables: Record<string, unknown[]>) {
  return {
    from: (t: string) => ({ select: () => Promise.resolve({ data: tables[t] ?? [], error: null }) }),
    rpc: vi.fn(),
  } as any;
}

describe('loadDataset (supabase-js)', () => {
  it('maps rows and coerces ad_spend bigints to numbers', async () => {
    const { loadDataset } = await import('@/kpi/repository');
    const supabase = fakeSupabase({
      daily_metrics: [{ date: '2026-06-01', source: 's', channel: 'c', metricKey: 'sessions', value: 5 }],
      orders: [],
      customers: [],
      ad_spend: [{ date: '2026-06-01', platform: 'meta', spend: 10, impressions: '1000', clicks: '50', conversions: '3', convValue: 99 }],
      subscribers: [],
    });
    const data = await loadDataset(supabase);
    expect(data.dailyMetrics[0].metricKey).toBe('sessions');
    expect(data.adSpend[0].impressions).toBe(1000);
    expect(data.adSpend[0].clicks).toBe(50);
    expect(data.adSpend[0].conversions).toBe(3);
  });
  it('throws when a query returns an error', async () => {
    const { loadDataset } = await import('@/kpi/repository');
    const supabase = { from: () => ({ select: () => Promise.resolve({ data: null, error: { message: 'boom' } }) }) } as any;
    await expect(loadDataset(supabase)).rejects.toThrow(/boom/);
  });
});
