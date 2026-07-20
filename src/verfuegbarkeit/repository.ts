import { pool } from '@/lib/db';
import type { PoolClient } from 'pg';
import { parseSort } from '@/lib/sort';
import { nextPurchaseOrderNumber } from './number';
import {
  STOCK_SORT,
  type StockRow, type VariantStockDetail, type WarehouseStock, type StockAdjustmentRow, type WarehouseOption,
  type PurchaseOrderRow, type PurchaseOrderDetail, type PurchaseOrderLine, type PurchaseOrderStatus,
  type ReorderSuggestion, type SupplierOption, type AdjustmentReason, type PurchaseOrderInput, type GoodsReceipt,
} from './types';

export async function listStock(): Promise<StockRow[]> {
  const r = await pool.query(
    `SELECT v.id AS variant_id, v.sku, p.name AS product_name, v.reorder_point,
            COALESCE(SUM(s.quantity_on_hand),0)::int  AS on_hand,
            COALESCE(SUM(s.quantity_reserved),0)::int AS reserved
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN stock_levels s ON s.variant_id = v.id
      GROUP BY v.id, v.sku, p.name, v.reorder_point
      ORDER BY v.sku`);
  return r.rows.map((x) => {
    const available = x.on_hand - x.reserved;
    return {
      variantId: x.variant_id, sku: x.sku, productName: x.product_name,
      onHand: x.on_hand, reserved: x.reserved, available,
      reorderPoint: x.reorder_point, belowReorder: x.reorder_point > 0 && available < x.reorder_point,
    };
  });
}

const STOCK_SORT_SQL: Record<string, string> = {
  sku: 't.sku', product: 'lower(t.product_name)', available: 't.available',
  reserved: 't.reserved', reorder: 't.reorder_point',
};

// Server-seitige Bestandsliste: Suche + Filter (unter Meldebestand) + Sortierung
// + Pagination. Der WooCommerce-Katalog bringt >2500 Varianten.
export async function listStockPaged(
  opts: { search?: string; filter?: 'all' | 'below'; sort?: string; limit?: number; offset?: number } = {},
): Promise<{ rows: StockRow[]; total: number }> {
  const { search, filter = 'all', sort, limit = 50, offset = 0 } = opts;
  const s = parseSort(sort, STOCK_SORT.allowed, STOCK_SORT.fallback);
  const orderBy = `${STOCK_SORT_SQL[s.col]} ${s.dir === 'desc' ? 'DESC' : 'ASC'}, t.sku ASC`;
  const params: any[] = [search ? `%${search}%` : null, filter === 'below'];
  const inner = `
    SELECT v.id AS variant_id, v.sku, p.name AS product_name, v.reorder_point,
           COALESCE(SUM(s.quantity_on_hand),0)::int AS on_hand,
           COALESCE(SUM(s.quantity_reserved),0)::int AS reserved,
           (COALESCE(SUM(s.quantity_on_hand),0) - COALESCE(SUM(s.quantity_reserved),0))::int AS available
      FROM product_variants v
      JOIN products p ON p.id = v.product_id
      LEFT JOIN stock_levels s ON s.variant_id = v.id
     WHERE ($1::text IS NULL OR v.sku ILIKE $1 OR p.name ILIKE $1)
     GROUP BY v.id, v.sku, p.name, v.reorder_point`;
  const filtered = `SELECT t.* FROM (${inner}) t
     WHERE ($2::boolean = false OR (t.reorder_point > 0 AND t.available < t.reorder_point))`;
  const countRes = await pool.query<{ n: number }>(`SELECT count(*)::int AS n FROM (${filtered}) f`, params);
  const r = await pool.query(
    `SELECT * FROM (${filtered}) t ORDER BY ${orderBy} LIMIT $3 OFFSET $4`, [...params, limit, offset]);
  const rows: StockRow[] = r.rows.map((x: any) => ({
    variantId: x.variant_id, sku: x.sku, productName: x.product_name,
    onHand: x.on_hand, reserved: x.reserved, available: x.available,
    reorderPoint: x.reorder_point, belowReorder: x.reorder_point > 0 && x.available < x.reorder_point,
  }));
  return { rows, total: countRes.rows[0].n };
}

