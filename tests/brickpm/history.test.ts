import { describe, it, expect } from 'vitest';
import { buildPriceHistory, buildCompetitorPrices, MONTH_DATES } from '@/brickpm/history';
import type { BpmProduct, BpmCompetitor } from '@/brickpm/types';

const prod = (o: Partial<BpmProduct>): BpmProduct => ({
  id: 'P1', name: '', cat: '', series: '', status: 'aktiv', year: 2026, parts: 0, uvp: 0,
  price: 100, cost: 60, tMgn: 0, mMgn: 0, stock: 0, minStock: 0, validFrom: null, validTo: null,
  channel: '', succ: null, descr: '', ...o,
});
const comp = (o: Partial<BpmCompetitor>): BpmCompetitor => ({
  id: 'C1', productId: 'P1', competitor: 'X', compProduct: '', ownPrice: 200, compPrice: 190,
  avail: true, date: null, rec: '', ...o,
});

describe('buildPriceHistory', () => {
  it('is deterministic and yields one point per month', () => {
    const a = buildPriceHistory([prod({})]);
    const b = buildPriceHistory([prod({})]);
    expect(a).toEqual(b);
    expect(a).toHaveLength(MONTH_DATES.length);
    expect(a.every((p) => p.productId === 'P1')).toBe(true);
  });
  it('the newest point equals the current price/cost', () => {
    const a = buildPriceHistory([prod({ price: 100, cost: 60 })]);
    const last = a[a.length - 1];
    expect(last.date).toBe('2026-07-01');
    expect(last.price).toBe(100);
    expect(last.cost).toBe(60);
  });
});

describe('buildCompetitorPrices', () => {
  it('yields one point per month, newest equals current own/comp', () => {
    const a = buildCompetitorPrices([comp({ ownPrice: 200, compPrice: 190 })]);
    expect(a).toHaveLength(MONTH_DATES.length);
    const last = a[a.length - 1];
    expect(last).toMatchObject({ productId: 'P1', competitor: 'X', ownPrice: 200, compPrice: 190, date: '2026-07-01' });
  });
});
