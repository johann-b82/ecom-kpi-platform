// DoD-Seed Verfügbarkeit: 3 Lager (eins is_default, eins konsignation), Bestände
// (SJ-ROT bewusst unter reorder_point=20 für die spätere Meldebestand-Story;
// SJ-ROT in ZWEI Lagern → Mehrlager-Aggregation), eine Korrektur mit Grund.
// Bestände referenzieren Varianten per SKU (Lookup im Seed-Skript).

export interface SeedWarehouse { id: string; name: string; type: 'eigen' | 'konsignation'; isDefault: boolean }
export interface SeedStock { sku: string; warehouseId: string; onHand: number; reserved: number }
export interface SeedAdjustment {
  sku: string; warehouseId: string; delta: number;
  reason: 'inventurdifferenz' | 'bruch_schwund' | 'korrektur_fehlbuchung'; note: string | null;
}

const WH_HAMBURG = '11111111-0000-4000-8000-000000000001';
const WH_MUENCHEN = '11111111-0000-4000-8000-000000000002';
const WH_KONSI = '11111111-0000-4000-8000-000000000003';

export const WAREHOUSES: SeedWarehouse[] = [
  { id: WH_HAMBURG, name: 'Lager Hamburg', type: 'eigen', isDefault: true },
  { id: WH_MUENCHEN, name: 'Lager München', type: 'eigen', isDefault: false },
  { id: WH_KONSI, name: 'Konsignation Sternenjäger', type: 'konsignation', isDefault: false },
];

export const STOCK: SeedStock[] = [
  { sku: 'SJ-ROT', warehouseId: WH_HAMBURG, onHand: 8, reserved: 0 },   // unter reorder_point
  { sku: 'SJ-ROT', warehouseId: WH_MUENCHEN, onHand: 4, reserved: 0 },  // Mehrlager (#12)
  { sku: 'SJ-BLAU', warehouseId: WH_HAMBURG, onHand: 40, reserved: 0 },
  { sku: 'BK-CLASSIC', warehouseId: WH_HAMBURG, onHand: 60, reserved: 0 },
  { sku: 'WB-01', warehouseId: WH_KONSI, onHand: 12, reserved: 0 },
];

export const ADJUSTMENTS: SeedAdjustment[] = [
  { sku: 'SJ-ROT', warehouseId: WH_HAMBURG, delta: -2, reason: 'bruch_schwund', note: 'Transportschaden Palette 7' },
];

export interface SeedPurchaseOrder {
  id: string; number: string; supplierName: string;
  status: 'entwurf' | 'bestellt' | 'teilweise_eingegangen' | 'abgeschlossen' | 'storniert';
  expectedAt: string | null;
  lines: { id: string; sku: string; quantityOrdered: number; quantityReceived: number; unitCost: number }[];
}

const PO_ROT = '22222222-0000-4000-8000-000000000001';
export const PURCHASE_ORDERS: SeedPurchaseOrder[] = [
  {
    id: PO_ROT, number: 'B-2026-0001', supplierName: 'Guangzhou ToyCraft Ltd.',
    status: 'teilweise_eingegangen', expectedAt: '2026-07-28',
    lines: [
      { id: '22222222-0000-4000-8000-000000000101', sku: 'SJ-ROT', quantityOrdered: 50, quantityReceived: 20, unitCost: 4.20 },
    ],
  },
];