export async function getVariantStock(variantId: string): Promise<VariantStockDetail | null> {
  const head = await pool.query(
    `SELECT v.sku, p.name AS product_name, v.reorder_point
       FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = $1`, [variantId]);
  if (head.rows.length === 0) return null;
  const perWh = await pool.query(
    `SELECT w.id AS warehouse_id, w.name AS warehouse_name,
            COALESCE(s.quantity_on_hand,0)::int  AS on_hand,
            COALESCE(s.quantity_reserved,0)::int AS reserved
       FROM warehouses w
       LEFT JOIN stock_levels s ON s.warehouse_id = w.id AND s.variant_id = $1
      ORDER BY w.name`, [variantId]);
  const adj = await pool.query(
    `SELECT id, warehouse_id, delta, reason, note, created_at::text AS created_at
       FROM stock_adjustments WHERE variant_id = $1 ORDER BY created_at DESC LIMIT 20`, [variantId]);
  return {
    variantId,
    sku: head.rows[0].sku, productName: head.rows[0].product_name, reorderPoint: head.rows[0].reorder_point,
    perWarehouse: perWh.rows.map((x): WarehouseStock => ({
      warehouseId: x.warehouse_id, warehouseName: x.warehouse_name, onHand: x.on_hand, reserved: x.reserved,
    })),
    adjustments: adj.rows.map((x): StockAdjustmentRow => ({
      id: x.id, warehouseId: x.warehouse_id, delta: x.delta, reason: x.reason, note: x.note, createdAt: x.created_at,
    })),
  };
}

export async function listWarehouses(): Promise<WarehouseOption[]> {
  const r = await pool.query(`SELECT id, name FROM warehouses ORDER BY name`);
  return r.rows.map((x) => ({ id: x.id, name: x.name }));
}

export async function listSuppliers(): Promise<SupplierOption[]> {
  const r = await pool.query(`SELECT id, name FROM contacts ORDER BY name`);
  return r.rows.map((x) => ({ id: x.id, name: x.name }));
}

const PO_HEAD = `po.id, po.number, po.status, po.expected_at::text AS expected_at`;

