import { pool } from '../src/lib/db';
import { WAREHOUSES, STOCK, ADJUSTMENTS } from '../src/verfuegbarkeit/seed-data';

async function variantIdBySku(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  if (r.rows.length === 0) throw new Error(`Unbekannte SKU im Seed: ${sku}`);
  return r.rows[0].id;
}

export async function seedVerfuegbarkeit(): Promise<void> {
  for (const w of WAREHOUSES) {
    await pool.query(
      `INSERT INTO warehouses (id, name, type, is_default) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name, type=excluded.type, is_default=excluded.is_default`,
      [w.id, w.name, w.type, w.isDefault]);
  }
  for (const s of STOCK) {
    const vid = await variantIdBySku(s.sku);
    await pool.query(
      `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand, quantity_reserved)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (variant_id, warehouse_id)
       DO UPDATE SET quantity_on_hand=excluded.quantity_on_hand, quantity_reserved=excluded.quantity_reserved`,
      [vid, s.warehouseId, s.onHand, s.reserved]);
  }
  for (const a of ADJUSTMENTS) {
    const vid = await variantIdBySku(a.sku);
    await pool.query(
      `INSERT INTO stock_adjustments (variant_id, warehouse_id, delta, reason, note)
       VALUES ($1,$2,$3,$4,$5)`,
      [vid, a.warehouseId, a.delta, a.reason, a.note]);
  }
  console.log('Verfügbarkeit seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-verfuegbarkeit.ts')) {
  seedVerfuegbarkeit().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
