import { pool } from '../src/lib/db';
import { PRODUCTS, VARIANTS, PRICES, BUNDLES, CONNECTIONS } from '../src/katalog/seed-data';

export async function seedKatalog(): Promise<void> {
  for (const p of PRODUCTS) {
    await pool.query(
      `INSERT INTO products (id, name, description, lifecycle_status, category, brand, default_supplier_id, image_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name, description=excluded.description,
         lifecycle_status=excluded.lifecycle_status, category=excluded.category, brand=excluded.brand,
         default_supplier_id=excluded.default_supplier_id`,
      [p.id, p.name, p.description, p.lifecycleStatus, p.category, p.brand, p.defaultSupplierId, p.imageUrl]);
  }
  for (const v of VARIANTS) {
    await pool.query(
      `INSERT INTO product_variants (id, product_id, sku, gtin, attributes, purchase_price, weight_g,
         reorder_point, customs_tariff_no, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET sku=excluded.sku, purchase_price=excluded.purchase_price,
         reorder_point=excluded.reorder_point, status=excluded.status`,
      [v.id, v.productId, v.sku, v.gtin, v.attributes ? JSON.stringify(v.attributes) : null,
       v.purchasePrice, v.weightG, v.reorderPoint, v.customsTariffNo, v.status]);
  }
  for (const pr of PRICES) {
    await pool.query(
      `INSERT INTO prices (id, variant_id, price_list_id, min_qty, amount, valid_from)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (id) DO UPDATE SET amount=excluded.amount, min_qty=excluded.min_qty`,
      [pr.id, pr.variantId, pr.priceListId, pr.minQty, pr.amount, pr.validFrom]);
  }
  for (const b of BUNDLES) {
    await pool.query(
      `INSERT INTO product_bundles (id, bundle_variant_id, component_variant_id, quantity)
       VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET quantity=excluded.quantity`,
      [b.id, b.bundleVariantId, b.componentVariantId, b.quantity]);
  }
  for (const cn of CONNECTIONS) {
    await pool.query(
      `INSERT INTO integration_connections (id, app, provider, label, status, last_synced_at)
       VALUES ($1,$2,$3,$4,$5,$6::timestamptz)
       ON CONFLICT (id) DO UPDATE SET status=excluded.status, last_synced_at=excluded.last_synced_at, label=excluded.label`,
      [cn.id, cn.app, cn.provider, cn.label, cn.status, cn.lastSyncedAt]);
  }
  console.log('Katalog seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-katalog.ts')) {
  seedKatalog().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
