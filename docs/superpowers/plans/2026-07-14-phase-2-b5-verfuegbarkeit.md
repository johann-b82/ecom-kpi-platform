# B5 — Verfügbarkeit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Verfügbarkeit module UI — stock overview, per-warehouse correction, goods-receipt against purchase orders, and a reorder-point view that drafts purchase orders — on top of the B1 schema and B2 side-effect writers.

**Architecture:** Follows the frozen Phase-2 pattern: `src/verfuegbarkeit/{types,repository,number,labels}.ts` (raw `pg` pool, `snake_case→camelCase` mappers), Server Actions in `src/app/(shell)/verfuegbarkeit/actions.ts` gating on `requireAppAccess('verfuegbarkeit','edit')`, and `'use client'` list→detail components under `src/components/`. All stock writes go through gated, transactional repository functions. No new tables (B1 created them); no REST.

**Tech Stack:** Next.js App Router (server components + server actions), TypeScript, raw `pg`, Vitest (`fileParallelism: false`), Tailwind (warm `neutral` + `--accent`).

## Global Constraints

- **Design system (binding):** accent only via `--accent`; warm `neutral` scale only (no gray/slate/zinc/stone, no pure white/black outside `neutral-0`/`neutral-950`); `.anno` for UPPERCASE micro-labels; `dark:` variants required; no component library — repeat Tailwind strings as local consts. Reuse existing idioms (`bg-accent`, `text-brand`, `bg-danger`, table/chip/input strings from `VerkaufList`/`VerkaufDetail`).
- **App-access trap:** `requireAppAccess` has **no** admin bypass; access is only via `group_app_access`. Every new app must be granted idempotently to **all** groups.
- **Transaction + aggregation traps (from B2):** every stock mutation runs in one `pool.connect()` + `BEGIN/COMMIT` with `c.release()` in `finally`; any single `INSERT..SELECT..ON CONFLICT` that could hit the same `(variant_id, warehouse_id)` twice must aggregate per variant. (Per-line loops with separate `INSERT..VALUES` upserts are inherently safe.)
- **Stück, nicht Geld:** Verfügbarkeit shows quantities; **no** Netto labels, no money math.
- **Wareneingang books into the `is_default` warehouse** (B2-style simplicity); receiving does **not** release reservations.
- **Help DoD:** new app needs a `group:'module'` help page with **slug = app key** (`verfuegbarkeit`), or `tests/lib/help-content.test.ts` fails.
- **Deploy only on bryx-test** (`/opt/budp-dev/deploy.sh`) — **never** production. Tests run locally (`npx vitest`).
- **PG date/uuid:** timestamps selected as `::text`; UUIDs `gen_random_uuid()` default; `NUMERIC` mapped through `Number()`.

---

### Task 1: App registration, access grant, gate & sidebar

**Files:**
- Modify: `src/lib/apps.ts`
- Modify: `db/schema.sql` (after the existing `verkauf` grant block, ~line 130)
- Create: `src/app/(shell)/verfuegbarkeit/layout.tsx`
- Create: `src/components/VerfuegbarkeitSidebar.tsx`
- Create: `src/app/(shell)/verfuegbarkeit/page.tsx` (placeholder; real content in Task 7)
- Modify: `tests/lib/apps-access.test.ts`
- Modify: `tests/lib/groups.test.ts`

**Interfaces:**
- Produces: `AppKey` now includes `'verfuegbarkeit'`; route `/verfuegbarkeit` gated by `requireAppAccess('verfuegbarkeit')`.

- [ ] **Step 1: Update the two failing test literals first (TDD red)**

In `tests/lib/apps-access.test.ts`, line 7:
```ts
    expect(keys).toEqual(['brickpm', 'kontakte', 'katalog', 'verkauf', 'verfuegbarkeit', 'hilfe']);
```
In `tests/lib/groups.test.ts`, line 26:
```ts
    expect(a.apps).toEqual({ brickpm: 'edit', kontakte: 'edit', katalog: 'edit', verkauf: 'edit', verfuegbarkeit: 'edit', hilfe: 'edit' });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/apps-access.test.ts tests/lib/groups.test.ts`
Expected: FAIL — arrays/objects don't yet include `verfuegbarkeit`.

- [ ] **Step 3: Register the app in `src/lib/apps.ts`**

Add to the union (line 4):
```ts
export type AppKey = 'brickpm' | 'kontakte' | 'katalog' | 'hilfe' | 'verkauf' | 'verfuegbarkeit';
```
Add to `APPS` immediately after the `verkauf` entry (keeps `hilfe` last):
```ts
  { key: 'verfuegbarkeit', label: 'Verfügbarkeit', abbr: 'VF', href: '/verfuegbarkeit' },
```

- [ ] **Step 4: Run the two tests to verify they pass**

Run: `npx vitest run tests/lib/apps-access.test.ts tests/lib/groups.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the idempotent access grant to `db/schema.sql`**

Directly after the existing `verkauf` grant block (the `INSERT ... SELECT group_id, 'verkauf', permission ...` ending at ~line 130), append:
```sql
-- Phase 2 / B5: dieselbe „jeder sieht alles"-Regel für Verfügbarkeit — jede Gruppe
-- mit Katalog-Zugriff erhält denselben Zugriff auf Verfügbarkeit. Deckt die realen
-- Gruppen 'Administratoren'/'Nutzer' ab (die nicht über 'Alle Nutzer' laufen).
INSERT INTO group_app_access (group_id, app, permission)
  SELECT group_id, 'verfuegbarkeit', permission FROM group_app_access WHERE app = 'katalog'
  ON CONFLICT (group_id, app) DO NOTHING;
