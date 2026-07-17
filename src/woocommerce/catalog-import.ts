import type { Pool } from 'pg';
import { normalizeProduct, type MirrorProduct } from './mirror';

// Pure mapping from a WooCommerce product to the ERP catalog fields.
// Parent-level (P3 step 1): each Woo product → one product + one variant by SKU.
export type CatalogMapping = {
  name: string;
  lifecycleStatus: 'aktiv' | 'konzept';
  variantStatus: 'aktiv' | 'inaktiv';
  sku: string;
  price: number | null;
};

/** Primäre Kategorie eines Woo-Produkts (erste in categories[]) oder null. */
export function primaryWooCategory(raw: Record<string, unknown>): string | null {
  const cats = raw.categories;
  if (!Array.isArray(cats) || cats.length === 0) return null;
  const first = cats[0] as { name?: unknown };
  const name = typeof first?.name === 'string' ? first.name.trim() : '';
  return name || null;
}

export function mapProduct(woo: MirrorProduct): CatalogMapping | { skip: 'no-sku' } {
  if (!woo.sku) return { skip: 'no-sku' };
  const n = Number(woo.price);
  // Parent-level prices are often 0 for this store (real prices live on variations);
  // only carry a positive price into the price list, never a misleading 0.
  const price = Number.isFinite(n) && n > 0 ? n : null;
  const active = woo.status === 'publish';
  return {
    name: woo.name,
    lifecycleStatus: active ? 'aktiv' : 'konzept',
    variantStatus: active ? 'aktiv' : 'inaktiv',
    sku: woo.sku,
    price,
  };
}

export interface ImportResult {
  created: number;              // new product + variant created in the ERP
  linked: number;              // matched an existing ERP variant (by prior woo ref or SKU)
  pricesWritten: number;
  skippedNoSku: number;
  skippedDuplicate: string[];  // SKUs that appeared more than once in this batch
}

// Import WooCommerce variations as additional variants under their parent's ERP product.
// Closes the gap where order lines reference variation SKUs (not the parent SKU).
export interface VariationImportResult {
  created: number; linked: number; pricesWritten: number; skippedNoSku: number;
}

