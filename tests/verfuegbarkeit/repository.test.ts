import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import {
  listStock, getVariantStock, listWarehouses, listReorderSuggestions,
  adjustStock, createDraftPurchaseOrder, markPurchaseOrderOrdered, receiveGoods,
  cancelPurchaseOrder, getPurchaseOrder,
} from '@/verfuegbarkeit/repository';

async function variantId(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  return r.rows[0].id;
}

const createdPoIds: string[] = [];
async function anyWarehouseId(): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM warehouses WHERE is_default LIMIT 1');
  return r.rows[0].id;
}
async function supplierId(): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM contacts ORDER BY name LIMIT 1');
  return r.rows[0].id;
}
async function onHand(sku: string, whId: string): Promise<number> {
  const r = await pool.query<{ q: number }>(
    `SELECT COALESCE(quantity_on_hand,0)::int AS q FROM stock_levels
       WHERE variant_id=(SELECT id FROM product_variants WHERE sku=$1) AND warehouse_id=$2`, [sku, whId]);
  return r.rows[0]?.q ?? 0;
}

beforeAll(async () => { await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit(); });
afterAll(async () => {
  for (const id of createdPoIds) {
    await pool.query('DELETE FROM purchase_order_lines WHERE purchase_order_id = $1', [id]);
    await pool.query('DELETE FROM purchase_orders WHERE id = $1', [id]);
  }
  await pool.end();
});

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

describe('verfuegbarkeit repository — write', () => {
  it('adjustStock schreibt Korrektur + bewegt on_hand; negativer Endbestand wirft', async () => {
    const wh = await anyWarehouseId();
    const vid = await variantId('BK-CLASSIC');
    const before = await onHand('BK-CLASSIC', wh);
    await adjustStock(vid, wh, +5, 'inventurdifferenz', 'Testkorrektur');
    expect(await onHand('BK-CLASSIC', wh)).toBe(before + 5);
    await expect(adjustStock(vid, wh, -(before + 5 + 1), 'bruch_schwund', null)).rejects.toThrow(/negativ/i);
    await adjustStock(vid, wh, -5, 'korrektur_fehlbuchung', null); // zurücksetzen
  });

  it('receiveGoods: Teil-Eingang → teilweise_eingegangen, Voll-Eingang → abgeschlossen, on_hand steigt', async () => {
    const wh = await anyWarehouseId();
    const vid = await variantId('SJ-BLAU');
    const poId = await createDraftPurchaseOrder({ supplierId: await supplierId(),
      lines: [{ variantId: vid, quantityOrdered: 10, unitCost: 3.5 }] });
    createdPoIds.push(poId);
    await markPurchaseOrderOrdered(poId);
    const lineId = (await getPurchaseOrder(poId))!.lines[0].id;
    const before = await onHand('SJ-BLAU', wh);

    await receiveGoods(poId, [{ lineId, quantity: 4 }]);
    expect((await getPurchaseOrder(poId))!.status).toBe('teilweise_eingegangen');
    expect(await onHand('SJ-BLAU', wh)).toBe(before + 4);

    await receiveGoods(poId, [{ lineId, quantity: 6 }]);
    expect((await getPurchaseOrder(poId))!.status).toBe('abgeschlossen');
    expect(await onHand('SJ-BLAU', wh)).toBe(before + 10);
  });

  it('receiveGoods über die bestellte Menge wirft', async () => {
    const vid = await variantId('SJ-BLAU');
    const poId = await createDraftPurchaseOrder({ supplierId: await supplierId(),
      lines: [{ variantId: vid, quantityOrdered: 2, unitCost: 3.5 }] });
    createdPoIds.push(poId);
    await markPurchaseOrderOrdered(poId);
    const lineId = (await getPurchaseOrder(poId))!.lines[0].id;
    await expect(receiveGoods(poId, [{ lineId, quantity: 5 }])).rejects.toThrow(/übersteigt/i);
  });

  it('Status-Guards: nur Entwurf bestellbar; receive nur bestellt/teilweise; cancel nur entwurf/bestellt', async () => {
    const vid = await variantId('SJ-BLAU');
    const poId = await createDraftPurchaseOrder({ supplierId: await supplierId(),
      lines: [{ variantId: vid, quantityOrdered: 1, unitCost: 1 }] });
    createdPoIds.push(poId);
    const lineId = (await getPurchaseOrder(poId))!.lines[0].id;
    await expect(receiveGoods(poId, [{ lineId, quantity: 1 }])).rejects.toThrow(/bestellte/i); // noch Entwurf
    await cancelPurchaseOrder(poId);
    expect((await getPurchaseOrder(poId))!.status).toBe('storniert');
    await expect(markPurchaseOrderOrdered(poId)).rejects.toThrow(/Entwürfe/i);
  });
});