```

- [ ] **Step 6: Create the sidebar `src/components/VerfuegbarkeitSidebar.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/verfuegbarkeit', label: 'Bestand' },
  { href: '/verfuegbarkeit/wareneingang', label: 'Wareneingang' },
  { href: '/verfuegbarkeit/meldebestand', label: 'Meldebestand' },
];

export function VerfuegbarkeitSidebar() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 px-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">Verfügbarkeit</p>
      <ul className="space-y-1">
        {ITEMS.map((it) => {
          const active = it.href === '/verfuegbarkeit'
            ? pathname === '/verfuegbarkeit' || (pathname.startsWith('/verfuegbarkeit/') && !pathname.startsWith('/verfuegbarkeit/wareneingang') && !pathname.startsWith('/verfuegbarkeit/meldebestand'))
            : pathname === it.href || pathname.startsWith(it.href + '/');
          return (
            <li key={it.href}>
              <Link href={it.href} className={`block rounded-md px-3 py-1.5 text-sm ${active
                ? 'bg-accent font-medium text-white'
                : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'}`}>
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 7: Create the gate `src/app/(shell)/verfuegbarkeit/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAppAccess } from '@/lib/groups';
import { VerfuegbarkeitSidebar } from '@/components/VerfuegbarkeitSidebar';

export const dynamic = 'force-dynamic';

export default async function VerfuegbarkeitLayout({ children }: { children: ReactNode }) {
  let ok = false;
  try { await requireAppAccess('verfuegbarkeit'); ok = true; } catch { /* no access */ }
  if (!ok) redirect('/');
  return (
    <div className="flex flex-1 overflow-hidden">
      <VerfuegbarkeitSidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 8: Create the placeholder page `src/app/(shell)/verfuegbarkeit/page.tsx`**

```tsx
export const dynamic = 'force-dynamic';

export default function BestandPage() {
  return <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Bestand</h2>;
}
```

- [ ] **Step 9: Typecheck & commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/lib/apps.ts db/schema.sql src/app/\(shell\)/verfuegbarkeit tests/lib/apps-access.test.ts tests/lib/groups.test.ts src/components/VerfuegbarkeitSidebar.tsx
git commit -m "feat(verfuegbarkeit): App registrieren, Zugriff granten, Gate + Sidebar"
```

---

### Task 2: Types, purchase-order numbering, labels

**Files:**
- Create: `src/verfuegbarkeit/types.ts`
- Create: `src/verfuegbarkeit/number.ts`
- Create: `src/verfuegbarkeit/labels.ts`
- Test: `tests/verfuegbarkeit/number.test.ts`

**Interfaces:**
- Produces: all types below; `nextPurchaseOrderNumber(existing: string[], year: number): string`; `REASON_LABEL`, `PO_STATUS_LABEL`.

- [ ] **Step 1: Write the failing test `tests/verfuegbarkeit/number.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { nextPurchaseOrderNumber } from '@/verfuegbarkeit/number';

describe('nextPurchaseOrderNumber', () => {
  it('startet bei B-<jahr>-0001', () => {
    expect(nextPurchaseOrderNumber([], 2026)).toBe('B-2026-0001');
  });
  it('zählt den höchsten Treffer des Jahres hoch, ignoriert Fremdformate/andere Jahre', () => {
    expect(nextPurchaseOrderNumber(['B-2026-0001', 'B-2026-0007', 'A-2026-0003', 'B-2025-0099'], 2026)).toBe('B-2026-0008');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/verfuegbarkeit/number.test.ts`
Expected: FAIL — module `@/verfuegbarkeit/number` not found.

- [ ] **Step 3: Create `src/verfuegbarkeit/number.ts`**

```ts
/** Nächste Bestellnummer B-<jahr>-#### aus dem bestehenden Satz (Fremdformate/andere Jahre ignoriert). */
export function nextPurchaseOrderNumber(existing: string[], year: number): string {
  const re = new RegExp(`^B-${year}-(\\d+)$`);
  const nums = existing
    .map((n) => re.exec(n))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => parseInt(m[1], 10));
  const next = (nums.length ? Math.max(...nums) : 0) + 1;
  return `B-${year}-${String(next).padStart(4, '0')}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/verfuegbarkeit/number.test.ts`
Expected: PASS.

- [ ] **Step 5: Create `src/verfuegbarkeit/types.ts`**

```ts
export type AdjustmentReason = 'inventurdifferenz' | 'bruch_schwund' | 'korrektur_fehlbuchung';
export type PurchaseOrderStatus =
  | 'entwurf' | 'bestellt' | 'teilweise_eingegangen' | 'abgeschlossen' | 'storniert';

// ── Bestand ──
export interface StockRow {
  variantId: string; sku: string; productName: string;
  onHand: number; reserved: number; available: number;
  reorderPoint: number; belowReorder: boolean;
}
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
```

- [ ] **Step 6: Create `src/verfuegbarkeit/labels.ts`**

```ts
import type { AdjustmentReason, PurchaseOrderStatus } from './types';

export const REASON_LABEL: Record<AdjustmentReason, string> = {
  inventurdifferenz: 'Inventurdifferenz', bruch_schwund: 'Bruch/Schwund',
  korrektur_fehlbuchung: 'Korrektur Fehlbuchung',
};
export const PO_STATUS_LABEL: Record<PurchaseOrderStatus, string> = {
  entwurf: 'Entwurf', bestellt: 'Bestellt', teilweise_eingegangen: 'Teilweise eingegangen',
  abgeschlossen: 'Abgeschlossen', storniert: 'Storniert',
};
```

- [ ] **Step 7: Typecheck & commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/verfuegbarkeit/types.ts src/verfuegbarkeit/number.ts src/verfuegbarkeit/labels.ts tests/verfuegbarkeit/number.test.ts
git commit -m "feat(verfuegbarkeit): Typen, Bestellnummerierung, Labels"
```

---

### Task 3: Repository — read functions

**Files:**
- Create: `src/verfuegbarkeit/repository.ts`
- Test: `tests/verfuegbarkeit/repository.test.ts`

**Interfaces:**
- Consumes: types from Task 2; `pool` from `@/lib/db`.
- Produces: `listStock()`, `getVariantStock(id)`, `listWarehouses()`, `listPurchaseOrders()`, `getPurchaseOrder(id)`, `listReorderSuggestions()`, `listSuppliers()`.

- [ ] **Step 1: Write the failing test `tests/verfuegbarkeit/repository.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import {
  listStock, getVariantStock, listWarehouses, listReorderSuggestions,
} from '@/verfuegbarkeit/repository';

async function variantId(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  return r.rows[0].id;
}

beforeAll(async () => { await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit(); });
afterAll(async () => { await pool.end(); });

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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/verfuegbarkeit/repository.test.ts`
Expected: FAIL — `@/verfuegbarkeit/repository` exports not found.

- [ ] **Step 3: Create `src/verfuegbarkeit/repository.ts` with the read functions**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/verfuegbarkeit/repository.test.ts`
Expected: PASS (all four read tests).

- [ ] **Step 5: Commit**

```bash
git add src/verfuegbarkeit/repository.ts tests/verfuegbarkeit/repository.test.ts
git commit -m "feat(verfuegbarkeit): lesendes Repository (Bestand, Bestellungen, Meldebestand)"
```

---

### Task 4: Repository — write functions (adjust, draft PO, order, receive, cancel)

**Files:**
- Modify: `src/verfuegbarkeit/repository.ts`
- Test: `tests/verfuegbarkeit/repository.test.ts` (append a `write` describe block)

**Interfaces:**
- Consumes: `nextPurchaseOrderNumber` (Task 2), read `getPurchaseOrder`/`getVariantStock` (Task 3).
- Produces: `adjustStock(variantId, warehouseId, delta, reason, note?)`, `createDraftPurchaseOrder(input): Promise<string>`, `markPurchaseOrderOrdered(poId)`, `receiveGoods(poId, receipts)`, `cancelPurchaseOrder(poId)`.

- [ ] **Step 1: Append failing tests to `tests/verfuegbarkeit/repository.test.ts`**

Add these imports to the existing import from `@/verfuegbarkeit/repository`:
```ts
import {
  adjustStock, createDraftPurchaseOrder, markPurchaseOrderOrdered, receiveGoods,
  cancelPurchaseOrder, getPurchaseOrder,
} from '@/verfuegbarkeit/repository';
```
Add a supplier lookup helper and a cleanup list near the top (after `variantId`):
```ts
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
```
Extend `afterAll` to clean up created POs **before** `pool.end()`:
```ts
afterAll(async () => {
  for (const id of createdPoIds) {
    await pool.query('DELETE FROM purchase_order_lines WHERE purchase_order_id = $1', [id]);
    await pool.query('DELETE FROM purchase_orders WHERE id = $1', [id]);
  }
  await pool.end();
});
```
Then append the describe block:
```ts
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
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run tests/verfuegbarkeit/repository.test.ts`
Expected: FAIL — write functions not exported.

- [ ] **Step 3: Append the write functions to `src/verfuegbarkeit/repository.ts`**

Add imports at the top of the file:
```ts
import type { PoolClient } from 'pg';
import { nextPurchaseOrderNumber } from './number';
import type { AdjustmentReason, PurchaseOrderInput, GoodsReceipt } from './types';
```
Append:
```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/verfuegbarkeit/repository.test.ts`
Expected: PASS (read + write).

- [ ] **Step 5: Commit**

```bash
git add src/verfuegbarkeit/repository.ts tests/verfuegbarkeit/repository.test.ts
git commit -m "feat(verfuegbarkeit): schreibendes Repository (Korrektur, Bestellung, Wareneingang)"
```

---

### Task 5: Server actions

**Files:**
- Create: `src/app/(shell)/verfuegbarkeit/actions.ts`
- Test: `tests/verfuegbarkeit/actions.test.ts`

**Interfaces:**
- Consumes: repository writers (Task 4).
- Produces: `adjustStockAction`, `createDraftPurchaseOrderAction (→ poId)`, `markPurchaseOrderOrderedAction`, `receiveGoodsAction`, `cancelPurchaseOrderAction`.

- [ ] **Step 1: Write the failing test `tests/verfuegbarkeit/actions.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/verfuegbarkeit/repository', () => ({
  adjustStock: vi.fn(),
  createDraftPurchaseOrder: vi.fn(async () => 'po-1'),
  markPurchaseOrderOrdered: vi.fn(),
  receiveGoods: vi.fn(),
  cancelPurchaseOrder: vi.fn(),
}));

import {
  adjustStockAction, createDraftPurchaseOrderAction, receiveGoodsAction, cancelPurchaseOrderAction,
} from '@/app/(shell)/verfuegbarkeit/actions';
import { requireAppAccess } from '@/lib/groups';
import * as repo from '@/verfuegbarkeit/repository';

beforeEach(() => vi.clearAllMocks());

describe('verfuegbarkeit actions', () => {
  it('adjustStockAction gated auf verfuegbarkeit/edit und ruft Repo', async () => {
    await adjustStockAction('v1', 'w1', -2, 'bruch_schwund', 'x');
    expect(requireAppAccess).toHaveBeenCalledWith('verfuegbarkeit', 'edit');
    expect(repo.adjustStock).toHaveBeenCalledWith('v1', 'w1', -2, 'bruch_schwund', 'x');
  });
  it('createDraftPurchaseOrderAction gibt die neue PO-Id zurück', async () => {
    const id = await createDraftPurchaseOrderAction({ supplierId: 's1', lines: [{ variantId: 'v1', quantityOrdered: 5 }] });
    expect(id).toBe('po-1');
    expect(requireAppAccess).toHaveBeenCalledWith('verfuegbarkeit', 'edit');
  });
  it('receiveGoodsAction reicht die receipts durch', async () => {
    await receiveGoodsAction('po1', [{ lineId: 'l1', quantity: 3 }]);
    expect(repo.receiveGoods).toHaveBeenCalledWith('po1', [{ lineId: 'l1', quantity: 3 }]);
  });
  it('cancelPurchaseOrderAction ist gated', async () => {
    await cancelPurchaseOrderAction('po1');
    expect(requireAppAccess).toHaveBeenCalledWith('verfuegbarkeit', 'edit');
    expect(repo.cancelPurchaseOrder).toHaveBeenCalledWith('po1');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/verfuegbarkeit/actions.test.ts`
Expected: FAIL — actions module not found.

- [ ] **Step 3: Create `src/app/(shell)/verfuegbarkeit/actions.ts`**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireAppAccess } from '@/lib/groups';
import {
  adjustStock, createDraftPurchaseOrder, markPurchaseOrderOrdered, receiveGoods, cancelPurchaseOrder,
} from '@/verfuegbarkeit/repository';
import type { AdjustmentReason, PurchaseOrderInput, GoodsReceipt } from '@/verfuegbarkeit/types';

export async function adjustStockAction(
  variantId: string, warehouseId: string, delta: number, reason: AdjustmentReason, note?: string,
): Promise<void> {
  await requireAppAccess('verfuegbarkeit', 'edit');
  await adjustStock(variantId, warehouseId, delta, reason, note ?? null);
  revalidatePath('/verfuegbarkeit');
  revalidatePath(`/verfuegbarkeit/${variantId}`);
}

export async function createDraftPurchaseOrderAction(input: PurchaseOrderInput): Promise<string> {
  await requireAppAccess('verfuegbarkeit', 'edit');
  const id = await createDraftPurchaseOrder(input);
  revalidatePath('/verfuegbarkeit/wareneingang');
  revalidatePath('/verfuegbarkeit/meldebestand');
  return id;
}

export async function markPurchaseOrderOrderedAction(poId: string): Promise<void> {
  await requireAppAccess('verfuegbarkeit', 'edit');
  await markPurchaseOrderOrdered(poId);
  revalidatePath('/verfuegbarkeit/wareneingang');
  revalidatePath(`/verfuegbarkeit/wareneingang/${poId}`);
}

export async function receiveGoodsAction(poId: string, receipts: GoodsReceipt[]): Promise<void> {
  await requireAppAccess('verfuegbarkeit', 'edit');
  await receiveGoods(poId, receipts);
  revalidatePath('/verfuegbarkeit');
  revalidatePath('/verfuegbarkeit/wareneingang');
  revalidatePath(`/verfuegbarkeit/wareneingang/${poId}`);
}

export async function cancelPurchaseOrderAction(poId: string): Promise<void> {
  await requireAppAccess('verfuegbarkeit', 'edit');
  await cancelPurchaseOrder(poId);
  revalidatePath('/verfuegbarkeit/wareneingang');
  revalidatePath(`/verfuegbarkeit/wareneingang/${poId}`);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/verfuegbarkeit/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(shell\)/verfuegbarkeit/actions.ts tests/verfuegbarkeit/actions.test.ts
git commit -m "feat(verfuegbarkeit): Server Actions (gated) für Korrektur, Bestellung, Wareneingang"
```

---

### Task 6: Seed — a partially-received purchase order

**Files:**
- Modify: `src/verfuegbarkeit/seed-data.ts`
- Modify: `scripts/seed-verfuegbarkeit.ts`

**Interfaces:**
- Consumes: existing `seedVerfuegbarkeit()` structure.
- Produces: seeded PO `B-2026-0001` (Guangzhou ToyCraft, SJ-ROT 50 ordered / 20 received, status `teilweise_eingegangen`) so Wareneingang has a live case.

- [ ] **Step 1: Append the seed data to `src/verfuegbarkeit/seed-data.ts`**

```ts
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
```

- [ ] **Step 2: Extend `scripts/seed-verfuegbarkeit.ts`**

Add to the import (line 2):
```ts
import { WAREHOUSES, STOCK, ADJUSTMENTS, PURCHASE_ORDERS } from '../src/verfuegbarkeit/seed-data';
```
Add a supplier lookup helper next to `variantIdBySku`:
```ts
async function contactIdByName(name: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM contacts WHERE name = $1', [name]);
  if (r.rows.length === 0) throw new Error(`Unbekannter Kontakt im Seed: ${name}`);
  return r.rows[0].id;
}
```
Inside `seedVerfuegbarkeit()`, after the `ADJUSTMENTS` loop and before the `console.log`:
```ts
  for (const po of PURCHASE_ORDERS) {
    const supplierId = await contactIdByName(po.supplierName);
    await pool.query(
      `INSERT INTO purchase_orders (id, number, supplier_id, status, expected_at)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET number=excluded.number, supplier_id=excluded.supplier_id,
         status=excluded.status, expected_at=excluded.expected_at`,
      [po.id, po.number, supplierId, po.status, po.expectedAt]);
    for (const l of po.lines) {
      const vid = await variantIdBySku(l.sku);
      await pool.query(
        `INSERT INTO purchase_order_lines (id, purchase_order_id, variant_id, quantity_ordered, quantity_received, unit_cost)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (id) DO UPDATE SET quantity_ordered=excluded.quantity_ordered,
           quantity_received=excluded.quantity_received, unit_cost=excluded.unit_cost`,
        [l.id, po.id, vid, l.quantityOrdered, l.quantityReceived, l.unitCost]);
    }
  }
```

- [ ] **Step 3: Verify the seed still runs cleanly (via the repository test that calls it)**

Run: `npx vitest run tests/verfuegbarkeit/repository.test.ts`
Expected: PASS — `beforeAll` runs `seedVerfuegbarkeit()` including the new PO without FK errors.

- [ ] **Step 4: Commit**

```bash
git add src/verfuegbarkeit/seed-data.ts scripts/seed-verfuegbarkeit.ts
git commit -m "feat(verfuegbarkeit): Seed-Bestellung (teilweise eingegangen) für den Wareneingang"
```

---

### Task 7: UI — Bestandsübersicht & Varianten-Detail

**Files:**
- Modify: `src/app/(shell)/verfuegbarkeit/page.tsx` (replace placeholder)
- Create: `src/components/BestandListe.tsx`
- Create: `src/app/(shell)/verfuegbarkeit/[variantId]/page.tsx`
- Create: `src/components/BestandDetail.tsx`

**Interfaces:**
- Consumes: `listStock`, `getVariantStock`, `listWarehouses` (Task 3); `adjustStockAction` (Task 5); `REASON_LABEL` (Task 2).

- [ ] **Step 1: Replace `src/app/(shell)/verfuegbarkeit/page.tsx`**

```tsx
import { listStock } from '@/verfuegbarkeit/repository';
import { BestandListe } from '@/components/BestandListe';

export const dynamic = 'force-dynamic';

export default async function BestandPage() {
  const rows = await listStock();
  const belowCount = rows.filter((r) => r.belowReorder).length;
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Bestand</h2>
      <BestandListe rows={rows} belowCount={belowCount} />
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/BestandListe.tsx`**

```tsx
'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { StockRow } from '@/verfuegbarkeit/types';

export function BestandListe({ rows, belowCount }: { rows: StockRow[]; belowCount: number }) {
  const [q, setQ] = useState('');
  const filtered = rows.filter((r) =>
    !q || `${r.sku} ${r.productName}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="SKU oder Artikel …"
          className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100" />
        <span className="anno text-neutral-500">{belowCount} unter Meldebestand</span>
      </div>
      <table className="w-full text-sm">
        <thead><tr className="anno text-left text-neutral-500">
          <th className="py-2">SKU</th><th>Artikel</th>
          <th className="text-right">Verfügbar</th><th className="text-right">Reserviert</th>
          <th className="text-right">Meldebestand</th>
        </tr></thead>
        <tbody>
          {filtered.map((r) => (
            <tr key={r.variantId} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">
                <Link href={`/verfuegbarkeit/${r.variantId}`} className="text-brand hover:text-brand-dark">{r.sku}</Link>
              </td>
              <td>{r.productName}</td>
              <td className="text-right">
                {r.belowReorder
                  ? <span className="rounded bg-accent/15 px-2 py-0.5 font-medium text-accent">{r.available}</span>
                  : r.available}
              </td>
              <td className="text-right text-neutral-500">{r.reserved}</td>
              <td className="text-right text-neutral-500">{r.reorderPoint > 0 ? r.reorderPoint : '—'}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-neutral-500">Keine Artikel.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/(shell)/verfuegbarkeit/[variantId]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { getVariantStock, listWarehouses } from '@/verfuegbarkeit/repository';
import { BestandDetail } from '@/components/BestandDetail';

export const dynamic = 'force-dynamic';

export default async function VariantStockPage({ params }: { params: { variantId: string } }) {
  const detail = await getVariantStock(params.variantId);
  if (!detail) notFound();
  const warehouses = await listWarehouses();
  return <BestandDetail detail={detail} warehouses={warehouses} />;
}
```

- [ ] **Step 4: Create `src/components/BestandDetail.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { VariantStockDetail, WarehouseOption, AdjustmentReason } from '@/verfuegbarkeit/types';
import { REASON_LABEL } from '@/verfuegbarkeit/labels';
import { adjustStockAction } from '@/app/(shell)/verfuegbarkeit/actions';

const REASONS: AdjustmentReason[] = ['inventurdifferenz', 'bruch_schwund', 'korrektur_fehlbuchung'];

export function BestandDetail({ detail, warehouses }: { detail: VariantStockDetail; warehouses: WarehouseOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [warehouseId, setWarehouseId] = useState(warehouses[0]?.id ?? '');
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState<AdjustmentReason>('inventurdifferenz');
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = () => {
    const d = parseInt(delta, 10);
    if (!warehouseId || Number.isNaN(d) || d === 0) { setError('Lager und eine Menge ≠ 0 angeben.'); return; }
    setError(null);
    start(async () => {
      try {
        await adjustStockAction(detail.variantId, warehouseId, d, reason, note || undefined);
        setDelta(''); setNote(''); router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    });
  };

  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/verfuegbarkeit" className="text-brand hover:text-brand-dark">← Bestand</Link>
        <h2 className="text-xl font-bold tracking-tight">{detail.sku}</h2>
        <span className="text-neutral-500">{detail.productName}</span>
        <span className="anno ml-auto text-neutral-500">Meldebestand {detail.reorderPoint > 0 ? detail.reorderPoint : '—'}</span>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="anno mb-2 text-neutral-500">Bestand je Lager</p>
        <table className="w-full text-sm">
          <thead><tr className="anno text-left text-neutral-500">
            <th className="py-1">Lager</th><th className="text-right">Bestand</th><th className="text-right">Reserviert</th>
          </tr></thead>
          <tbody>
            {detail.perWarehouse.map((w) => (
              <tr key={w.warehouseId} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1">{w.warehouseName}</td>
                <td className="text-right">{w.onHand}</td>
                <td className="text-right text-neutral-500">{w.reserved}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="anno mb-2 text-neutral-500">Bestand korrigieren</p>
        <div className="flex flex-wrap items-end gap-2">
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)} className={input}>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
          </select>
          <input type="number" value={delta} onChange={(e) => setDelta(e.target.value)} placeholder="±Menge" className={`${input} w-24`} />
          <select value={reason} onChange={(e) => setReason(e.target.value as AdjustmentReason)} className={input}>
            {REASONS.map((r) => <option key={r} value={r}>{REASON_LABEL[r]}</option>)}
          </select>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Notiz (optional)" className={`${input} flex-1`} />
          <button onClick={submit} disabled={pending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Buchen</button>
        </div>
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="anno mb-2 text-neutral-500">Korrektur-Historie</p>
        {detail.adjustments.length === 0
          ? <p className="text-sm text-neutral-500">Keine Korrekturen.</p>
          : (
            <table className="w-full text-sm">
              <tbody>
                {detail.adjustments.map((a) => (
                  <tr key={a.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="py-1 text-neutral-500">{a.createdAt.slice(0, 10)}</td>
                    <td className={a.delta < 0 ? 'text-danger' : ''}>{a.delta > 0 ? `+${a.delta}` : a.delta}</td>
                    <td>{REASON_LABEL[a.reason]}</td>
                    <td className="text-neutral-500">{a.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck & commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/app/\(shell\)/verfuegbarkeit/page.tsx src/app/\(shell\)/verfuegbarkeit/\[variantId\] src/components/BestandListe.tsx src/components/BestandDetail.tsx
git commit -m "feat(verfuegbarkeit): Bestandsübersicht + Varianten-Detail mit Korrektur"
```

---

### Task 8: UI — Wareneingang list & detail

**Files:**
- Create: `src/app/(shell)/verfuegbarkeit/wareneingang/page.tsx`
- Create: `src/components/WareneingangListe.tsx`
- Create: `src/app/(shell)/verfuegbarkeit/wareneingang/[id]/page.tsx`
- Create: `src/components/WareneingangDetail.tsx`

**Interfaces:**
- Consumes: `listPurchaseOrders`, `getPurchaseOrder` (Task 3); `markPurchaseOrderOrderedAction`, `receiveGoodsAction`, `cancelPurchaseOrderAction` (Task 5); `PO_STATUS_LABEL` (Task 2).

- [ ] **Step 1: Create `src/app/(shell)/verfuegbarkeit/wareneingang/page.tsx`**

```tsx
import { listPurchaseOrders } from '@/verfuegbarkeit/repository';
import { WareneingangListe } from '@/components/WareneingangListe';

export const dynamic = 'force-dynamic';

export default async function WareneingangPage() {
  const rows = await listPurchaseOrders();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Wareneingang</h2>
      <WareneingangListe rows={rows} />
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/WareneingangListe.tsx`**

```tsx
'use client';
import Link from 'next/link';
import type { PurchaseOrderRow } from '@/verfuegbarkeit/types';
import { PO_STATUS_LABEL } from '@/verfuegbarkeit/labels';

export function WareneingangListe({ rows }: { rows: PurchaseOrderRow[] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr className="anno text-left text-neutral-500">
        <th className="py-2">Nummer</th><th>Lieferant</th><th>Status</th>
        <th className="text-right">Eingang</th><th>Erwartet</th>
      </tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
            <td className="py-2">
              <Link href={`/verfuegbarkeit/wareneingang/${r.id}`} className="text-brand hover:text-brand-dark">{r.number}</Link>
            </td>
            <td>{r.supplierName}</td>
            <td><span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">{PO_STATUS_LABEL[r.status]}</span></td>
            <td className="text-right text-neutral-500">{r.received}/{r.ordered}</td>
            <td className="text-neutral-500">{r.expectedAt ?? '—'}</td>
          </tr>
        ))}
        {rows.length === 0 && (
          <tr><td colSpan={5} className="py-6 text-center text-neutral-500">Keine Bestellungen.</td></tr>
        )}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Create `src/app/(shell)/verfuegbarkeit/wareneingang/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { getPurchaseOrder } from '@/verfuegbarkeit/repository';
import { WareneingangDetail } from '@/components/WareneingangDetail';

export const dynamic = 'force-dynamic';

export default async function PurchaseOrderPage({ params }: { params: { id: string } }) {
  const po = await getPurchaseOrder(params.id);
  if (!po) notFound();
  return <WareneingangDetail po={po} />;
}
```

- [ ] **Step 4: Create `src/components/WareneingangDetail.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { PurchaseOrderDetail, GoodsReceipt } from '@/verfuegbarkeit/types';
import { PO_STATUS_LABEL } from '@/verfuegbarkeit/labels';
import {
  markPurchaseOrderOrderedAction, receiveGoodsAction, cancelPurchaseOrderAction,
} from '@/app/(shell)/verfuegbarkeit/actions';

export function WareneingangDetail({ po }: { po: PurchaseOrderDetail }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [qty, setQty] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const run = (fn: () => Promise<unknown>) => start(async () => {
    setError(null);
    try { await fn(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  });

  const receive = () => {
    const receipts: GoodsReceipt[] = po.lines
      .map((l) => ({ lineId: l.id, quantity: parseInt(qty[l.id] ?? '', 10) }))
      .filter((r) => Number.isFinite(r.quantity) && r.quantity > 0);
    if (receipts.length === 0) { setError('Mindestens eine Eingangsmenge angeben.'); return; }
    run(async () => { await receiveGoodsAction(po.id, receipts); setQty({}); });
  };

  const canOrder = po.status === 'entwurf';
  const canReceive = po.status === 'bestellt' || po.status === 'teilweise_eingegangen';
  const canCancel = po.status === 'entwurf' || po.status === 'bestellt';
  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/verfuegbarkeit/wareneingang" className="text-brand hover:text-brand-dark">← Wareneingang</Link>
        <h2 className="text-xl font-bold tracking-tight">{po.number}</h2>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-sm dark:bg-neutral-800">{PO_STATUS_LABEL[po.status]}</span>
        <span className="text-neutral-500">{po.supplierName}</span>
        <div className="ml-auto flex items-center gap-2">
          {canOrder && (
            <button onClick={() => run(() => markPurchaseOrderOrderedAction(po.id))} disabled={pending}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Bestellung auslösen</button>
          )}
          {canCancel && (
            <button onClick={() => run(() => cancelPurchaseOrderAction(po.id))} disabled={pending}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">Stornieren</button>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <table className="w-full text-sm">
          <thead><tr className="anno text-left text-neutral-500">
            <th className="py-2">SKU</th><th>Artikel</th>
            <th className="text-right">Bestellt</th><th className="text-right">Eingegangen</th>
            {canReceive && <th className="text-right">Wareneingang</th>}
          </tr></thead>
          <tbody>
            {po.lines.map((l) => {
              const open = l.quantityOrdered - l.quantityReceived;
              return (
                <tr key={l.id} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-2">{l.sku}</td>
                  <td>{l.productName}</td>
                  <td className="text-right">{l.quantityOrdered}</td>
                  <td className="text-right text-neutral-500">{l.quantityReceived}</td>
                  {canReceive && (
                    <td className="text-right">
                      {open > 0
                        ? <input type="number" min={0} max={open} value={qty[l.id] ?? ''}
                            onChange={(e) => setQty({ ...qty, [l.id]: e.target.value })}
                            placeholder={String(open)} className={`${input} w-20 text-right`} />
                        : <span className="text-neutral-500">—</span>}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {canReceive && (
          <div className="mt-3 flex items-center gap-3">
            <button onClick={receive} disabled={pending}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Wareneingang buchen</button>
            <span className="anno text-neutral-500">bucht ins Standardlager</span>
          </div>
        )}
        {error && <p className="mt-2 text-sm text-danger">{error}</p>}
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Typecheck & commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/app/\(shell\)/verfuegbarkeit/wareneingang src/components/WareneingangListe.tsx src/components/WareneingangDetail.tsx
git commit -m "feat(verfuegbarkeit): Wareneingang — Bestell-Liste + Detail (auslösen, buchen, stornieren)"
```

---

### Task 9: UI — Meldebestand-Entwurf (draft PO loop)

**Files:**
- Create: `src/app/(shell)/verfuegbarkeit/meldebestand/page.tsx`
- Create: `src/components/MeldebestandListe.tsx`

**Interfaces:**
- Consumes: `listReorderSuggestions`, `listSuppliers` (Task 3); `createDraftPurchaseOrderAction` (Task 5).

- [ ] **Step 1: Create `src/app/(shell)/verfuegbarkeit/meldebestand/page.tsx`**

```tsx
import { listReorderSuggestions, listSuppliers } from '@/verfuegbarkeit/repository';
import { MeldebestandListe } from '@/components/MeldebestandListe';

export const dynamic = 'force-dynamic';

export default async function MeldebestandPage() {
  const [suggestions, suppliers] = await Promise.all([listReorderSuggestions(), listSuppliers()]);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verfügbarkeit · Meldebestand</h2>
      <MeldebestandListe suggestions={suggestions} suppliers={suppliers} />
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/MeldebestandListe.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ReorderSuggestion, SupplierOption } from '@/verfuegbarkeit/types';
import { createDraftPurchaseOrderAction } from '@/app/(shell)/verfuegbarkeit/actions';

export function MeldebestandListe({ suggestions, suppliers }:
  { suggestions: ReorderSuggestion[]; suppliers: SupplierOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [openId, setOpenId] = useState<string | null>(null);
  const [supplierId, setSupplierId] = useState('');
  const [qty, setQty] = useState('');
  const [error, setError] = useState<string | null>(null);

  const openForm = (s: ReorderSuggestion) => {
    setOpenId(s.variantId);
    setSupplierId(s.defaultSupplierId ?? suppliers[0]?.id ?? '');
    setQty(String(s.suggestedQty));
    setError(null);
  };

  const draft = (s: ReorderSuggestion) => {
    const q = parseInt(qty, 10);
    if (!supplierId || Number.isNaN(q) || q <= 0) { setError('Lieferant und Menge > 0 angeben.'); return; }
    setError(null);
    start(async () => {
      try {
        const poId = await createDraftPurchaseOrderAction({
          supplierId, lines: [{ variantId: s.variantId, quantityOrdered: q, unitCost: null }],
        });
        router.push(`/verfuegbarkeit/wareneingang/${poId}`);
      } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    });
  };

  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  if (suggestions.length === 0) {
    return <p className="text-sm text-neutral-500">Kein Artikel unter Meldebestand.</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead><tr className="anno text-left text-neutral-500">
        <th className="py-2">SKU</th><th>Artikel</th>
        <th className="text-right">Verfügbar</th><th className="text-right">Meldebestand</th><th></th>
      </tr></thead>
      <tbody>
        {suggestions.map((s) => (
          <tr key={s.variantId} className="border-t border-neutral-200 dark:border-neutral-800 align-top">
            <td className="py-2">{s.sku}</td>
            <td>{s.productName}</td>
            <td className="text-right"><span className="rounded bg-accent/15 px-2 py-0.5 font-medium text-accent">{s.available}</span></td>
            <td className="text-right text-neutral-500">{s.reorderPoint}</td>
            <td className="text-right">
              {openId === s.variantId ? (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={input}>
                    {suppliers.map((sup) => <option key={sup.id} value={sup.id}>{sup.name}</option>)}
                  </select>
                  <input type="number" min={1} value={qty} onChange={(e) => setQty(e.target.value)} className={`${input} w-20 text-right`} />
                  <button onClick={() => draft(s)} disabled={pending}
                    className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Entwurf anlegen</button>
                </div>
              ) : (
                <button onClick={() => openForm(s)}
                  className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">Nachbestellung entwerfen</button>
              )}
              {openId === s.variantId && error && <p className="mt-1 text-sm text-danger">{error}</p>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Typecheck & commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/app/\(shell\)/verfuegbarkeit/meldebestand src/components/MeldebestandListe.tsx
git commit -m "feat(verfuegbarkeit): Meldebestand-Entwurf — Nachbestellung als Entwurf-Bestellung"
```

---

### Task 10: Help page, full suite & bryx-test deploy verification

**Files:**
- Modify: `src/lib/help/content.ts` (add `verfuegbarkeit` module page)

**Interfaces:**
- Consumes: nothing new; satisfies `tests/lib/help-content.test.ts` (module page for every app).

- [ ] **Step 1: Run help-content test to confirm it now fails (app registered, page missing)**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: FAIL — no `group:'module'` page with slug `verfuegbarkeit`.

- [ ] **Step 2: Add the help page to `src/lib/help/content.ts`**

Insert this page object immediately after the `verkauf` module page object (the one ending at ~line 163, before the `// ── Administration` comment):
```ts
  {
    slug: 'verfuegbarkeit',
    title: 'Verfügbarkeit',
    summary: 'Bestände, Reservierungen, Wareneingang und Meldebestand — die Versorgungsseite jeder Bestellung.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Verfügbarkeit zeigt je Artikel, wie viel verfügbar ist (Bestand minus Reservierungen) über alle Lager. Reservierungen entstehen automatisch aus dem Verkauf (Auftrag) und werden beim Versand aufgelöst — hier werden sie nur sichtbar.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Bestandsübersicht: eine Zeile je Artikel mit verfügbar, reserviert und Meldebestand — unter dem Meldebestand wird der Artikel markiert.',
            'Varianten-Detail: Bestand je Lager sowie Bestandskorrektur mit Pflicht-Grund (Inventurdifferenz, Bruch/Schwund, Korrektur Fehlbuchung) und Korrektur-Historie.',
            'Wareneingang: Bestellungen von Entwurf über Bestellt bis Teilweise/Abgeschlossen; gebuchte Mengen erhöhen den Bestand im Standardlager.',
            'Meldebestand: alle Artikel unter Meldebestand — „Nachbestellung entwerfen" legt eine Bestellung im Status Entwurf beim (vorbelegten) Lieferanten an.',
          ] },
        ],
      },
      {
        heading: 'Der Beschaffungs-Kreislauf',
        blocks: [
          { type: 'p', text: 'Meldebestand → Entwurf → Bestellung auslösen → Wareneingang buchen → Bestand steigt → der Artikel fällt aus der Meldebestand-Liste. Wareneingang bucht in das Standardlager; ein Lager pro Wareneingang zu wählen ist bewusst noch nicht vorgesehen.' },
        ],
      },
    ],
  },
```

- [ ] **Step 3: Run the help-content test to verify it passes**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS.

- [ ] **Step 4: Run the full suite**

Run: `npx vitest run`
Expected: PASS except the 16 known `tests/db/rls.test.ts` failures that are expected on this Supabase host (see memory `rls-tests-fail-on-supabase`). Confirm no *new* failures and that the five Verfügbarkeit tables remain in the RLS deny-list assertions (they were added in B1).

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(hilfe): Verfügbarkeit-Modulhilfe (Bestand, Wareneingang, Meldebestand)"
```

- [ ] **Step 7: Deploy to bryx-test and verify in the browser (NEVER production)**

Run: `/opt/budp-dev/deploy.sh`
Then, with an admin login (see memory `test-accounts-bryx-test`), verify at `https://bryx-test.lumeapps.de`:
- Rail shows **Verfügbarkeit** (VF); `/verfuegbarkeit` opens the stock overview; SJ-ROT is flagged under Meldebestand.
- Variant detail: per-warehouse breakdown (Hamburg 8, München 4); post a `+5 inventurdifferenz` correction → overview available rises, history shows the row; post `-5` back.
- Wareneingang: seeded `B-2026-0001` shows `20/50` and `Teilweise eingegangen`; book `30` on the SJ-ROT line → status `Abgeschlossen`, overview available for SJ-ROT rises by 30.
- Meldebestand: SJ-ROT listed; „Nachbestellung entwerfen" with prefilled supplier + suggested qty → redirects to a new `entwurf` PO in Wareneingang.
- Browser console clean on each page.

- [ ] **Step 8: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to open the PR (stacked on the B4 branch/PR per the Phase-2 stacking convention).

---

## Self-Review (completed during authoring)

- **Spec coverage:** §1 App-Registrierung → Task 1. §2 Repository/Mutationen → Tasks 2–4. §3 Actions → Task 5. §4.1 Bestandsübersicht/§4.2 Detail → Task 7; §4.3 Wareneingang → Task 8; §4.4 Meldebestand → Task 9. §5 Seed → Task 6. §6 Hilfe (kein Datenmodell-Change) → Task 10. §7 Tests/Verifikation → distributed per task + Task 10 full suite/deploy. §8 Out-of-scope → not built (noted in help copy).
- **Placeholder scan:** no TBD/TODO; every code step shows full code; every reason/label enum is spelled out.
- **Type consistency:** `adjustStock`/`adjustStockAction` signatures match (Task 4/5/7); `createDraftPurchaseOrder` returns `string` (poId) consumed by Task 5 action and Task 9 redirect; `GoodsReceipt {lineId, quantity}` identical across repository, action, and `WareneingangDetail`; `PurchaseOrderStatus`/`AdjustmentReason` unions shared from `types.ts`.
- **Trap coverage:** app-access grant (Task 1 Step 5); transaction + guards in every writer (Task 4); receive-into-default-warehouse per-line loop noted as aggregation-safe.
