import { describe, it, expect } from 'vitest';
import { careKpis } from '@/kpi/care';
import type { CanonicalDataset } from '@/lib/types';

const range = { start: '2026-02-01', end: '2026-02-28' };

// c1: Bestandskunde (vor Zeitraum + im Zeitraum) → retained, repeat
// c2: Neukunde nur im Zeitraum
// c3: war vor Zeitraum aktiv, im Zeitraum NICHT → churned
const data: CanonicalDataset = {
  dailyMetrics: [], adSpend: [],
  subscribers: [
    { date: '2026-02-10', source: 'klaviyo', signups: 0, unsubscribes: 0, npsScore: 40 },
    { date: '2026-02-20', source: 'klaviyo', signups: 0, unsubscribes: 0, npsScore: 60 },
  ],
  customers: [
    { customerId: 'c1', firstOrderDate: '2026-01-01', lastOrderDate: '2026-02-15', ordersCount: 3, totalRevenue: 300 },
    { customerId: 'c2', firstOrderDate: '2026-02-05', lastOrderDate: '2026-02-05', ordersCount: 1, totalRevenue: 50 },
    { customerId: 'c3', firstOrderDate: '2026-01-02', lastOrderDate: '2026-01-20', ordersCount: 1, totalRevenue: 80 },
  ],
  orders: [
    { orderId: 'o1', customerId: 'c1', date: '2026-01-01', revenue: 100, isFirstOrder: true },
    { orderId: 'o2', customerId: 'c1', date: '2026-02-15', revenue: 200, isFirstOrder: false },
    { orderId: 'o3', customerId: 'c2', date: '2026-02-05', revenue: 50, isFirstOrder: true },
    { orderId: 'o4', customerId: 'c3', date: '2026-01-20', revenue: 80, isFirstOrder: true },
  ],
};

describe('careKpis', () => {
  const by = (k: string) => careKpis(data, range).find((x) => x.key === k)!;
  it('Repeat Rate über aktive Kunden', () => {
    // aktiv im Zeitraum: c1, c2 → repeat (>=2 Bestellungen): nur c1 → 0.5
    expect(by('repeat_rate').value).toBeCloseTo(0.5);
  });
  it('CLV = Ø Lifetime-Umsatz aktiver Kunden', () => {
    expect(by('clv').value).toBeCloseTo(175); // (300 + 50) / 2
  });
  it('Retention/Churn gegen Vorperioden-Kunden', () => {
    // vor Zeitraum aktiv: c1, c3 → im Zeitraum wieder: nur c1 → Retention 0.5, Churn 0.5
    expect(by('retention').value).toBeCloseTo(0.5);
    expect(by('churn').value).toBeCloseTo(0.5);
  });
  it('NPS = Ø der vorhandenen Scores', () => {
    expect(by('nps').value).toBeCloseTo(50); // (40 + 60) / 2
  });
});