export async function importWooCommerceVariations(
  pool: Pool, items: { parentProductId: string; raw: Record<string, unknown> }[], priceListId: string,
): Promise<VariationImportResult> {
  const result: VariationImportResult = { created: 0, linked: 0, pricesWritten: 0, skippedNoSku: 0 };
  for (const { parentProductId, raw } of items) {
    const sku = (raw.sku as string) ?? '';
    if (!sku) { result.skippedNoSku++; continue; }
    const externalId = String(raw.id);
    const status = raw.status === 'publish' ? 'aktiv' : 'inaktiv';
    const n = Number(raw.price);
    const price = Number.isFinite(n) && n > 0 ? n : null;
    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      const ref = await c.query<{ entity_id: string }>(
        `SELECT entity_id FROM external_references
          WHERE source_system='woocommerce' AND external_id=$1 AND entity_type='product_variant'`, [externalId]);
      let variantId: string;
      if (ref.rows.length > 0) {
        variantId = ref.rows[0].entity_id;
        result.linked++;
      } else {
        const bySku = await c.query<{ id: string }>(`SELECT id FROM product_variants WHERE sku=$1`, [sku]);
        if (bySku.rows.length > 0) {
          variantId = bySku.rows[0].id;
          result.linked++;
        } else {
          const v = await c.query<{ id: string }>(
            `INSERT INTO product_variants (product_id, sku, status, attributes) VALUES ($1,$2,$3,$4::jsonb) RETURNING id`,
            [parentProductId, sku, status, JSON.stringify(raw.attributes ?? null)]);
          variantId = v.rows[0].id;
          result.created++;
        }
      }
      await c.query(
        `INSERT INTO external_references (entity_type, entity_id, source_system, external_id, last_synced_at, raw_payload)
         VALUES ('product_variant', $1, 'woocommerce', $2, now(), $3::jsonb)
         ON CONFLICT (source_system, external_id, entity_type)
         DO UPDATE SET entity_id=excluded.entity_id, last_synced_at=now(), raw_payload=excluded.raw_payload`,
        [variantId, externalId, JSON.stringify(raw)]);
      if (price !== null) {
        await c.query(
          `INSERT INTO prices (variant_id, price_list_id, min_qty, amount) VALUES ($1,$2,1,$3)
           ON CONFLICT (variant_id, price_list_id, min_qty) DO UPDATE SET amount=excluded.amount`,
          [variantId, priceListId, price]);
        result.pricesWritten++;
      }
      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  return result;
}

// Idempotent import. `rawProducts` are the UNMODIFIED WooCommerce product objects,
// stored verbatim in external_references.raw_payload (the connector's safety net).
export async function importWooCommerceProducts(
  pool: Pool, rawProducts: Record<string, unknown>[], priceListId: string,
): Promise<ImportResult> {
  const result: ImportResult = { created: 0, linked: 0, pricesWritten: 0, skippedNoSku: 0, skippedDuplicate: [] };
  const seenSku = new Set<string>();

  for (const raw of rawProducts) {
    const m = mapProduct(normalizeProduct(raw));
    if ('skip' in m) { result.skippedNoSku++; continue; }
    if (seenSku.has(m.sku)) { result.skippedDuplicate.push(m.sku); continue; }
    seenSku.add(m.sku);

    const externalId = String(raw.id);
    const payload = JSON.stringify(raw);
    const category = primaryWooCategory(raw);
    const c = await pool.connect();
    try {
      await c.query('BEGIN');

      const ref = await c.query<{ entity_id: string }>(
        `SELECT entity_id FROM external_references
          WHERE source_system='woocommerce' AND external_id=$1 AND entity_type='product_variant'`, [externalId]);

      let variantId: string;
      if (ref.rows.length > 0) {
        variantId = ref.rows[0].entity_id;
        await c.query(`UPDATE products SET name=$2 WHERE id=(SELECT product_id FROM product_variants WHERE id=$1)`,
          [variantId, m.name]);
        result.linked++;
      } else {
        const bySku = await c.query<{ id: string }>(`SELECT id FROM product_variants WHERE sku=$1`, [m.sku]);
        if (bySku.rows.length > 0) {
          variantId = bySku.rows[0].id;
          result.linked++;
        } else {
          const prod = await c.query<{ id: string }>(
            `INSERT INTO products (name, lifecycle_status) VALUES ($1,$2) RETURNING id`,
            [m.name, m.lifecycleStatus]);
          const variant = await c.query<{ id: string }>(
            `INSERT INTO product_variants (product_id, sku, status) VALUES ($1,$2,$3) RETURNING id`,
            [prod.rows[0].id, m.sku, m.variantStatus]);
          variantId = variant.rows[0].id;
          result.created++;
        }
      }

      await c.query(
        `UPDATE products SET category = COALESCE(category, $2)
           WHERE id = (SELECT product_id FROM product_variants WHERE id = $1)`,
        [variantId, category]);

      await c.query(
        `INSERT INTO external_references (entity_type, entity_id, source_system, external_id, last_synced_at, raw_payload)
         VALUES ('product_variant', $1, 'woocommerce', $2, now(), $3::jsonb)
         ON CONFLICT (source_system, external_id, entity_type)
         DO UPDATE SET entity_id=excluded.entity_id, last_synced_at=now(), raw_payload=excluded.raw_payload`,
        [variantId, externalId, payload]);

      if (m.price !== null) {
        await c.query(
          `INSERT INTO prices (variant_id, price_list_id, min_qty, amount)
           VALUES ($1,$2,1,$3)
           ON CONFLICT (variant_id, price_list_id, min_qty) DO UPDATE SET amount=excluded.amount`,
          [variantId, priceListId, m.price]);
        result.pricesWritten++;
      }

      await c.query('COMMIT');
    } catch (e) {
      await c.query('ROLLBACK');
      throw e;
    } finally {
      c.release();
    }
  }
  return result;
}
