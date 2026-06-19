import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({}),
}));

vi.mock('@/kpi/repository', () => ({
  loadDataset: async () => ({
    dailyMetrics: [{ date: '2026-06-01', source: 'ga4', channel: 'default', metricKey: 'sessions', value: 100 }],
    orders: [{ orderId: 'o1', customerId: 'c1', date: '2026-06-01', revenue: 100, isFirstOrder: true }],
    customers: [{ customerId: 'c1', firstOrderDate: '2026-06-01', lastOrderDate: '2026-06-01', ordersCount: 1, totalRevenue: 100 }],
    adSpend: [], subscribers: [],
  }),
}));

import { GET } from '@/app/api/kpis/route';

describe('GET /api/kpis', () => {
  it('liefert vier Phasen und den aufgelösten Zeitraum', async () => {
    const res = await GET(new Request('http://x/api/kpis?days=30'));
    const body = await res.json();
    expect(body.phases.map((p: any) => p.phase)).toEqual(['see', 'think', 'do', 'care']);
    expect(body.range.start).toBeDefined();
  });
});
