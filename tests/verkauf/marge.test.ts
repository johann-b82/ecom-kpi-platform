import { describe, it, expect } from 'vitest';
import { contributionMargin } from '@/verkauf/marge';
import type { OrderCost } from '@/verkauf/types';

const cost = (type: OrderCost['type'], amount: number): OrderCost =>
  ({ id: 'x', orderId: 'o', type, amount, source: 'berechnet', sourceRef: null });

describe('contributionMargin', () => {
  it('zieht alle Kostenzeilen vom Umsatz ab', () => {
    const r = contributionMargin(142, [cost('wareneinsatz', 64), cost('marktplatzgebuehr', 21.3)]);
    expect(r.db).toBeCloseTo(56.7, 2);
    expect(r.dbProzent!).toBeCloseTo(56.7 / 142, 4);
  });
  it('liefert dbProzent = null bei Umsatz 0', () => {
    expect(contributionMargin(0, []).dbProzent).toBeNull();
  });
  it('behandelt negative (Retoure-)Kosten korrekt', () => {
    const r = contributionMargin(-100, [cost('wareneinsatz', -40)]);
    expect(r.db).toBe(-60);
  });
});
