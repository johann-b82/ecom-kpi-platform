import { describe, it, expect } from 'vitest';
import { computeMarge } from '@/brickpm/marge';
import type { BpmProduct } from '@/brickpm/types';

const prod = (o: Partial<BpmProduct>): BpmProduct => ({
  id: 'P', name: '', cat: '', series: '', status: 'aktiv', year: 2026, parts: 0,
  uvp: 120, price: 100, cost: 60, tMgn: 0.5, mMgn: 0.35, stock: 100, minStock: 10,
  validFrom: null, validTo: null, channel: '', succ: null, descr: '', ...o,
});

describe('computeMarge', () => {
  it('computes effPrice, db, marge, maxDisc and a locked recommendation when marge < mMgn', () => {
    const r = computeMarge({
      product: prod({}),
      discPct: 10,
      discEur: 0,
      goodieCost: 0,
      targetRev: 900,
      mode: 'pct',
    });
    expect(r.effPrice).toBeCloseTo(90, 5);
    expect(r.db).toBeCloseTo(30, 5);
    expect(r.marge).toBeCloseTo(30 / 90, 5); // ≈0.333
    expect(r.maxDiscPrice).toBeCloseTo(60 / (1 - 0.35), 5); // ≈92.307...
    expect(r.maxDiscEur).toBeCloseTo(120 - 60 / (1 - 0.35), 5);
    expect(r.neededUnits).toBe(Math.ceil(900 / 90));
    // marge≈0.333 < mMgn 0.35 → locked
    expect(r.recommendation).toBe('Rabatt gesperrt – Mindestmarge unterschritten');
  });

  it('recommends "Keine Maßnahme nötig" when marge >= tMgn', () => {
    const r = computeMarge({
      product: prod({ tMgn: 0.3, mMgn: 0.2 }),
      discPct: 0,
      discEur: 0,
      goodieCost: 0,
      targetRev: 100,
      mode: 'pct',
    });
    // effPrice=100, db=40, marge=0.4 >= tMgn 0.3
    expect(r.marge).toBeCloseTo(0.4, 5);
    expect(r.recommendation).toBe('Keine Maßnahme nötig');
  });

  it('recommends "Goodie statt Rabatt empfohlen" when 0 < goodieCost < disc', () => {
    const r = computeMarge({
      product: prod({ tMgn: 0.9, mMgn: 0.35 }),
      discPct: 10,
      discEur: 0,
      goodieCost: 5,
      targetRev: 100,
      mode: 'pct',
    });
    // disc = 10, goodieCost=5 < 10 and > 0; marge < tMgn(0.9) so this branch is reached
    expect(r.recommendation).toBe('Goodie statt Rabatt empfohlen');
  });

  it('computes neededUnits via mode "eur"', () => {
    const r = computeMarge({
      product: prod({}),
      discPct: 0,
      discEur: 20,
      goodieCost: 0,
      targetRev: 240,
      mode: 'eur',
    });
    expect(r.effPrice).toBeCloseTo(80, 5);
    expect(r.neededUnits).toBe(3);
  });

  // Full decision table — the three mid-tier branches (marge between mMgn and tMgn).
  it('recommends "Bundle statt Rabatt empfohlen" when marge >= mMgn+0.05', () => {
    const r = computeMarge({ product: prod({ cost: 55, tMgn: 0.6, mMgn: 0.35 }), discPct: 0, discEur: 0, goodieCost: 0, targetRev: 100, mode: 'pct' });
    expect(r.marge).toBeCloseTo(0.45, 5); // >= 0.40, < tMgn 0.6
    expect(r.recommendation).toBe('Bundle statt Rabatt empfohlen');
  });

  it('recommends "Moderater Rabatt möglich" when mMgn+0.02 <= marge < mMgn+0.05', () => {
    const r = computeMarge({ product: prod({ cost: 62, tMgn: 0.6, mMgn: 0.35 }), discPct: 0, discEur: 0, goodieCost: 0, targetRev: 100, mode: 'pct' });
    expect(r.marge).toBeCloseTo(0.38, 5); // in [0.37, 0.40)
    expect(r.recommendation).toBe('Moderater Rabatt möglich');
  });

  it('recommends "Abverkaufsaktion empfehlen" when mMgn <= marge < mMgn+0.02', () => {
    const r = computeMarge({ product: prod({ cost: 64, tMgn: 0.6, mMgn: 0.35 }), discPct: 0, discEur: 0, goodieCost: 0, targetRev: 100, mode: 'pct' });
    expect(r.marge).toBeCloseTo(0.36, 5); // in [0.35, 0.37)
    expect(r.recommendation).toBe('Abverkaufsaktion empfehlen');
  });

  it('the goodie branch beats a mid-tier (Bundle) recommendation when goodieCost < disc', () => {
    // effPrice=90, db=90-44.5-5=40.5 → marge=0.45 (would be "Bundle"), but goodieCost 5 < disc 10 → goodie wins.
    const r = computeMarge({ product: prod({ cost: 44.5, tMgn: 0.6, mMgn: 0.35 }), discPct: 10, discEur: 0, goodieCost: 5, targetRev: 100, mode: 'pct' });
    expect(r.marge).toBeCloseTo(0.45, 5);
    expect(r.recommendation).toBe('Goodie statt Rabatt empfohlen');
  });
});
