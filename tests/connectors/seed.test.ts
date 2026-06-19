import { describe, it, expect } from 'vitest';
import { generateSeedData } from '@/connectors/seed/generator';

const range = { start: '2026-01-01', end: '2026-03-31' };

describe('generateSeedData', () => {
  it('ist deterministisch (gleicher Range → gleiche Werte)', () => {
    const a = generateSeedData(range);
    const b = generateSeedData(range);
    expect(a.orders.length).toBe(b.orders.length);
    expect(a.dailyMetrics[0]).toEqual(b.dailyMetrics[0]);
  });
  it('liefert für jeden Tag GA4-Sessions und Ads-Spend', () => {
    const data = generateSeedData(range);
    const days = 90; // Jan(31)+Feb(28)+Mar(31)
    expect(data.dailyMetrics.filter((m) => m.metricKey === 'sessions').length).toBe(days);
    expect(data.adSpend.length).toBeGreaterThan(0);
  });
  it('Kundenaggregate sind mit Orders konsistent', () => {
    const data = generateSeedData(range);
    const c = data.customers[0];
    const orders = data.orders.filter((o) => o.customerId === c.customerId);
    expect(c.ordersCount).toBe(orders.length);
    expect(c.totalRevenue).toBeCloseTo(orders.reduce((s, o) => s + o.revenue, 0));
  });
});
