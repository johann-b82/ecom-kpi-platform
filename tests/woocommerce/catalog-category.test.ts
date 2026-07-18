import { describe, it, expect } from 'vitest';
import { primaryWooCategory } from '../../src/woocommerce/catalog-import';

describe('primaryWooCategory', () => {
  it('nimmt die erste Woo-Kategorie', () => {
    expect(primaryWooCategory({ categories: [{ id: 1, name: 'Spielzeug' }, { id: 2, name: 'Sale' }] }))
      .toBe('Spielzeug');
  });
  it('liefert null bei leerer/fehlender Kategorie', () => {
    expect(primaryWooCategory({ categories: [] })).toBeNull();
    expect(primaryWooCategory({})).toBeNull();
    expect(primaryWooCategory({ categories: [{ id: 1, name: '  ' }] })).toBeNull();
  });
});
