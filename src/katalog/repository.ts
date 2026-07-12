import { pool } from '@/lib/db';
import type {
  BundleComponent, Price, Product, ProductDetail, ProductDocument, ProductInput,
  ProductListItem, Variant, VariantInput,
} from './types';
import type { LifecycleStatus } from './lifecycle';

const P_COLS = `id, tenant_id, name, description, lifecycle_status, category, brand,
  default_supplier_id, image_url, created_at::text AS created_at`;

const mapProduct = (x: any): Product => ({
  id: x.id, tenantId: x.tenant_id, name: x.name, description: x.description,
  lifecycleStatus: x.lifecycle_status, category: x.category, brand: x.brand,
  defaultSupplierId: x.default_supplier_id, imageUrl: x.image_url, createdAt: x.created_at,
});
const mapVariant = (x: any): Variant => ({
  id: x.id, productId: x.product_id, sku: x.sku, gtin: x.gtin, attributes: x.attributes,
  purchasePrice: x.purchase_price, weightG: x.weight_g, reorderPoint: x.reorder_point,
  customsTariffNo: x.customs_tariff_no, status: x.status,
});
const mapPrice = (x: any): Price => ({
  id: x.id, variantId: x.variant_id, priceListId: x.price_list_id,
  minQty: x.min_qty, amount: x.amount, validFrom: x.valid_from,
});

export async function listProducts(): Promise<ProductListItem[]> {
  const r = await pool.query(
    `SELECT ${P_COLS},
       (SELECT count(*)::int FROM product_variants v WHERE v.product_id = p.id) AS variant_count,
       (SELECT min(v.purchase_price) FROM product_variants v WHERE v.product_id = p.id) AS min_purchase_price
     FROM products p ORDER BY name`);
  return r.rows.map((x) => ({ ...mapProduct(x), variantCount: x.variant_count, minPurchasePrice: x.min_purchase_price }));
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const p = await pool.query(`SELECT ${P_COLS} FROM products p WHERE id = $1`, [id]);
  if (p.rows.length === 0) return null;
  const variants = await pool.query(
    `SELECT id, product_id, sku, gtin, attributes, purchase_price, weight_g, reorder_point,
       customs_tariff_no, status FROM product_variants WHERE product_id = $1 ORDER BY sku`, [id]);
  const varIds = variants.rows.map((v) => v.id);
  const prices = varIds.length
    ? await pool.query(
        `SELECT id, variant_id, price_list_id, min_qty, amount, valid_from::text AS valid_from
           FROM prices WHERE variant_id = ANY($1) ORDER BY price_list_id, min_qty`, [varIds])
    : { rows: [] as any[] };
  const bundle = varIds.length
    ? await pool.query(
        `SELECT id, bundle_variant_id, component_variant_id, quantity
           FROM product_bundles WHERE bundle_variant_id = ANY($1)`, [varIds])
    : { rows: [] as any[] };
  const docs = await pool.query(
    `SELECT id, product_id, type, file_url, expires_at::text AS expires_at, uploaded_at::text AS uploaded_at
       FROM product_documents WHERE product_id = $1 ORDER BY uploaded_at DESC`, [id]);
  return {
    ...mapProduct(p.rows[0]),
    variants: variants.rows.map(mapVariant),
    prices: prices.rows.map(mapPrice),
    bundle: bundle.rows.map((x: any): BundleComponent => ({
      id: x.id, bundleVariantId: x.bundle_variant_id, componentVariantId: x.component_variant_id, quantity: x.quantity })),
    documents: docs.rows.map((x: any): ProductDocument => ({
      id: x.id, productId: x.product_id, type: x.type, fileUrl: x.file_url,
      expiresAt: x.expires_at, uploadedAt: x.uploaded_at })),
  };
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const r = await pool.query(
    `INSERT INTO products (name, description, lifecycle_status, category, brand, default_supplier_id, image_url)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING ${P_COLS}`,
    [input.name, input.description ?? null, input.lifecycleStatus, input.category ?? null,
     input.brand ?? null, input.defaultSupplierId ?? null, input.imageUrl ?? null]);
  return mapProduct(r.rows[0]);
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  await pool.query(
    `UPDATE products SET name=$2, description=$3, lifecycle_status=$4, category=$5, brand=$6,
       default_supplier_id=$7, image_url=$8 WHERE id=$1`,
    [id, input.name, input.description ?? null, input.lifecycleStatus, input.category ?? null,
     input.brand ?? null, input.defaultSupplierId ?? null, input.imageUrl ?? null]);
}

export async function setLifecycleStatus(id: string, status: LifecycleStatus): Promise<void> {
  await pool.query('UPDATE products SET lifecycle_status = $2 WHERE id = $1', [id, status]);
}
export async function setProductImage(id: string, url: string): Promise<void> {
  await pool.query('UPDATE products SET image_url = $2 WHERE id = $1', [id, url]);
}

export async function upsertVariant(v: VariantInput & { id?: string }): Promise<void> {
  if (v.id) {
    await pool.query(
      `UPDATE product_variants SET sku=$2, gtin=$3, attributes=$4, purchase_price=$5, weight_g=$6,
         reorder_point=$7, customs_tariff_no=$8, status=$9 WHERE id=$1`,
      [v.id, v.sku, v.gtin ?? null, v.attributes ?? null, v.purchasePrice ?? null, v.weightG ?? null,
       v.reorderPoint, v.customsTariffNo ?? null, v.status]);
  } else {
    await pool.query(
      `INSERT INTO product_variants (product_id, sku, gtin, attributes, purchase_price, weight_g,
         reorder_point, customs_tariff_no, status) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [v.productId, v.sku, v.gtin ?? null, v.attributes ?? null, v.purchasePrice ?? null, v.weightG ?? null,
       v.reorderPoint, v.customsTariffNo ?? null, v.status]);
  }
}
export async function deleteVariant(id: string): Promise<void> {
  await pool.query('DELETE FROM product_variants WHERE id = $1', [id]);
}

export async function upsertPrice(p: Omit<Price, 'id'> & { id?: string }): Promise<void> {
  await pool.query(
    `INSERT INTO prices (variant_id, price_list_id, min_qty, amount, valid_from)
     VALUES ($1,$2,$3,$4,$5)
     ON CONFLICT (variant_id, price_list_id, min_qty) DO UPDATE SET amount=excluded.amount, valid_from=excluded.valid_from`,
    [p.variantId, p.priceListId, p.minQty, p.amount, p.validFrom]);
}
export async function deletePrice(id: string): Promise<void> {
  await pool.query('DELETE FROM prices WHERE id = $1', [id]);
}

export async function addDocument(d: Omit<ProductDocument, 'id' | 'uploadedAt'>): Promise<void> {
  await pool.query(
    `INSERT INTO product_documents (product_id, type, file_url, expires_at) VALUES ($1,$2,$3,$4)`,
    [d.productId, d.type, d.fileUrl, d.expiresAt]);
}
export async function deleteDocument(id: string): Promise<void> {
  await pool.query('DELETE FROM product_documents WHERE id = $1', [id]);
}

export async function listPriceLists(): Promise<{ id: string; name: string; currency: string }[]> {
  const r = await pool.query('SELECT id, name, currency FROM price_lists ORDER BY name');
  return r.rows.map((x) => ({ id: x.id, name: x.name, currency: x.currency }));
}
