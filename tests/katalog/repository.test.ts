import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { createProduct, getProduct, listProducts, setLifecycleStatus, upsertVariant } from '@/katalog/repository';

const ids: string[] = [];
afterAll(async () => { for (const id of ids) await pool.query('DELETE FROM products WHERE id = $1', [id]); });

describe('katalog repository', () => {
  it('creates a product, adds a variant, and reads detail', async () => {
    const p = await createProduct({ name: 'Testprodukt', lifecycleStatus: 'konzept' });
    ids.push(p.id);
    await upsertVariant({ productId: p.id, sku: `T-${p.id.slice(0, 8)}`, reorderPoint: 5, status: 'aktiv', purchasePrice: 4.5 });
    const detail = await getProduct(p.id);
    expect(detail?.variants).toHaveLength(1);
    expect(detail?.variants[0].purchasePrice).toBe('4.50'); // pg NUMERIC → string
  });

  it('changes lifecycle status', async () => {
    const p = await createProduct({ name: 'Statusprodukt', lifecycleStatus: 'konzept' });
    ids.push(p.id);
    await setLifecycleStatus(p.id, 'aktiv');
    expect((await getProduct(p.id))?.lifecycleStatus).toBe('aktiv');
  });

  it('list carries variant count', async () => {
    const list = await listProducts();
    expect(list.length).toBeGreaterThan(0);
    expect(typeof list[0].variantCount).toBe('number');
  });
});
