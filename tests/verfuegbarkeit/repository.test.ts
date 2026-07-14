import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import {
  listStock, getVariantStock, listWarehouses, listReorderSuggestions,
} from '@/verfuegbarkeit/repository';

async function variantId(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  return r.rows[0].id;
}

beforeAll(async () => { await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit(); });
afterAll(async () => { await pool.end(); });

describe('verfuegbarkeit repository — read', () => {
  it('listStock aggregiert on_hand/reserved über alle Lager je Variante', async () => {
    const rows = await listStock();
    const sjrot = rows.find((r) => r.sku === 'SJ-ROT');
    expect(sjrot).toBeDefined();
    // Seed: Hamburg 8 + München 4 = 12 on_hand, 0 reserved
    expect(sjrot!.onHand).toBe(12);
    expect(sjrot!.available).toBe(12);
    expect(sjrot!.belowReorder).toBe(true); // reorder_point 20 > 12
  });

  it('getVariantStock listet alle Lager (auch ohne Bestandszeile) + Historie', async () => {
    const detail = await getVariantStock(await variantId('SJ-ROT'));
    expect(detail).not.toBeNull();
    expect(detail!.perWarehouse.length).toBeGreaterThanOrEqual(3); // 3 Seed-Lager
    const hamburg = detail!.perWarehouse.find((w) => w.warehouseName === 'Lager Hamburg');
    expect(hamburg!.onHand).toBe(8);
    expect(detail!.adjustments.length).toBeGreaterThanOrEqual(1); // Seed-Korrektur
  });

  it('listWarehouses liefert die drei Seed-Lager', async () => {
    const whs = await listWarehouses();
    expect(whs.length).toBeGreaterThanOrEqual(3);
  });

  it('listReorderSuggestions flaggt SJ-ROT (unter Meldebestand), nicht SJ-BLAU', async () => {
    const sugg = await listReorderSuggestions();
    expect(sugg.some((s) => s.sku === 'SJ-ROT')).toBe(true);
    expect(sugg.some((s) => s.sku === 'SJ-BLAU')).toBe(false); // 40 on_hand, reorder 0/niedrig
    const sjrot = sugg.find((s) => s.sku === 'SJ-ROT')!;
    expect(sjrot.suggestedQty).toBeGreaterThan(0);
  });
});
