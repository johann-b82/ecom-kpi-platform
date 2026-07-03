import { describe, it, expect } from 'vitest';
import { doKpis } from '@/kpi/do';
import type { CanonicalDataset } from '@/lib/types';

const range = { start: '2026-01-01', end: '2026-01-01' };

describe('doKpis', () => {
  it('berechnet Conversion, AOV, Umsatz, ROAS, CAC, Abbruchrate', () => {
    const data: CanonicalDataset = {
      dailyMetrics: [
        { date: '2026-01-01', source: 'ga4', channel: 'default', metricKey: 'sessions', value: 1000 },
        { date: '2026-01-01', source: 'ga4', channel: 'default', metricKey: 'checkouts_started', value: 50 },
        { date: '2026-01-01', source: 'ga4', channel: 'default', metricKey: 'ecommerce_purchases', value: 30 },
        { date: '2026-01-01', source: 'ga4', channel: 'default', metricKey: 'purchase_revenue', value: 600 },
      ],
      orders: [
        { orderId: 'o1', customerId: 'c1', date: '2026-01-01', revenue: 100, isFirstOrder: true },
        { orderId: 'o2', customerId: 'c2', date: '2026-01-01', revenue: 300, isFirstOrder: true },
      ],
      customers: [],
      adSpend: [{ date: '2026-01-01', platform: 'google_ads', spend: 200, impressions: 0, clicks: 0, conversions: 0, convValue: 800 }],
      subscribers: [],
    };
    const by = (k: string) => doKpis(data, range).find((x) => x.key === k)!;
    expect(by('conversion_rate').value).toBeCloseTo(0.03); // GA4: 30 ecommerce_purchases / 1000 sessions
    expect(by('aov').value).toBeCloseTo(20);                // GA4: 600 purchase_revenue / 30 ecommerce_purchases
    expect(by('revenue').value).toBe(600);                  // GA4 purchase_revenue
    expect(by('roas').value).toBeCloseTo(4);                // 800 / 200
    expect(by('cac').value).toBeCloseTo(200 / 30);          // GA4: 200 spend / 30 ecommerce_purchases
    expect(by('cart_abandonment').value).toBeCloseTo(0.4); // GA4: 1 - 30 ecommerce_purchases / 50 checkouts
  });
});