export async function listPurchaseOrders(): Promise<PurchaseOrderRow[]> {
  const r = await pool.query(
    `SELECT ${PO_HEAD}, c.name AS supplier_name,
            COALESCE(SUM(l.quantity_ordered),0)::int  AS ordered,
            COALESCE(SUM(l.quantity_received),0)::int AS received
       FROM purchase_orders po
       JOIN contacts c ON c.id = po.supplier_id
       LEFT JOIN purchase_order_lines l ON l.purchase_order_id = po.id
      GROUP BY po.id, po.number, po.status, po.expected_at, c.name
      ORDER BY po.number DESC`);
  return r.rows.map((x) => ({
    id: x.id, number: x.number, supplierName: x.supplier_name, status: x.status as PurchaseOrderStatus,
    expectedAt: x.expected_at, ordered: x.ordered, received: x.received,
  }));
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrderDetail | null> {
  const head = await pool.query(
    `SELECT ${PO_HEAD}, po.supplier_id, c.name AS supplier_name, po.created_at::text AS created_at
       FROM purchase_orders po JOIN contacts c ON c.id = po.supplier_id WHERE po.id = $1`, [id]);
  if (head.rows.length === 0) return null;
  const lines = await pool.query(
    `SELECT l.id, l.variant_id, v.sku, p.name AS product_name,
            l.quantity_ordered, l.quantity_received, l.unit_cost
       FROM purchase_order_lines l
       JOIN product_variants v ON v.id = l.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE l.purchase_order_id = $1 ORDER BY v.sku`, [id]);
  const h = head.rows[0];
  return {
    id: h.id, number: h.number, supplierId: h.supplier_id, supplierName: h.supplier_name,
    status: h.status, expectedAt: h.expected_at, createdAt: h.created_at,
    lines: lines.rows.map((x): PurchaseOrderLine => ({
      id: x.id, variantId: x.variant_id, sku: x.sku, productName: x.product_name,
      quantityOrdered: x.quantity_ordered, quantityReceived: x.quantity_received,
      unitCost: x.unit_cost === null ? null : Number(x.unit_cost),
    })),
  };
}

export async function listReorderSuggestions(): Promise<ReorderSuggestion[]> {
  // Kriterium wie categoryRollup „kritisch": on_hand (über alle Lager) < Absatz der
  // letzten 90 Tage. Dadurch gilt: Anzahl Zeilen == Σ anzahlKritisch des Rollups.
  const r = await pool.query(
    `WITH sold AS (
       SELECT l.variant_id, SUM(l.quantity)::int AS units
         FROM sales_order_lines l JOIN sales_orders o ON o.id = l.order_id
        WHERE COALESCE(o.placed_at, o.created_at)::date >= CURRENT_DATE - 90
          AND o.status NOT IN ('angebot','storniert')
        GROUP BY l.variant_id
     ),
     stock AS (
       SELECT variant_id, SUM(quantity_on_hand)::int AS on_hand FROM stock_levels GROUP BY variant_id
     )
     SELECT v.id AS variant_id, v.sku, p.name AS product_name,
            COALESCE(st.on_hand, 0)::int AS on_hand, sd.units::int AS units_90d,
            p.default_supplier_id, sup.name AS default_supplier_name
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       JOIN sold sd ON sd.variant_id = v.id
       LEFT JOIN stock st ON st.variant_id = v.id
       LEFT JOIN contacts sup ON sup.id = p.default_supplier_id
      WHERE v.is_stock_managed AND sd.units > 0 AND COALESCE(st.on_hand, 0) < sd.units
      ORDER BY (COALESCE(st.on_hand,0)::float / NULLIF(sd.units,0)) ASC, v.sku`);
  return r.rows.map((x) => {
    const onHand = Number(x.on_hand);
    const units90d = Number(x.units_90d);
    return {
      variantId: x.variant_id, sku: x.sku, productName: x.product_name,
      onHand, units90d,
      reichweiteTage: units90d > 0 ? Math.round((onHand * 90) / units90d) : null,
      defaultSupplierId: x.default_supplier_id, defaultSupplierName: x.default_supplier_name,
      suggestedQty: Math.max(1, units90d - onHand),
    };
  });
}

async function defaultWarehouseId(c: PoolClient): Promise<string> {
  const r = await c.query<{ id: string }>('SELECT id FROM warehouses WHERE is_default LIMIT 1');
  if (r.rows.length === 0) throw new Error('Kein Standardlager (is_default) definiert.');
  return r.rows[0].id;
}

export async function adjustStock(
  variantId: string, warehouseId: string, delta: number,
  reason: AdjustmentReason, note: string | null = null,
): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query(
      `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand)
         VALUES ($1,$2,$3)
       ON CONFLICT (variant_id, warehouse_id)
         DO UPDATE SET quantity_on_hand = stock_levels.quantity_on_hand + $3`,
      [variantId, warehouseId, delta]);
    const chk = await c.query<{ quantity_on_hand: number }>(
      `SELECT quantity_on_hand FROM stock_levels WHERE variant_id = $1 AND warehouse_id = $2`,
      [variantId, warehouseId]);
    if (chk.rows[0].quantity_on_hand < 0) throw new Error('Bestand darf nicht negativ werden.');
    await c.query(
      `INSERT INTO stock_adjustments (variant_id, warehouse_id, delta, reason, note)
       VALUES ($1,$2,$3,$4,$5)`,
      [variantId, warehouseId, delta, reason, note]);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

export async function createDraftPurchaseOrder(input: PurchaseOrderInput): Promise<string> {
  const c = await pool.connect();
  let poId: string;
  try {
    await c.query('BEGIN');
    const existing = await c.query<{ number: string }>('SELECT number FROM purchase_orders');
    const number = nextPurchaseOrderNumber(existing.rows.map((x) => x.number), new Date().getFullYear());
    const ins = await c.query(
      `INSERT INTO purchase_orders (number, supplier_id, status, expected_at)
       VALUES ($1,$2,'entwurf',$3) RETURNING id`,
      [number, input.supplierId, input.expectedAt ?? null]);
    poId = ins.rows[0].id as string;
    for (const l of input.lines) {
      await c.query(
        `INSERT INTO purchase_order_lines (purchase_order_id, variant_id, quantity_ordered, unit_cost)
         VALUES ($1,$2,$3,$4)`,
        [poId, l.variantId, l.quantityOrdered, l.unitCost ?? null]);
    }
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
  return poId;
}

export async function markPurchaseOrderOrdered(poId: string): Promise<void> {
  const r = await pool.query(
    `UPDATE purchase_orders SET status = 'bestellt' WHERE id = $1 AND status = 'entwurf'`, [poId]);
  if (r.rowCount === 0) throw new Error('Nur Entwürfe können bestellt werden.');
}

export async function cancelPurchaseOrder(poId: string): Promise<void> {
  const r = await pool.query(
    `UPDATE purchase_orders SET status = 'storniert' WHERE id = $1 AND status IN ('entwurf','bestellt')`, [poId]);
  if (r.rowCount === 0) throw new Error('Nur Entwürfe oder bestellte Bestellungen können storniert werden.');
}

// Wareneingang: bucht ins Standardlager (§0.4). Pro Position ein eigener VALUES-Upsert
// → der Aggregations-Trap greift hier nicht (keine INSERT..SELECT-Mehrfachtreffer).
export async function receiveGoods(poId: string, receipts: GoodsReceipt[]): Promise<void> {
  // Kein Eingang (leer / nur 0-Mengen) → No-Op, damit der PO-Status nicht ohne
  // tatsächlichen Wareneingang auf teilweise_eingegangen kippt.
  if (!receipts.some((r) => r.quantity > 0)) return;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const po = await c.query<{ status: string }>(
      `SELECT status FROM purchase_orders WHERE id = $1 FOR UPDATE`, [poId]);
    if (po.rows.length === 0) throw new Error('Bestellung nicht gefunden.');
    if (!['bestellt', 'teilweise_eingegangen'].includes(po.rows[0].status)) {
      throw new Error('Nur bestellte Bestellungen können eingebucht werden.');
    }
    const wh = await defaultWarehouseId(c);
    for (const rc of receipts) {
      if (rc.quantity <= 0) continue;
      const line = await c.query<{ variant_id: string; quantity_ordered: number; quantity_received: number }>(
        `SELECT variant_id, quantity_ordered, quantity_received
           FROM purchase_order_lines WHERE id = $1 AND purchase_order_id = $2 FOR UPDATE`,
        [rc.lineId, poId]);
      if (line.rows.length === 0) throw new Error('Position gehört nicht zur Bestellung.');
      const { variant_id, quantity_ordered, quantity_received } = line.rows[0];
      if (quantity_received + rc.quantity > quantity_ordered) {
        throw new Error('Wareneingang übersteigt die bestellte Menge.');
      }
      await c.query(
        `UPDATE purchase_order_lines SET quantity_received = quantity_received + $2 WHERE id = $1`,
        [rc.lineId, rc.quantity]);
      await c.query(
        `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand)
           VALUES ($1,$2,$3)
         ON CONFLICT (variant_id, warehouse_id)
           DO UPDATE SET quantity_on_hand = stock_levels.quantity_on_hand + $3`,
        [variant_id, wh, rc.quantity]);
    }
    const agg = await c.query<{ ordered: number; received: number }>(
      `SELECT COALESCE(SUM(quantity_ordered),0)::int AS ordered,
              COALESCE(SUM(quantity_received),0)::int AS received
         FROM purchase_order_lines WHERE purchase_order_id = $1`, [poId]);
    const done = agg.rows[0].received >= agg.rows[0].ordered;
    await c.query(`UPDATE purchase_orders SET status = $2 WHERE id = $1`,
      [poId, done ? 'abgeschlossen' : 'teilweise_eingegangen']);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}
