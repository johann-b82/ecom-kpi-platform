import { describe, it, expect } from 'vitest';
import { computeCockpitStats, sortHeuteWichtig } from '@/brickpm/cockpit';
import type { BpmProduct, BpmPromotion, BpmNotification } from '@/brickpm/types';

const prod = (o: Partial<BpmProduct>): BpmProduct => ({
  id: 'P', name: '', cat: '', series: '', status: 'aktiv', year: 2026, parts: 0, uvp: 0,
  price: 100, cost: 60, tMgn: 0, mMgn: 0, stock: 100, minStock: 10, validFrom: null, validTo: null,
  channel: '', succ: null, descr: '', ...o,
});
const notif = (o: Partial<BpmNotification>): BpmNotification => ({
  id: 'N', type: '', priority: 'mittel', refId: '', msg: '', action: '', status: 'offen', due: '2026-07-10', role: '', target: '', ...o,
});

describe('computeCockpitStats', () => {
  it('computes the six KPIs', () => {
    const products = [
      prod({ id: 'P1', status: 'aktiv', stock: 5, minStock: 10, price: 100, cost: 60 }),   // kritisch
      prod({ id: 'P2', status: 'preorder', stock: 50, minStock: 10, price: 200, cost: 100 }),
      prod({ id: 'P3', status: 'aktiv', stock: 50, minStock: 10, price: 0, cost: 0 }),      // price 0 excluded from marge
    ];
    const promos: BpmPromotion[] = [
      { id: 'A1', name: '', productId: '', type: '', startDate: null, endDate: null, targetUnits: 0, sold: 0, targetRev: 0, expMgn: 0, status: 'aktiv', note: '' },
      { id: 'A2', name: '', productId: '', type: '', startDate: null, endDate: null, targetUnits: 0, sold: 0, targetRev: 0, expMgn: 0, status: 'beendet', note: '' },
    ];
    const notifs = [notif({ id: 'N1', status: 'offen' }), notif({ id: 'N2', status: 'erledigt' })];
    const s = computeCockpitStats(products, promos, notifs);
    expect(s.produkte).toBe(3);
    expect(s.kritisch).toBe(1);
    expect(s.preorder).toBe(1);
    expect(s.aktiveAktionen).toBe(1);
    expect(s.offeneNotifs).toBe(1);
    // avg of (100-60)/100=0.4 and (200-100)/200=0.5 → 0.45 (P3 price 0 excluded)
    expect(s.avgMarge).toBeCloseTo(0.45, 5);
  });
});

describe('sortHeuteWichtig', () => {
  it('keeps only open, sorts by priority then due, top 5', () => {
    const ns = [
      notif({ id: 'a', priority: 'niedrig', due: '2026-07-01', status: 'offen' }),
      notif({ id: 'b', priority: 'kritisch', due: '2026-07-20', status: 'offen' }),
      notif({ id: 'c', priority: 'kritisch', due: '2026-07-05', status: 'offen' }),
      notif({ id: 'd', priority: 'hoch', due: '2026-07-02', status: 'erledigt' }), // filtered out
    ];
    const out = sortHeuteWichtig(ns);
    expect(out.map((n) => n.id)).toEqual(['c', 'b', 'a']);
  });
});
