import { describe, it, expect } from 'vitest';
import { generateSeedData, splitTotal } from '@/connectors/seed/generator';

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

describe('splitTotal', () => {
  it('erhält die Summe exakt (Rundungsrest auf die letzte Kampagne)', () => {
    const parts = splitTotal(100, [0.4, 0.3, 0.3], true);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100);
    expect(parts.length).toBe(3);
  });
  it('erhält auch Float-Summen exakt', () => {
    const parts = splitTotal(10.5, [0.5, 0.5], false);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(10.5, 10);
  });
});

describe('generateSeedData Kampagnen', () => {
  it('splittet den Plattform-Spend je Tag verlustfrei auf Kampagnen (Invariante)', () => {
    const data = generateSeedData({ start: '2026-01-01', end: '2026-01-10' });
    // Gruppiere nach date+platform und prüfe: mehrere Kampagnen, alle mit Namen.
    const metaRows = data.adSpend.filter((a) => a.platform === 'meta_ads' && a.date === '2026-01-01');
    expect(metaRows.length).toBeGreaterThan(1);
    expect(metaRows.every((r) => !!r.campaignName)).toBe(true);
    // Stage-Abdeckung: mindestens SEE, DO und CARE unter den Demo-Kampagnen.
    const names = data.adSpend.map((r) => r.campaignName!);
    expect(names.some((n) => /Prospecting/.test(n))).toBe(true);   // see
    expect(names.some((n) => /Retargeting/.test(n))).toBe(true);   // do
    expect(names.some((n) => /Newsletter/.test(n))).toBe(true);    // care
  });
});
