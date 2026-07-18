import { describe, it, expect } from 'vitest';
import {
  mapOrderStatus, billingContactKey, mapBillingToContact, mapOrderLines,
} from '@/woocommerce/order-import';

describe('mapOrderStatus', () => {
  it('mappt WooCommerce-Status auf ERP-Belegstatus', () => {
    expect(mapOrderStatus('completed')).toBe('bezahlt');
    expect(mapOrderStatus('processing')).toBe('auftrag');
    expect(mapOrderStatus('on-hold')).toBe('auftrag');
    expect(mapOrderStatus('pending')).toBe('angebot');
    expect(mapOrderStatus('cancelled')).toBe('storniert');
    expect(mapOrderStatus('failed')).toBe('storniert');
    expect(mapOrderStatus('refunded')).toBe('retoure');
  });

  it('fällt auf angebot zurück bei unbekanntem Status', () => {
    expect(mapOrderStatus('irgendwas')).toBe('angebot');
  });
});

describe('billingContactKey', () => {
  it('nutzt die E-Mail (lowercase) als Dedup-Schlüssel', () => {
    expect(billingContactKey({ email: 'Max@Example.COM', first_name: 'Max', postcode: '10115' })).toBe('max@example.com');
  });

  it('fällt ohne E-Mail auf Name + PLZ zurück', () => {
    expect(billingContactKey({ first_name: 'Max', last_name: 'Muster', postcode: '10115' })).toBe('max muster 10115');
  });
});

describe('mapBillingToContact', () => {
  it('bevorzugt die Firma als Name, sonst Vor-/Nachname', () => {
    expect(mapBillingToContact({ company: 'Muster GmbH', first_name: 'Max', last_name: 'Muster', country: 'DE', email: 'a@b.de' }).name)
      .toBe('Muster GmbH');
    expect(mapBillingToContact({ first_name: 'Max', last_name: 'Muster', country: 'DE' }).name).toBe('Max Muster');
  });

  it('übernimmt Land als tax_country und E-Mail', () => {
    const c = mapBillingToContact({ first_name: 'A', last_name: 'B', country: 'AT', email: 'a@b.at' });
    expect(c.taxCountry).toBe('AT');
    expect(c.email).toBe('a@b.at');
  });
});

describe('mapOrderLines', () => {
  const skuToVariant = new Map([['SKU-A', 'var-a'], ['SKU-B', 'var-b']]);

  it('löst Positionen per SKU auf und überspringt unbekannte', () => {
    const items = [
      { sku: 'SKU-A', quantity: 2, price: '5.00' },
      { sku: 'SKU-UNBEKANNT', quantity: 1, price: '9.00' },
      { sku: 'SKU-B', quantity: 3, price: '4.50' },
    ];
    const r = mapOrderLines(items, skuToVariant);
    expect(r.lines).toEqual([
      { variantId: 'var-a', quantity: 2, unitPrice: 5 },
      { variantId: 'var-b', quantity: 3, unitPrice: 4.5 },
    ]);
    expect(r.skipped).toEqual(['SKU-UNBEKANNT']);
  });

  it('überspringt Positionen ohne SKU', () => {
    const r = mapOrderLines([{ sku: '', quantity: 1, price: '1.00' }], skuToVariant);
    expect(r.lines).toHaveLength(0);
    expect(r.skipped).toEqual(['(ohne SKU)']);
  });
});
