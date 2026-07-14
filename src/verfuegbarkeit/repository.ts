import { pool } from '@/lib/db';
import type {
  StockRow, VariantStockDetail, WarehouseStock, StockAdjustmentRow, WarehouseOption,
  PurchaseOrderRow, PurchaseOrderDetail, PurchaseOrderLine, PurchaseOrderStatus,
  ReorderSuggestion, SupplierOption,
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
  const r = await pool.query(
    `SELECT v.id AS variant_id, v.sku, p.name AS product_name, v.reorder_point,
            p.default_supplier_id, sup.name AS default_supplier_name,
            (COALESCE(SUM(s.quantity_on_hand),0) - COALESCE(SUM(s.quantity_reserved),0))::int AS available
       FROM product_variants v
       JOIN products p ON p.id = v.product_id
       LEFT JOIN contacts sup ON sup.id = p.default_supplier_id
       LEFT JOIN stock_levels s ON s.variant_id = v.id
      WHERE v.reorder_point > 0
      GROUP BY v.id, v.sku, p.name, v.reorder_point, p.default_supplier_id, sup.name
     HAVING (COALESCE(SUM(s.quantity_on_hand),0) - COALESCE(SUM(s.quantity_reserved),0)) < v.reorder_point
      ORDER BY v.sku`);
  return r.rows.map((x) => ({
    variantId: x.variant_id, sku: x.sku, productName: x.product_name, reorderPoint: x.reorder_point,
    available: x.available, defaultSupplierId: x.default_supplier_id, defaultSupplierName: x.default_supplier_name,
    suggestedQty: Math.max(1, x.reorder_point * 2 - x.available),
  }));
}
