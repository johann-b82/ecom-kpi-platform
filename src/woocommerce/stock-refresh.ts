import type { Pool, PoolClient } from 'pg';
import type { WooCommerceMirror } from './mirror';

type MirrorLike = Pick<WooCommerceMirror, 'fetchProductsRaw' | 'fetchVariationsRaw'>;

const asQty = (v: unknown): number | null => {
  if (typeof v === 'number' && Number.isFinite(v)) return Math.trunc(v);
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return parseInt(v, 10);
  return null;
};
const asSku = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/** Zieht sku+stock_quantity aller Produkte (inkl. Variationen variabler Produkte)
 *  aus dem WooCommerce-Mirror. Kein DB-Zugriff — testbar mit Fake-Mirror. */
export async function collectStockFromMirror(mirror: MirrorLike): Promise<{ sku: string; qty: number }[]> {
  const out: { sku: string; qty: number }[] = [];
  const push = (raw: Record<string, unknown>) => {
    const sku = asSku(raw.sku); const qty = asQty(raw.stock_quantity);
    if (sku && qty !== null) out.push({ sku, qty });
  };
  for (let page = 1; ; page += 1) {
    const p = await mirror.fetchProductsRaw(page, 100);
    for (const raw of p.items) {
      if (raw.type === 'variable') {
        const wooId = Number(raw.id);
        for (let vp = 1; ; vp += 1) {
          const vpage = await mirror.fetchVariationsRaw(wooId, vp, 100);
          for (const vr of vpage.items) push(vr);
          if (vp >= vpage.totalPages || vpage.items.length === 0) break;
        }
      } else {
        push(raw);
      }
    }
    if (page >= p.totalPages || p.items.length === 0) break;
  }
  return out;
}

/** Dedupliziert nach SKU (last-write-wins) — verhindert den Aggregations-Trap
 *  ("ON CONFLICT DO UPDATE command cannot affect row a second time") bei
 *  INSERT..SELECT-Batches mit doppelten SKUs (z.B. über offset-paginierte
 *  WooCommerce-Seiten hinweg). Pur, testbar ohne DB. */
export function dedupeBySku(rows: { sku: string; qty: number }[]): { sku: string; qty: number }[] {
  const bySku = new Map<string, number>();
  for (const r of rows) bySku.set(r.sku, r.qty); // last wins
  return [...bySku].map(([sku, qty]) => ({ sku, qty }));
}

async function defaultWarehouseId(client: Pool | PoolClient): Promise<string> {
  const r = await client.query<{ id: string }>('SELECT id FROM warehouses WHERE is_default LIMIT 1');
  if (r.rows.length === 0) throw new Error('Kein Standardlager (is_default) definiert.');
  return r.rows[0].id;
}

/** Upsert der gesammelten Mengen ins Standardlager (match per SKU → variant_id).
 *  Unbekannte SKUs werden ignoriert. Gibt die Zahl geschriebener Zeilen zurück. */
export async function applyStockLevels(
  client: Pool | PoolClient, rows: { sku: string; qty: number }[],
): Promise<number> {
  const deduped = dedupeBySku(rows);
  if (deduped.length === 0) return 0;
  const warehouseId = await defaultWarehouseId(client);
  const skus = deduped.map((r) => r.sku);
  const qtys = deduped.map((r) => r.qty);
  const res = await client.query(
    `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand)
     SELECT v.id, $3::uuid, s.qty
       FROM unnest($1::text[], $2::int[]) AS s(sku, qty)
       JOIN product_variants v ON v.sku = s.sku
     ON CONFLICT (variant_id, warehouse_id)
       DO UPDATE SET quantity_on_hand = EXCLUDED.quantity_on_hand`,
    [skus, qtys, warehouseId]);
  return res.rowCount ?? 0;
}
