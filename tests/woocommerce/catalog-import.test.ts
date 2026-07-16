import { describe, it, expect } from 'vitest';
import { mapProduct, type CatalogMapping } from '@/woocommerce/catalog-import';
import type { MirrorProduct } from '@/woocommerce/mirror';

function product(over: Partial<MirrorProduct>): MirrorProduct {
  return { id: 1, name: 'Brick', sku: '10112939', type: 'simple', status: 'publish', stockQuantity: 5, price: '2.50', ...over };
}

describe('mapProduct', () => {
  it('bildet ein publish-Produkt auf aktive Katalog-Felder ab', () => {
    expect(mapProduct(product({}))).toEqual({
      name: 'Brick', lifecycleStatus: 'aktiv', variantStatus: 'aktiv', sku: '10112939', price: 2.5,
    });
  });

  it('mappt draft auf lifecycle konzept und Variante inaktiv', () => {
    const m = mapProduct(product({ status: 'draft' }));
    expect(m).toMatchObject({ lifecycleStatus: 'konzept', variantStatus: 'inaktiv' });
  });

  it('lässt den Preis weg (null), wenn Woo 0 liefert — Parent-Ebene führt oft keinen Preis', () => {
    expect((mapProduct(product({ price: '0.0000' })) as CatalogMapping).price).toBeNull();
    expect((mapProduct(product({ price: '' })) as CatalogMapping).price).toBeNull();
  });

  it('überspringt Produkte ohne SKU (keine Variante ohne UNIQUE-SKU möglich)', () => {
    expect(mapProduct(product({ sku: '' }))).toEqual({ skip: 'no-sku' });
  });
});
