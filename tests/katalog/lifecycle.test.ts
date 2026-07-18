import { describe, it, expect } from 'vitest';
import { lifecycle } from '@/katalog/lifecycle';

describe('lifecycle-Weiche', () => {
  it('konzept: nothing', () => expect(lifecycle('konzept')).toEqual({ verkaufbar: false, bestellbar: false, shopSichtbar: false }));
  it('freigegeben: orderable only', () => expect(lifecycle('freigegeben')).toEqual({ verkaufbar: false, bestellbar: true, shopSichtbar: false }));
  it('aktiv: all true', () => expect(lifecycle('aktiv')).toEqual({ verkaufbar: true, bestellbar: true, shopSichtbar: true }));
  it('auslaufend: sell + shop, no reorder', () => expect(lifecycle('auslaufend')).toEqual({ verkaufbar: true, bestellbar: false, shopSichtbar: true }));
  it('eingestellt: nothing', () => expect(lifecycle('eingestellt')).toEqual({ verkaufbar: false, bestellbar: false, shopSichtbar: false }));
});
