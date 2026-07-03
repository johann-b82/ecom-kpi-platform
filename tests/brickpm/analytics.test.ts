import { describe, it, expect } from 'vitest';
import {
  revenueByCategory, margeBySeries, sellThrough, statusDistribution, reorderList, deviationAlerts,
} from '@/brickpm/analytics';
import type { BpmProduct, BpmPromotion, BpmCompetitor } from '@/brickpm/types';

const prod = (o: Partial<BpmProduct>): BpmProduct => ({
  id: 'P', name: '', cat: 'A', series: 'S1', status: 'aktiv', year: 2026, parts: 0, uvp: 0,
  price: 100, cost: 60, tMgn: 0, mMgn: 0, stock: 50, minStock: 10, validFrom: null, validTo: null,
  channel: '', succ: null, descr: '', ...o,
});
const promo = (o: Partial<BpmPromotion>): BpmPromotion => ({
  id: 'A', name: 'Aktion', productId: 'P1', type: '', startDate: null, endDate: null,
  targetUnits: 100, sold: 50, targetRev: 1000, expMgn: 0, status: 'aktiv', note: '', ...o,
});
const comp = (o: Partial<BpmCompetitor>): BpmCompetitor => ({
  id: 'C', productId: 'P1', competitor: 'X', compProduct: '', ownPrice: 100, compPrice: 100,
  avail: true, date: null, rec: '', ...o,
});

describe('analytics aggregations', () => {
  it('revenueByCategory sums targetRev per product category', () => {
    const products = [prod({ id: 'P1', cat: 'A' }), prod({ id: 'P2', cat: 'B' })];
    const promos = [promo({ productId: 'P1', targetRev: 1000 }), promo({ productId: 'P1', targetRev: 500 }), promo({ productId: 'P2', targetRev: 300 })];
    expect(revenueByCategory(products, promos)).toEqual([{ name: 'A', value: 1500 }, { name: 'B', value: 300 }]);
  });

  it('margeBySeries averages margin per series as a percentage', () => {
    const r = margeBySeries([prod({ series: 'S1', price: 100, cost: 60 }), prod({ series: 'S1', price: 200, cost: 100 })]);
    expect(r).toEqual([{ name: 'S1', value: 45 }]); // (0.4 + 0.5)/2 = 0.45 → 45.0%
  });

  it('sellThrough is sold/targetUnits % sorted desc', () => {
    const r = sellThrough([promo({ name: 'a', sold: 50, targetUnits: 100 }), promo({ name: 'b', sold: 90, targetUnits: 100 })]);
    expect(r).toEqual([{ name: 'b', value: 90 }, { name: 'a', value: 50 }]);
  });

  it('statusDistribution counts per status', () => {
    const r = statusDistribution([prod({ status: 'aktiv' }), prod({ status: 'aktiv' }), prod({ status: 'kritisch' })]);
    expect(r.find((x) => x.name === 'aktiv')?.value).toBe(2);
    expect(r.find((x) => x.name === 'kritisch')?.value).toBe(1);
  });

  it('reorderList picks stock<minStock and suggests a reorder qty', () => {
    const r = reorderList([prod({ id: 'P1', stock: 5, minStock: 10 }), prod({ id: 'P2', stock: 50, minStock: 10 })]);
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ id: 'P1', stock: 5, minStock: 10, reorder: 15 });
  });

  it('deviationAlerts flags |deviation| >= threshold', () => {
    const cs = [comp({ id: 'C1', ownPrice: 110, compPrice: 100 }), comp({ id: 'C2', ownPrice: 101, compPrice: 100 })];
    const out = deviationAlerts(cs, 0.05);
    expect(out.map((c) => c.id)).toEqual(['C1']); // 10% >= 5%; 1% < 5%
  });
});
