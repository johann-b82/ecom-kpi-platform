import { describe, it, expect } from 'vitest';
import { collectStockFromMirror } from '../../src/woocommerce/stock-refresh';

function page(items: Record<string, unknown>[], totalPages = 1) {
  return { items, totalPages, total: items.length, page: 1 };
}

describe('collectStockFromMirror', () => {
  it('sammelt sku+stock_quantity von simplen Produkten und Variationen', async () => {
    const fake = {
      fetchProductsRaw: async (p: number) => p === 1 ? page([
        { id: 1, type: 'simple', sku: 'A', stock_quantity: 5 },
        { id: 2, type: 'variable', sku: 'PARENT' },
      ]) : page([]),
      fetchVariationsRaw: async (wooId: number) => wooId === 2
        ? page([{ id: 20, sku: 'B', stock_quantity: 3 }, { id: 21, sku: 'C', stock_quantity: 0 }])
        : page([]),
    };
    const rows = await collectStockFromMirror(fake as never);
    expect(rows).toEqual([
      { sku: 'A', qty: 5 }, { sku: 'B', qty: 3 }, { sku: 'C', qty: 0 },
    ]);
  });

  it('überspringt Einträge ohne sku oder ohne numerische Menge', async () => {
    const fake = {
      fetchProductsRaw: async (p: number) => p === 1 ? page([
        { id: 1, type: 'simple', sku: '', stock_quantity: 5 },
        { id: 2, type: 'simple', sku: 'D', stock_quantity: null },
        { id: 3, type: 'simple', sku: 'E', stock_quantity: 7 },
      ]) : page([]),
      fetchVariationsRaw: async () => page([]),
    };
    const rows = await collectStockFromMirror(fake as never);
    expect(rows).toEqual([{ sku: 'E', qty: 7 }]);
  });
});
