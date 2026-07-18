import { describe, it, expect } from 'vitest';
import { billingSegment } from '@/woocommerce/order-import';

describe('billingSegment', () => {
  it('markiert Billing mit Firmenname als Geschäftskunde', () => {
    expect(billingSegment({ company: 'ACME GmbH' })).toBe('geschaeft');
    expect(billingSegment({ company: '  Muster AG  ' })).toBe('geschaeft');
  });
  it('markiert Billing ohne Firmenname als Privatkunde', () => {
    expect(billingSegment({ first_name: 'Max', last_name: 'Muster' })).toBe('privat');
    expect(billingSegment({ company: '' })).toBe('privat');
    expect(billingSegment({ company: '   ' })).toBe('privat');
    expect(billingSegment({})).toBe('privat');
  });
});
