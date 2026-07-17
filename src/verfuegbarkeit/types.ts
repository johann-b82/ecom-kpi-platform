export type AdjustmentReason = 'inventurdifferenz' | 'bruch_schwund' | 'korrektur_fehlbuchung';
export type PurchaseOrderStatus =
  | 'entwurf' | 'bestellt' | 'teilweise_eingegangen' | 'abgeschlossen' | 'storniert';

// ── Bestand ──
export interface StockRow {
  variantId: string; sku: string; productName: string;
  onHand: number; reserved: number; available: number;
  reorderPoint: number; belowReorder: boolean;
}

// Sortierbare Spalten der Bestandsliste (client- und server-seitig geteilt).
export const STOCK_SORT = {
  allowed: ['sku', 'product', 'available', 'reserved', 'reorder'] as const,
  fallback: { col: 'sku', dir: 'asc' } as import('@/lib/sort').Sort,
};
export interface WarehouseStock { warehouseId: string; warehouseName: string; onHand: number; reserved: number }
export interface StockAdjustmentRow {
  id: string; warehouseId: string; delta: number; reason: AdjustmentReason; note: string | null; createdAt: string;
}
export interface VariantStockDetail {
  variantId: string; sku: string; productName: string; reorderPoint: number;
  perWarehouse: WarehouseStock[]; adjustments: StockAdjustmentRow[];
}
export interface WarehouseOption { id: string; name: string }

// ── Wareneingang / Bestellungen ──
export interface PurchaseOrderRow {
  id: string; number: string; supplierName: string; status: PurchaseOrderStatus;
  expectedAt: string | null; ordered: number; received: number;
}
export interface PurchaseOrderLine {
  id: string; variantId: string; sku: string; productName: string;
  quantityOrdered: number; quantityReceived: number; unitCost: number | null;
}
export interface PurchaseOrderDetail {
  id: string; number: string; supplierId: string; supplierName: string;
  status: PurchaseOrderStatus; expectedAt: string | null; createdAt: string; lines: PurchaseOrderLine[];
}
export interface PurchaseOrderLineInput { variantId: string; quantityOrdered: number; unitCost?: number | null }
export interface PurchaseOrderInput { supplierId: string; expectedAt?: string | null; lines: PurchaseOrderLineInput[] }
export interface GoodsReceipt { lineId: string; quantity: number }

// ── Meldebestand ──
export interface ReorderSuggestion {
  variantId: string; sku: string; productName: string; reorderPoint: number; available: number;
  defaultSupplierId: string | null; defaultSupplierName: string | null; suggestedQty: number;
}
export interface SupplierOption { id: string; name: string }

// ── Bestandsverlauf / Prognose ──
export interface SeriesPoint { date: string; value: number }
export interface VariantForecastInput {
  variantId: string; sku: string; productName: string;
  onHand: number; reorderPoint: number; unitsInWindow: number;
}
