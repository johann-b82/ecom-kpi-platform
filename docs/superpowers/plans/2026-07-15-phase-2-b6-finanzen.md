# B6 — Finanzen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Finanzen module — offene Posten (Debitor/Kreditor), Zahlungsabgleich that drives the Verkauf-Faden to `bezahlt`, a Zuordnen-Warteschlange for unassigned payments, manual supplier invoices, and a booking-CSV export.

**Architecture:** Frozen Phase-2 pattern: `src/finanzen/{types,labels,format,repository}.ts` (raw `pg`), Server Actions gating on `requireAppAccess('finanzen','edit')`, `'use client'` list→detail UI. The crux is `recordPayment`: settling a debitor open item linked to a sales order drives `transitionOrderStatus(order,'bezahlt')` **atomically** — enabled by giving `transitionOrderStatus` an optional `PoolClient` so it can run inside the caller's transaction.

**Tech Stack:** Next.js App Router (server components + server actions), TypeScript, raw `pg`, Vitest (`fileParallelism: false`), Tailwind (warm `neutral` + `--accent`).

## Global Constraints

- **Design system (binding):** accent only via `--accent`/`bg-accent`/`text-accent`; warm `neutral` scale only (no gray/slate/zinc/stone, no pure white/black outside `neutral-0`/`neutral-950`); `.anno` for UPPERCASE micro-labels; `dark:` variants required; no component library (repeat Tailwind strings / reuse `ChartCard`). `text-danger`/`bg-danger` for **overdue** and negative/attention states. `text-brand hover:text-brand-dark` links; `bg-accent text-white` primary buttons; status chips `bg-neutral-100 dark:bg-neutral-800`.
- **Netto (money module):** all amounts are net (no MwSt); annotate money tiles with `.anno` „NETTO · OHNE MWST". Never compute tax.
- **App-access trap:** grant `finanzen` idempotently to ALL groups in `db/schema.sql` (`SELECT group_id,'finanzen',permission FROM group_app_access WHERE app='katalog' ON CONFLICT DO NOTHING`).
- **Single status bottleneck:** `sales_orders.status` and `sales_order_events` are written ONLY by `transitionOrderStatus`. `recordPayment` drives the `bezahlt` transition through it (with a shared client), never by writing the order/event directly.
- **Overdue derived, not stored:** `overdue = status <> 'bezahlt' AND due_date < CURRENT_DATE`, computed in SQL/UI. Stored status ∈ {offen, teilweise_bezahlt, bezahlt}; the `'ueberfaellig'` CHECK value stays unused.
- **Transaction discipline:** every mutation in one `pool.connect()` + `BEGIN/COMMIT`, `ROLLBACK` on throw, `c.release()` in `finally`.
- **No REST:** the CSV export is a Server Action returning a string; the client builds a Blob download.
- **Env/test:** `DATABASE_URL` only in `.env`, auto-loaded by nothing → prefix DB commands with `set -a; source .env; set +a`. `psql` not installed (use `node -e` + `pg`). Tests: `npx vitest run <file>` (alias `@`→`src`). vitest does NOT typecheck → finish every code task with `npx tsc --noEmit`. Known-red, non-blocking: `tests/db/rls.test.ts` (host caveat). Deploy only on bryx-test (`/opt/budp-dev/deploy.sh`), never production.

---

### Task 1: App registration, access grant, gate & sidebar

**Files:**
- Modify: `src/lib/apps.ts`
- Modify: `db/schema.sql` (after the `verfuegbarkeit` grant block)
- Create: `src/app/(shell)/finanzen/layout.tsx`
- Create: `src/components/FinanzenSidebar.tsx`
- Create: `src/app/(shell)/finanzen/page.tsx` (placeholder; real content Task 9)
- Modify: `tests/lib/apps-access.test.ts`
- Modify: `tests/lib/groups.test.ts`

**Interfaces:**
- Produces: `AppKey` includes `'finanzen'`; route `/finanzen` gated by `requireAppAccess('finanzen')`.

- [ ] **Step 1: Update the two test literals first (TDD red)**

In `tests/lib/apps-access.test.ts` (the admin-sees-every-app case):
```ts
    expect(keys).toEqual(['brickpm', 'kontakte', 'katalog', 'verkauf', 'verfuegbarkeit', 'finanzen', 'hilfe']);
```
In `tests/lib/groups.test.ts` (fresh-install admin apps):
```ts
    expect(a.apps).toEqual({ brickpm: 'edit', kontakte: 'edit', katalog: 'edit', verkauf: 'edit', verfuegbarkeit: 'edit', finanzen: 'edit', hilfe: 'edit' });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/lib/apps-access.test.ts tests/lib/groups.test.ts`
Expected: FAIL — arrays/objects don't include `finanzen`.

- [ ] **Step 3: Register the app in `src/lib/apps.ts`**

Add to the union:
```ts
export type AppKey = 'brickpm' | 'kontakte' | 'katalog' | 'hilfe' | 'verkauf' | 'verfuegbarkeit' | 'finanzen';
```
Add to `APPS` immediately after the `verfuegbarkeit` entry (keeps `hilfe` last):
```ts
  { key: 'finanzen', label: 'Finanzen', abbr: 'FI', href: '/finanzen' },
```

- [ ] **Step 4: Run the two tests to verify they pass**

Run: `npx vitest run tests/lib/apps-access.test.ts tests/lib/groups.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the idempotent grant to `db/schema.sql`**

After the existing `verfuegbarkeit` grant block, append:
```sql
-- Phase 2 / B6: dieselbe „jeder sieht alles"-Regel für Finanzen.
INSERT INTO group_app_access (group_id, app, permission)
  SELECT group_id, 'finanzen', permission FROM group_app_access WHERE app = 'katalog'
  ON CONFLICT (group_id, app) DO NOTHING;
```

- [ ] **Step 6: Create `src/components/FinanzenSidebar.tsx`**

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/finanzen', label: 'Offene Posten' },
  { href: '/finanzen/warteschlange', label: 'Warteschlange' },
  { href: '/finanzen/neu', label: 'Lieferantenrechnung' },
];

export function FinanzenSidebar() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 overflow-y-auto border-r border-neutral-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 px-2 text-sm font-bold text-neutral-900 dark:text-neutral-100">Finanzen</p>
      <ul className="space-y-1">
        {ITEMS.map((it) => {
          const active = it.href === '/finanzen'
            ? pathname === '/finanzen' || (pathname.startsWith('/finanzen/') && !pathname.startsWith('/finanzen/warteschlange') && !pathname.startsWith('/finanzen/neu'))
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

- [ ] **Step 7: Create `src/app/(shell)/finanzen/layout.tsx`**

```tsx
import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { requireAppAccess } from '@/lib/groups';
import { FinanzenSidebar } from '@/components/FinanzenSidebar';

export const dynamic = 'force-dynamic';

export default async function FinanzenLayout({ children }: { children: ReactNode }) {
  let ok = false;
  try { await requireAppAccess('finanzen'); ok = true; } catch { /* no access */ }
  if (!ok) redirect('/');
  return (
    <div className="flex flex-1 overflow-hidden">
      <FinanzenSidebar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
```

- [ ] **Step 8: Create placeholder `src/app/(shell)/finanzen/page.tsx`**

```tsx
export const dynamic = 'force-dynamic';

export default function OffenePostenPage() {
  return <h2 className="text-xl font-bold tracking-tight">Finanzen · Offene Posten</h2>;
}
```

- [ ] **Step 9: Typecheck & commit**

Run: `npx tsc --noEmit`
Expected: no errors.
```bash
git add src/lib/apps.ts db/schema.sql src/app/\(shell\)/finanzen src/components/FinanzenSidebar.tsx tests/lib/apps-access.test.ts tests/lib/groups.test.ts
git commit -m "feat(finanzen): App registrieren, Zugriff granten, Gate + Sidebar"
```

---

### Task 2: `transitionOrderStatus` — optional client (atomic reuse)

**Files:**
- Modify: `src/verkauf/repository.ts` (the `transitionOrderStatus` function, ~lines 165-206)
- Test: `tests/verkauf/repository.test.ts` (append one test)

**Interfaces:**
- Produces: `transitionOrderStatus(orderId: string, target: OrderStatus, client?: PoolClient): Promise<SalesOrderDetail>` — with `client`, runs inside the caller's transaction (no own BEGIN/COMMIT/connect/release); without, unchanged.

- [ ] **Step 1: Append the failing test to `tests/verkauf/repository.test.ts`**

Add `import { pool } from '@/lib/db';` is already present. Add this test inside the existing top-level `describe` block area (after the lifecycle tests). It creates an order at `rechnung_gestellt`, then transitions to `bezahlt` **inside a caller-managed transaction** and proves the caller owns the tx (a rollback undoes it, and a separate connection can't see it pre-commit):
```ts
describe('transitionOrderStatus — optional client', () => {
  it('läuft in der Aufrufer-Transaktion: kein eigenes Commit, Rollback macht alles rückgängig', async () => {
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 1, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'versendet');
    await transitionOrderStatus(o.id, 'rechnung_gestellt');

    const c = await pool.connect();
    try {
      await c.query('BEGIN');
      await transitionOrderStatus(o.id, 'bezahlt', c); // im Aufrufer-Client
      // Innerhalb derselben Transaktion sichtbar:
      const inTx = await c.query<{ status: string }>('SELECT status FROM sales_orders WHERE id=$1', [o.id]);
      expect(inTx.rows[0].status).toBe('bezahlt');
      // Von einer anderen Verbindung (pool) NICHT sichtbar (noch nicht committet):
      const outside = await pool.query<{ status: string }>('SELECT status FROM sales_orders WHERE id=$1', [o.id]);
      expect(outside.rows[0].status).toBe('rechnung_gestellt');
      await c.query('ROLLBACK');
    } finally { c.release(); }

    // Nach Rollback ist der Beleg unverändert rechnung_gestellt:
    const after = await getOrder(o.id);
    expect(after?.status).toBe('rechnung_gestellt');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `set -a; source .env; set +a; npx vitest run tests/verkauf/repository.test.ts`
Expected: FAIL — `transitionOrderStatus` doesn't accept a third argument (the `client` is ignored, it opens its own tx and commits, so the "outside" assertion sees `bezahlt`).

- [ ] **Step 3: Refactor `transitionOrderStatus` in `src/verkauf/repository.ts`**

Add `PoolClient` to the existing `import type { PoolClient } from 'pg';` (already imported at top). Replace the function with:
```ts
export async function transitionOrderStatus(
  orderId: string, target: OrderStatus, client?: PoolClient,
): Promise<SalesOrderDetail> {
  const c = client ?? await pool.connect();
  const ownTx = !client;
  try {
    if (ownTx) await c.query('BEGIN');
    const cur = await c.query<{ status: OrderStatus }>(
      `SELECT status FROM sales_orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (cur.rows.length === 0) throw new Error(`Beleg ${orderId} nicht gefunden.`);
    const from = cur.rows[0].status;
    if (!ALLOWED[from].includes(target)) {
      throw new Error(`Übergang ${from} → ${target} ist nicht erlaubt.`);
    }
    switch (target) {
      case 'auftrag':
        await writeEvent(c, orderId, 'bestellt', 'verkauf');
        await reserveStock(c, orderId);
        break;
      case 'versendet':
        await writeEvent(c, orderId, 'kommissioniert', 'verfuegbarkeit');
        await shipStock(c, orderId);
        break;
      case 'rechnung_gestellt':
        await writeEvent(c, orderId, 'rechnung_gestellt', 'verkauf');
        await createDebitorOpenItem(c, orderId);
        break;
      case 'bezahlt':
        await writeEvent(c, orderId, 'bezahlt', 'finanzen');
        await c.query(`UPDATE open_items SET status = 'bezahlt' WHERE order_id = $1 AND direction = 'debitor'`, [orderId]);
        break;
      case 'storniert':
        if (from === 'auftrag') await releaseReservation(c, orderId);
        break;
    }
    await c.query(`UPDATE sales_orders SET status = $2 WHERE id = $1`, [orderId, target]);
    if (ownTx) await c.query('COMMIT');
    // Hinweis: im Aufrufer-Client-Modus liest getOrder über den pool (separate
    // Verbindung) den noch nicht committeten Stand nicht — der Rückgabewert ist
    // nur im self-managed Modus aussagekräftig. Aufrufer im Client-Modus
    // (recordPayment) ignorieren ihn.
    return (await getOrder(orderId))!;
  } catch (e) {
    if (ownTx) await c.query('ROLLBACK');
    throw e;
  } finally {
    if (ownTx) c.release();
  }
}
```

- [ ] **Step 4: Run the whole verkauf test file to verify green (new test + all existing)**

Run: `set -a; source .env; set +a; npx vitest run tests/verkauf/repository.test.ts`
Expected: PASS — the new test passes and every existing lifecycle/transition test (self-managed mode) is unchanged.

- [ ] **Step 5: Typecheck & commit**

Run: `npx tsc --noEmit`
```bash
git add src/verkauf/repository.ts tests/verkauf/repository.test.ts
git commit -m "refactor(verkauf): transitionOrderStatus akzeptiert optionalen PoolClient (atomare Wiederverwendung)"
```

---

### Task 3: Finanzen types, labels, money format

**Files:**
- Create: `src/finanzen/types.ts`
- Create: `src/finanzen/labels.ts`
- Create: `src/finanzen/format.ts`

**Interfaces:**
- Produces: all types below; `DIRECTION_LABEL`/`OI_STATUS_LABEL`/`METHOD_LABEL`; `eur(amount): string`.

- [ ] **Step 1: Create `src/finanzen/types.ts`**

```ts
export type OpenItemDirection = 'debitor' | 'kreditor';
export type OpenItemStatus = 'offen' | 'teilweise_bezahlt' | 'bezahlt';
export type PaymentMethod = 'ueberweisung' | 'lastschrift' | 'kreditkarte' | 'paypal' | 'sonstige';

export interface OpenItemRow {
  id: string; direction: OpenItemDirection; contactName: string; reference: string | null;
  amount: number; dueDate: string; status: OpenItemStatus;
  paid: number; remaining: number; overdue: boolean;
}
export interface PaymentRow {
  id: string; amount: number; method: PaymentMethod; reference: string | null; paidAt: string;
}
export interface OpenItemDetail {
  id: string; direction: OpenItemDirection; contactId: string; contactName: string;
  reference: string | null; orderId: string | null; orderNumber: string | null; orderStatus: string | null;
  purchaseOrderId: string | null; amount: number; dueDate: string; status: OpenItemStatus;
  paid: number; remaining: number; overdue: boolean; payments: PaymentRow[];
}
export interface PaymentInput {
  amount: number; method: PaymentMethod; reference?: string | null; paidAt?: string | null;
}
export interface UnassignedPayment {
  id: string; amount: number; method: PaymentMethod; reference: string | null; paidAt: string;
}
export interface OpenItemOption { id: string; label: string; contactId: string; remaining: number }
export interface ContactOption { id: string; name: string }
export interface KreditorInvoiceInput {
  supplierId: string; amount: number; dueDate: string; reference: string; purchaseOrderId?: string | null;
}
export interface OpenItemFilter { direction?: OpenItemDirection; onlyOpen?: boolean }
```

- [ ] **Step 2: Create `src/finanzen/labels.ts`**

```ts
import type { OpenItemDirection, OpenItemStatus, PaymentMethod } from './types';

export const DIRECTION_LABEL: Record<OpenItemDirection, string> = { debitor: 'Debitor', kreditor: 'Kreditor' };
export const OI_STATUS_LABEL: Record<OpenItemStatus, string> = {
  offen: 'Offen', teilweise_bezahlt: 'Teilweise bezahlt', bezahlt: 'Bezahlt',
};
export const METHOD_LABEL: Record<PaymentMethod, string> = {
  ueberweisung: 'Überweisung', lastschrift: 'Lastschrift', kreditkarte: 'Kreditkarte',
  paypal: 'PayPal', sonstige: 'Sonstige',
};
```

- [ ] **Step 3: Create `src/finanzen/format.ts`** (module-local, mirrors `verkauf/format.ts`)

```ts
export function eur(amount: number): string {
  return amount.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
}
```

- [ ] **Step 4: Typecheck & commit**

Run: `npx tsc --noEmit`
```bash
git add src/finanzen/types.ts src/finanzen/labels.ts src/finanzen/format.ts
git commit -m "feat(finanzen): Typen, Labels, EUR-Format"
```

---

### Task 4: Repository — read functions

**Files:**
- Create: `src/finanzen/repository.ts`
- Test: `tests/finanzen/repository.test.ts`

**Interfaces:**
- Consumes: types (Task 3); `pool` from `@/lib/db`.
- Produces: `listOpenItems(filter?)`, `getOpenItem(id)`, `listUnassignedPayments()`, `listOpenItemOptions(contactId?)`, `listContactOptions()`.

- [ ] **Step 1: Write the failing test `tests/finanzen/repository.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder, transitionOrderStatus } from '@/verkauf/repository';
import { listOpenItems, getOpenItem, listContactOptions } from '@/finanzen/repository';

const MUELLER = 'c1c1c1c1-0000-4000-8000-000000000001';
const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const orderIds: string[] = [];

async function variantId(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  return r.rows[0].id;
}
// Erzeugt einen Beleg bei rechnung_gestellt → ein offener Debitor-OP entsteht.
async function invoicedOrder(qty: number, price: number): Promise<{ orderId: string; openItemId: string; amount: number }> {
  const o = await createOrder({ contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
    lines: [{ variantId: await variantId('SJ-BLAU'), quantity: qty, unitPrice: price }] });
  orderIds.push(o.id);
  await transitionOrderStatus(o.id, 'versendet');
  await transitionOrderStatus(o.id, 'rechnung_gestellt');
  const oi = await pool.query<{ id: string }>(
    `SELECT id FROM open_items WHERE order_id=$1 AND direction='debitor'`, [o.id]);
  return { orderId: o.id, openItemId: oi.rows[0].id, amount: qty * price };
}

beforeAll(async () => { await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit(); });
afterAll(async () => {
  for (const id of orderIds) {
    await pool.query('DELETE FROM payments WHERE open_item_id IN (SELECT id FROM open_items WHERE order_id=$1)', [id]);
    await pool.query('DELETE FROM open_items WHERE order_id = $1', [id]);
    await pool.query('DELETE FROM sales_orders WHERE id = $1', [id]);
  }
  await pool.end();
});

describe('finanzen repository — read', () => {
  it('listOpenItems liefert den Debitor-Posten mit remaining und overdue=false', async () => {
    const { openItemId, amount } = await invoicedOrder(2, 11.9);
    const rows = await listOpenItems({ direction: 'debitor', onlyOpen: true });
    const row = rows.find((r) => r.id === openItemId);
    expect(row).toBeDefined();
    expect(row!.amount).toBeCloseTo(amount, 2);
    expect(row!.paid).toBe(0);
    expect(row!.remaining).toBeCloseTo(amount, 2);
    expect(row!.overdue).toBe(false); // due_date = heute + payment_terms > heute
  });

  it('getOpenItem liefert Kopf + Belegnummer + leere Zahlungsliste', async () => {
    const { orderId, openItemId } = await invoicedOrder(1, 11.9);
    const detail = await getOpenItem(openItemId);
    expect(detail).not.toBeNull();
    expect(detail!.direction).toBe('debitor');
    expect(detail!.orderId).toBe(orderId);
    expect(detail!.orderNumber).toMatch(/^A-\d{4}-\d{4}$/);
    expect(detail!.payments).toHaveLength(0);
  });

  it('listContactOptions liefert Kontakte', async () => {
    const opts = await listContactOptions();
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.find((o) => o.id === MUELLER)).toBeDefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `set -a; source .env; set +a; npx vitest run tests/finanzen/repository.test.ts`
Expected: FAIL — `@/finanzen/repository` exports not found.

- [ ] **Step 3: Create `src/finanzen/repository.ts` with the read functions**

```ts
import { pool } from '@/lib/db';
import type {
  OpenItemRow, OpenItemDetail, PaymentRow, UnassignedPayment,
  OpenItemOption, ContactOption, OpenItemFilter,
} from './types';

export async function listOpenItems(filter: OpenItemFilter = {}): Promise<OpenItemRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.direction) { params.push(filter.direction); where.push(`oi.direction = $${params.length}`); }
  if (filter.onlyOpen) where.push(`oi.status <> 'bezahlt'`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const r = await pool.query(
    `SELECT oi.id, oi.direction, c.name AS contact_name, oi.reference,
            oi.amount::text AS amount, oi.due_date::text AS due_date, oi.status,
            COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.open_item_id = oi.id), 0)::text AS paid,
            (oi.status <> 'bezahlt' AND oi.due_date < CURRENT_DATE) AS overdue
       FROM open_items oi JOIN contacts c ON c.id = oi.contact_id
       ${clause}
      ORDER BY oi.due_date, oi.created_at`, params);
  return r.rows.map((x) => {
    const amount = Number(x.amount), paid = Number(x.paid);
    return {
      id: x.id, direction: x.direction, contactName: x.contact_name, reference: x.reference,
      amount, dueDate: x.due_date, status: x.status, paid, remaining: amount - paid, overdue: x.overdue,
    };
  });
}

export async function getOpenItem(id: string): Promise<OpenItemDetail | null> {
  const r = await pool.query(
    `SELECT oi.id, oi.direction, oi.contact_id, c.name AS contact_name, oi.reference,
            oi.order_id, so.number AS order_number, so.status AS order_status,
            oi.purchase_order_id, oi.amount::text AS amount, oi.due_date::text AS due_date, oi.status,
            COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.open_item_id = oi.id), 0)::text AS paid,
            (oi.status <> 'bezahlt' AND oi.due_date < CURRENT_DATE) AS overdue
       FROM open_items oi
       JOIN contacts c ON c.id = oi.contact_id
       LEFT JOIN sales_orders so ON so.id = oi.order_id
      WHERE oi.id = $1`, [id]);
  if (r.rows.length === 0) return null;
  const x = r.rows[0];
  const pays = await pool.query(
    `SELECT id, amount::text AS amount, method, external_reference, paid_at::text AS paid_at
       FROM payments WHERE open_item_id = $1 ORDER BY paid_at DESC`, [id]);
  const amount = Number(x.amount), paid = Number(x.paid);
  return {
    id: x.id, direction: x.direction, contactId: x.contact_id, contactName: x.contact_name,
    reference: x.reference, orderId: x.order_id, orderNumber: x.order_number, orderStatus: x.order_status,
    purchaseOrderId: x.purchase_order_id, amount, dueDate: x.due_date, status: x.status,
    paid, remaining: amount - paid, overdue: x.overdue,
    payments: pays.rows.map((p): PaymentRow => ({
      id: p.id, amount: Number(p.amount), method: p.method, reference: p.external_reference, paidAt: p.paid_at,
    })),
  };
}

export async function listUnassignedPayments(): Promise<UnassignedPayment[]> {
  const r = await pool.query(
    `SELECT id, amount::text AS amount, method, external_reference, paid_at::text AS paid_at
       FROM payments WHERE open_item_id IS NULL ORDER BY paid_at DESC`);
  return r.rows.map((x) => ({
    id: x.id, amount: Number(x.amount), method: x.method, reference: x.external_reference, paidAt: x.paid_at,
  }));
}

export async function listOpenItemOptions(contactId?: string): Promise<OpenItemOption[]> {
  const r = await pool.query(
    `SELECT oi.id, oi.contact_id, c.name AS contact_name, oi.reference, oi.direction,
            (oi.amount - COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.open_item_id = oi.id),0))::text AS remaining
       FROM open_items oi JOIN contacts c ON c.id = oi.contact_id
      WHERE oi.status <> 'bezahlt'
      ORDER BY (oi.contact_id = $1) DESC NULLS LAST, oi.due_date`, [contactId ?? null]);
  return r.rows.map((x) => ({
    id: x.id, contactId: x.contact_id, remaining: Number(x.remaining),
    label: `${x.contact_name} · ${x.reference ?? x.direction}`,
  }));
}

export async function listContactOptions(): Promise<ContactOption[]> {
  const r = await pool.query(`SELECT id, name FROM contacts ORDER BY name`);
  return r.rows.map((x) => ({ id: x.id, name: x.name }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `set -a; source .env; set +a; npx vitest run tests/finanzen/repository.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/finanzen/repository.ts tests/finanzen/repository.test.ts
git commit -m "feat(finanzen): lesendes Repository (Offene Posten, Zahlungen, Optionen)"
```

---

### Task 5: Repository — write (recordPayment ↔ Faden, assign, unassigned, kreditor)

**Files:**
- Modify: `src/finanzen/repository.ts`
- Test: `tests/finanzen/repository.test.ts` (append a `write` describe block)

**Interfaces:**
- Consumes: `transitionOrderStatus(orderId, target, client)` (Task 2); read helpers (Task 4).
- Produces: `recordPayment(openItemId, input)`, `assignPayment(paymentId, openItemId)`, `recordUnassignedPayment(input)`, `createKreditorInvoice(input): Promise<string>`.

- [ ] **Step 1: Append failing tests to `tests/finanzen/repository.test.ts`**

Extend the import from `@/finanzen/repository`:
```ts
import {
  listOpenItems, getOpenItem, listContactOptions, listUnassignedPayments,
  recordPayment, assignPayment, recordUnassignedPayment, createKreditorInvoice,
} from '@/finanzen/repository';
import { getOrder } from '@/verkauf/repository';
```
Add a cleanup list for kreditor items and standalone payments near the top:
```ts
const kreditorItemIds: string[] = [];
```
Extend `afterAll` (before `pool.end()`):
```ts
  for (const id of kreditorItemIds) {
    await pool.query('DELETE FROM payments WHERE open_item_id = $1', [id]);
    await pool.query('DELETE FROM open_items WHERE id = $1', [id]);
  }
  await pool.query(`DELETE FROM payments WHERE open_item_id IS NULL AND external_reference LIKE 'TEST-%'`);
```
Append the describe block:
```ts
describe('finanzen repository — write', () => {
  it('recordPayment: Vollausgleich Debitor treibt Beleg auf bezahlt (Faden-Perle) + schließt OP', async () => {
    const { orderId, openItemId, amount } = await invoicedOrder(2, 11.9);
    await recordPayment(openItemId, { amount, method: 'ueberweisung', reference: 'TEST-full' });
    const detail = await getOpenItem(openItemId);
    expect(detail!.status).toBe('bezahlt');
    expect(detail!.remaining).toBeCloseTo(0, 2);
    const order = await getOrder(orderId);
    expect(order!.status).toBe('bezahlt');
    expect(order!.events.some((e) => e.stage === 'bezahlt' && e.sourceApp === 'finanzen')).toBe(true);
  });

  it('recordPayment: Teilzahlung setzt teilweise_bezahlt, Beleg bleibt rechnung_gestellt', async () => {
    const { orderId, openItemId, amount } = await invoicedOrder(2, 11.9);
    await recordPayment(openItemId, { amount: amount / 2, method: 'ueberweisung', reference: 'TEST-part' });
    const detail = await getOpenItem(openItemId);
    expect(detail!.status).toBe('teilweise_bezahlt');
    expect(detail!.remaining).toBeCloseTo(amount / 2, 2);
    expect((await getOrder(orderId))!.status).toBe('rechnung_gestellt');
  });

  it('recordPayment auf bereits bezahltem OP wirft', async () => {
    const { openItemId, amount } = await invoicedOrder(1, 11.9);
    await recordPayment(openItemId, { amount, method: 'ueberweisung', reference: 'TEST-a' });
    await expect(recordPayment(openItemId, { amount: 1, method: 'ueberweisung' })).rejects.toThrow(/bezahlt/i);
  });

  it('createKreditorInvoice legt kreditor-OP an; Vollzahlung schließt ihn ohne Faden', async () => {
    const id = await createKreditorInvoice({
      supplierId: MUELLER, amount: 100, dueDate: '2026-08-31', reference: 'TEST-kred',
    });
    kreditorItemIds.push(id);
    let detail = await getOpenItem(id);
    expect(detail!.direction).toBe('kreditor');
    expect(detail!.orderId).toBeNull();
    await recordPayment(id, { amount: 100, method: 'ueberweisung', reference: 'TEST-kredpay' });
    detail = await getOpenItem(id);
    expect(detail!.status).toBe('bezahlt');
  });

  it('assignPayment: nicht zugeordnete Zahlung zuordnen mündet in den Settle-Pfad', async () => {
    const { orderId, openItemId, amount } = await invoicedOrder(1, 11.9);
    await recordUnassignedPayment({ amount, method: 'ueberweisung', reference: 'TEST-queue' });
    const queued = (await listUnassignedPayments()).find((p) => p.reference === 'TEST-queue')!;
    await assignPayment(queued.id, openItemId);
    expect((await getOpenItem(openItemId))!.status).toBe('bezahlt');
    expect((await getOrder(orderId))!.status).toBe('bezahlt');
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `set -a; source .env; set +a; npx vitest run tests/finanzen/repository.test.ts`
Expected: FAIL — write functions not exported.

- [ ] **Step 3: Append the write functions to `src/finanzen/repository.ts`**

Add imports at the top:
```ts
import type { PoolClient } from 'pg';
import { transitionOrderStatus } from '@/verkauf/repository';
import type { PaymentInput, KreditorInvoiceInput } from './types';
```
Append:
```ts
// Interner Settle: berechnet den OP-Status nach einer (Zu-)Buchung neu und treibt
// bei Vollausgleich eines Debitor-Postens mit rechnung_gestellt-Beleg den Faden.
// Der open_items-Datensatz ist vom Aufrufer bereits FOR UPDATE gesperrt.
async function settleOpenItem(c: PoolClient, openItemId: string): Promise<void> {
  const r = await c.query<{ direction: string; order_id: string | null; amount: string; paid: string; order_status: string | null }>(
    `SELECT oi.direction, oi.order_id, oi.amount::text AS amount,
            COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.open_item_id = oi.id), 0)::text AS paid,
            (SELECT status FROM sales_orders WHERE id = oi.order_id) AS order_status
       FROM open_items oi WHERE oi.id = $1`, [openItemId]);
  const { direction, order_id, amount, paid, order_status } = r.rows[0];
  if (Number(paid) >= Number(amount)) {
    if (direction === 'debitor' && order_id && order_status === 'rechnung_gestellt') {
      // schreibt die bezahlt-Perle UND setzt den Debitor-OP auf bezahlt (einziger Statuspfad)
      await transitionOrderStatus(order_id, 'bezahlt', c);
    } else {
      await c.query(`UPDATE open_items SET status = 'bezahlt' WHERE id = $1`, [openItemId]);
    }
  } else {
    await c.query(`UPDATE open_items SET status = 'teilweise_bezahlt' WHERE id = $1`, [openItemId]);
  }
}

export async function recordPayment(openItemId: string, input: PaymentInput): Promise<void> {
  if (input.amount <= 0) throw new Error('Zahlbetrag muss größer als 0 sein.');
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const oi = await c.query<{ status: string }>(
      `SELECT status FROM open_items WHERE id = $1 FOR UPDATE`, [openItemId]);
    if (oi.rows.length === 0) throw new Error('Offener Posten nicht gefunden.');
    if (oi.rows[0].status === 'bezahlt') throw new Error('Posten ist bereits bezahlt.');
    await c.query(
      `INSERT INTO payments (open_item_id, amount, method, external_reference, paid_at)
       VALUES ($1,$2,$3,$4, COALESCE($5::timestamptz, now()))`,
      [openItemId, input.amount, input.method, input.reference ?? null, input.paidAt ?? null]);
    await settleOpenItem(c, openItemId);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

export async function assignPayment(paymentId: string, openItemId: string): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const oi = await c.query<{ status: string }>(
      `SELECT status FROM open_items WHERE id = $1 FOR UPDATE`, [openItemId]);
    if (oi.rows.length === 0) throw new Error('Offener Posten nicht gefunden.');
    if (oi.rows[0].status === 'bezahlt') throw new Error('Posten ist bereits bezahlt.');
    const upd = await c.query(
      `UPDATE payments SET open_item_id = $2 WHERE id = $1 AND open_item_id IS NULL`, [paymentId, openItemId]);
    if (upd.rowCount === 0) throw new Error('Zahlung nicht gefunden oder bereits zugeordnet.');
    await settleOpenItem(c, openItemId);
    await c.query('COMMIT');
  } catch (e) { await c.query('ROLLBACK'); throw e; } finally { c.release(); }
}

export async function recordUnassignedPayment(input: PaymentInput): Promise<void> {
  if (input.amount <= 0) throw new Error('Zahlbetrag muss größer als 0 sein.');
  await pool.query(
    `INSERT INTO payments (open_item_id, amount, method, external_reference, paid_at)
     VALUES (NULL, $1, $2, $3, COALESCE($4::timestamptz, now()))`,
    [input.amount, input.method, input.reference ?? null, input.paidAt ?? null]);
}

export async function createKreditorInvoice(input: KreditorInvoiceInput): Promise<string> {
  const r = await pool.query<{ id: string }>(
    `INSERT INTO open_items (direction, contact_id, reference, purchase_order_id, amount, due_date, status)
     VALUES ('kreditor', $1, $2, $3, $4, $5, 'offen') RETURNING id`,
    [input.supplierId, input.reference, input.purchaseOrderId ?? null, input.amount, input.dueDate]);
  return r.rows[0].id;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `set -a; source .env; set +a; npx vitest run tests/finanzen/repository.test.ts`
Expected: PASS (read + write).

- [ ] **Step 5: Commit**

```bash
git add src/finanzen/repository.ts tests/finanzen/repository.test.ts
git commit -m "feat(finanzen): schreibendes Repository (recordPayment→Faden, assign, kreditor)"
```

---

### Task 6: Server actions

**Files:**
- Create: `src/app/(shell)/finanzen/actions.ts`
- Test: `tests/finanzen/actions.test.ts`

**Interfaces:**
- Consumes: repository writers (Task 5).
- Produces: `recordPaymentAction`, `assignPaymentAction`, `recordUnassignedPaymentAction`, `createKreditorInvoiceAction (→ id)`.

- [ ] **Step 1: Write the failing test `tests/finanzen/actions.test.ts`**

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/finanzen/repository', () => ({
  recordPayment: vi.fn(),
  assignPayment: vi.fn(),
  recordUnassignedPayment: vi.fn(),
  createKreditorInvoice: vi.fn(async () => 'oi-1'),
  getOpenItem: vi.fn(async () => ({ orderId: null })),
}));

import {
  recordPaymentAction, assignPaymentAction, createKreditorInvoiceAction,
} from '@/app/(shell)/finanzen/actions';
import { requireAppAccess } from '@/lib/groups';
import * as repo from '@/finanzen/repository';

beforeEach(() => { vi.clearAllMocks(); });

describe('finanzen actions', () => {
  it('recordPaymentAction gated auf finanzen/edit und ruft Repo mit den Args', async () => {
    await recordPaymentAction('oi-1', { amount: 10, method: 'ueberweisung' });
    expect(requireAppAccess).toHaveBeenCalledWith('finanzen', 'edit');
    expect(repo.recordPayment).toHaveBeenCalledWith('oi-1', { amount: 10, method: 'ueberweisung' });
  });
  it('createKreditorInvoiceAction gibt die neue OP-Id zurück', async () => {
    const id = await createKreditorInvoiceAction({ supplierId: 's1', amount: 50, dueDate: '2026-09-01', reference: 'R1' });
    expect(id).toBe('oi-1');
    expect(requireAppAccess).toHaveBeenCalledWith('finanzen', 'edit');
  });
  it('assignPaymentAction reicht die Args durch', async () => {
    await assignPaymentAction('pay-1', 'oi-9');
    expect(repo.assignPayment).toHaveBeenCalledWith('pay-1', 'oi-9');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/finanzen/actions.test.ts`
Expected: FAIL — actions module not found.

- [ ] **Step 3: Create `src/app/(shell)/finanzen/actions.ts`**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { requireAppAccess } from '@/lib/groups';
import {
  recordPayment, assignPayment, recordUnassignedPayment, createKreditorInvoice, getOpenItem,
} from '@/finanzen/repository';
import type { PaymentInput, KreditorInvoiceInput } from '@/finanzen/types';

// Wenn ein Debitor-OP mit Beleg betroffen ist, hat sich der Faden geändert → Verkauf revalidieren.
async function revalidateAffected(openItemId: string): Promise<void> {
  const item = await getOpenItem(openItemId);
  if (item?.orderId) {
    revalidatePath('/verkauf');
    revalidatePath(`/verkauf/belege/${item.orderId}`);
  }
}

export async function recordPaymentAction(openItemId: string, input: PaymentInput): Promise<void> {
  await requireAppAccess('finanzen', 'edit');
  await recordPayment(openItemId, input);
  revalidatePath('/finanzen');
  revalidatePath(`/finanzen/${openItemId}`);
  await revalidateAffected(openItemId);
}

export async function assignPaymentAction(paymentId: string, openItemId: string): Promise<void> {
  await requireAppAccess('finanzen', 'edit');
  await assignPayment(paymentId, openItemId);
  revalidatePath('/finanzen');
  revalidatePath('/finanzen/warteschlange');
  revalidatePath(`/finanzen/${openItemId}`);
  await revalidateAffected(openItemId);
}

export async function recordUnassignedPaymentAction(input: PaymentInput): Promise<void> {
  await requireAppAccess('finanzen', 'edit');
  await recordUnassignedPayment(input);
  revalidatePath('/finanzen/warteschlange');
}

export async function createKreditorInvoiceAction(input: KreditorInvoiceInput): Promise<string> {
  await requireAppAccess('finanzen', 'edit');
  const id = await createKreditorInvoice(input);
  revalidatePath('/finanzen');
  return id;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run tests/finanzen/actions.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(shell\)/finanzen/actions.ts tests/finanzen/actions.test.ts
git commit -m "feat(finanzen): Server Actions (gated) für Zahlung, Zuordnung, Kreditorrechnung"
```

---

### Task 7: Booking CSV export

**Files:**
- Modify: `src/finanzen/repository.ts` (add `exportBookings`)
- Modify: `src/app/(shell)/finanzen/actions.ts` (add `exportBookingsAction`)
- Test: `tests/finanzen/repository.test.ts` (append an export test)

**Interfaces:**
- Produces: `exportBookings(): Promise<string>` (repo); `exportBookingsAction(): Promise<string>` (action).

- [ ] **Step 1: Append the failing test to `tests/finanzen/repository.test.ts`**

Add `exportBookings` to the `@/finanzen/repository` import, then append:
```ts
describe('finanzen repository — export', () => {
  it('exportBookings liefert CSV mit BOM, Semikolon-Trennung und Komma-Dezimal', async () => {
    await invoicedOrder(1, 11.9); // sorgt für mind. einen offenen Debitor-Posten
    const csv = await exportBookings();
    expect(csv.charCodeAt(0)).toBe(0xFEFF); // BOM
    const lines = csv.replace(/^﻿/, '').trim().split('\r\n');
    expect(lines[0]).toBe('Datum;Richtung;Kontakt;Referenz;Betrag;Faellig;Status;Bezahlt;Rest');
    // mindestens eine Debitor-Zeile mit Komma-Dezimalbetrag
    expect(lines.slice(1).some((l) => l.includes(';Debitor;') && /;\d+,\d{2};/.test(l))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `set -a; source .env; set +a; npx vitest run tests/finanzen/repository.test.ts`
Expected: FAIL — `exportBookings` not exported.

- [ ] **Step 3: Add `exportBookings` to `src/finanzen/repository.ts`**

Append:
```ts
function csvAmount(n: number): string { return n.toFixed(2).replace('.', ','); }
function csvField(s: string): string {
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function exportBookings(): Promise<string> {
  const r = await pool.query(
    `SELECT oi.created_at::date::text AS datum, oi.direction, c.name AS contact_name, oi.reference,
            oi.amount::text AS amount, oi.due_date::text AS due_date, oi.status,
            COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.open_item_id = oi.id), 0)::text AS paid
       FROM open_items oi JOIN contacts c ON c.id = oi.contact_id
      ORDER BY oi.created_at`);
  const header = 'Datum;Richtung;Kontakt;Referenz;Betrag;Faellig;Status;Bezahlt;Rest';
  const lines = r.rows.map((x) => {
    const amount = Number(x.amount), paid = Number(x.paid);
    const dir = x.direction === 'debitor' ? 'Debitor' : 'Kreditor';
    return [
      x.datum, dir, csvField(x.contact_name), csvField(x.reference ?? ''),
      csvAmount(amount), x.due_date, x.status, csvAmount(paid), csvAmount(amount - paid),
    ].join(';');
  });
  return '﻿' + [header, ...lines].join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Add `exportBookingsAction` to `src/app/(shell)/finanzen/actions.ts`**

Add `exportBookings` to the `@/finanzen/repository` import, then append:
```ts
export async function exportBookingsAction(): Promise<string> {
  await requireAppAccess('finanzen');
  return exportBookings();
}
```
(Note: read-only gate — `requireAppAccess('finanzen')` without `'edit'`.)

- [ ] **Step 5: Run the export test to verify it passes**

Run: `set -a; source .env; set +a; npx vitest run tests/finanzen/repository.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck & commit**

Run: `npx tsc --noEmit`
```bash
git add src/finanzen/repository.ts src/app/\(shell\)/finanzen/actions.ts tests/finanzen/repository.test.ts
git commit -m "feat(finanzen): Buchungs-CSV-Export (Server Action)"
```

---

### Task 8: Seed — Kreditor open item + unassigned payment

**Files:**
- Create: `src/finanzen/seed-data.ts`
- Create: `scripts/seed-finanzen.ts`
- Modify: `package.json` (add `seed-finanzen` script)

**Interfaces:**
- Produces: `seedFinanzen(): Promise<void>`; npm script `seed-finanzen`.

Note: the debitor open item for the demo comes from the existing verkauf seed (`b2b-rechnung` stays at `rechnung_gestellt`). This task only adds a **kreditor** open item + an **unassigned** payment.

- [ ] **Step 1: Create `src/finanzen/seed-data.ts`**

```ts
// DoD-Seed Finanzen: ein Kreditor-OP (offen) + eine nicht zugeordnete Zahlung
// (Warteschlange). Der offene Debitor-OP kommt aus dem Verkauf-Seed (b2b-rechnung
// bleibt bei rechnung_gestellt). Lieferant per Name (Lookup im Seed-Skript).

export interface SeedOpenItem {
  id: string; direction: 'kreditor'; supplierName: string;
  reference: string; amount: number; dueDate: string;
}
export interface SeedPayment {
  id: string; amount: number; method: 'ueberweisung' | 'lastschrift' | 'kreditkarte' | 'paypal' | 'sonstige';
  externalReference: string; paidAt: string;
}

export const KREDITOR_ITEMS: SeedOpenItem[] = [
  {
    id: '33333333-0000-4000-8000-000000000001',
    direction: 'kreditor', supplierName: 'Guangzhou ToyCraft Ltd.',
    reference: 'ER-2026-4711', amount: 840.00, dueDate: '2026-08-15',
  },
];

export const UNASSIGNED_PAYMENTS: SeedPayment[] = [
  {
    id: '33333333-0000-4000-8000-000000000101',
    amount: 68.50, method: 'ueberweisung', externalReference: 'SEPA-778', paidAt: '2026-07-14',
  },
];
```

- [ ] **Step 2: Create `scripts/seed-finanzen.ts`**

```ts
import { pool } from '../src/lib/db';
import { KREDITOR_ITEMS, UNASSIGNED_PAYMENTS } from '../src/finanzen/seed-data';

async function contactIdByName(name: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM contacts WHERE name = $1', [name]);
  if (r.rows.length === 0) throw new Error(`Unbekannter Kontakt im Seed: ${name}`);
  return r.rows[0].id;
}

export async function seedFinanzen(): Promise<void> {
  for (const it of KREDITOR_ITEMS) {
    const supplierId = await contactIdByName(it.supplierName);
    await pool.query(
      `INSERT INTO open_items (id, direction, contact_id, reference, amount, due_date, status)
       VALUES ($1,'kreditor',$2,$3,$4,$5,'offen')
       ON CONFLICT (id) DO UPDATE SET contact_id=excluded.contact_id, reference=excluded.reference,
         amount=excluded.amount, due_date=excluded.due_date`,
      [it.id, supplierId, it.reference, it.amount, it.dueDate]);
  }
  for (const p of UNASSIGNED_PAYMENTS) {
    await pool.query(
      `INSERT INTO payments (id, open_item_id, amount, method, external_reference, paid_at)
       VALUES ($1, NULL, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE SET amount=excluded.amount, method=excluded.method,
         external_reference=excluded.external_reference, paid_at=excluded.paid_at`,
      [p.id, p.amount, p.method, p.externalReference, p.paidAt]);
  }
  console.log('Finanzen seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-finanzen.ts')) {
  seedFinanzen().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
```

- [ ] **Step 3: Register the npm script in `package.json`**

In the `scripts` block, after `"seed-verkauf": ...`, add:
```json
    "seed-finanzen": "tsx scripts/seed-finanzen.ts",
```

- [ ] **Step 4: Verify the seed runs cleanly against the DB (twice → idempotent)**

Run: `set -a; source .env; set +a; npx tsx scripts/seed-finanzen.ts && npx tsx scripts/seed-finanzen.ts`
Expected: `Finanzen seed applied.` twice, no FK errors, no duplicate-key errors (idempotent upserts). (Requires kontakte already seeded — if „Unbekannter Kontakt" appears, run `npx tsx scripts/seed-kontakte.ts` first.)

- [ ] **Step 5: Commit**

```bash
git add src/finanzen/seed-data.ts scripts/seed-finanzen.ts package.json
git commit -m "feat(finanzen): Seed (Kreditor-OP + nicht zugeordnete Zahlung)"
```

---

### Task 9: UI — Offene Posten (Übersicht + Detail)

**Files:**
- Modify: `src/app/(shell)/finanzen/page.tsx` (replace placeholder)
- Create: `src/components/OffenePostenListe.tsx`
- Create: `src/app/(shell)/finanzen/[id]/page.tsx`
- Create: `src/components/OffenePostenDetail.tsx`

**Interfaces:**
- Consumes: `listOpenItems`, `getOpenItem` (Task 4); `recordPaymentAction`, `exportBookingsAction` (Tasks 6/7); `eur` (Task 3); `DIRECTION_LABEL`/`OI_STATUS_LABEL`/`METHOD_LABEL` (Task 3).

- [ ] **Step 1: Replace `src/app/(shell)/finanzen/page.tsx`**

```tsx
import { listOpenItems } from '@/finanzen/repository';
import { OffenePostenListe } from '@/components/OffenePostenListe';

export const dynamic = 'force-dynamic';

export default async function OffenePostenPage() {
  const items = await listOpenItems();
  const sum = (dir: 'debitor' | 'kreditor') =>
    items.filter((i) => i.direction === dir && i.status !== 'bezahlt').reduce((s, i) => s + i.remaining, 0);
  const overdue = items.filter((i) => i.overdue).reduce((s, i) => s + i.remaining, 0);
  return (
    <OffenePostenListe items={items} debitorOpen={sum('debitor')} kreditorOpen={sum('kreditor')} overdue={overdue} />
  );
}
```

- [ ] **Step 2: Create `src/components/OffenePostenListe.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { ChartCard } from '@/components/charts/ChartCard';
import type { OpenItemRow, OpenItemDirection } from '@/finanzen/types';
import { DIRECTION_LABEL, OI_STATUS_LABEL } from '@/finanzen/labels';
import { eur } from '@/finanzen/format';
import { exportBookingsAction } from '@/app/(shell)/finanzen/actions';

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <ChartCard>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
      <p className="anno mt-1 text-neutral-500">NETTO · OHNE MWST</p>
    </ChartCard>
  );
}

export function OffenePostenListe({ items, debitorOpen, kreditorOpen, overdue }:
  { items: OpenItemRow[]; debitorOpen: number; kreditorOpen: number; overdue: number }) {
  const [dir, setDir] = useState<OpenItemDirection | ''>('');
  const [onlyOpen, setOnlyOpen] = useState(true);
  const [pending, start] = useTransition();

  const filtered = items.filter((i) =>
    (!dir || i.direction === dir) && (!onlyOpen || i.status !== 'bezahlt'));

  const download = () => start(async () => {
    const csv = await exportBookingsAction();
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'buchungen.csv'; a.click();
    URL.revokeObjectURL(url);
  });

  const chip = (active: boolean) =>
    `rounded px-3 py-1 text-sm ${active ? 'bg-accent text-white' : 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-200'}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Finanzen · Offene Posten</h2>
        <div className="flex gap-2">
          <Link href="/finanzen/neu" className="rounded border border-neutral-300 px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">Lieferantenrechnung</Link>
          <button onClick={download} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Export CSV</button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Tile label="Offen Debitor" value={eur(debitorOpen)} />
        <Tile label="Offen Kreditor" value={eur(kreditorOpen)} />
        <Tile label="Davon überfällig" value={eur(overdue)} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(['', 'debitor', 'kreditor'] as const).map((d) => (
          <button key={d} onClick={() => setDir(d)} className={chip(dir === d)}>
            {d === '' ? 'Alle' : DIRECTION_LABEL[d]}
          </button>
        ))}
        <label className="ml-2 flex items-center gap-1 text-sm text-neutral-600 dark:text-neutral-300">
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> nur offen
        </label>
      </div>

      <table className="w-full text-sm">
        <thead><tr className="anno text-left text-neutral-500">
          <th className="py-2">Richtung</th><th>Kontakt</th><th>Referenz</th>
          <th className="text-right">Betrag</th><th>Fällig</th><th>Status</th><th className="text-right">Rest</th>
        </tr></thead>
        <tbody>
          {filtered.map((i) => (
            <tr key={i.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">{DIRECTION_LABEL[i.direction]}</td>
              <td>{i.contactName}</td>
              <td><Link href={`/finanzen/${i.id}`} className="text-brand hover:text-brand-dark">{i.reference ?? '—'}</Link></td>
              <td className="text-right">{eur(i.amount)}</td>
              <td className={i.overdue ? 'text-danger' : 'text-neutral-500'}>{i.dueDate}</td>
              <td>
                {i.overdue
                  ? <span className="rounded bg-danger/15 px-2 py-0.5 font-medium text-danger">Überfällig</span>
                  : <span className="rounded bg-neutral-100 px-2 py-0.5 dark:bg-neutral-800">{OI_STATUS_LABEL[i.status]}</span>}
              </td>
              <td className="text-right">{eur(i.remaining)}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={7} className="py-6 text-center text-neutral-500">Keine offenen Posten.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/(shell)/finanzen/[id]/page.tsx`**

```tsx
import { notFound } from 'next/navigation';
import { getOpenItem } from '@/finanzen/repository';
import { OffenePostenDetail } from '@/components/OffenePostenDetail';

export const dynamic = 'force-dynamic';

export default async function OpenItemPage({ params }: { params: { id: string } }) {
  const item = await getOpenItem(params.id);
  if (!item) notFound();
  return <OffenePostenDetail item={item} />;
}
```

- [ ] **Step 4: Create `src/components/OffenePostenDetail.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { OpenItemDetail, PaymentMethod } from '@/finanzen/types';
import { DIRECTION_LABEL, OI_STATUS_LABEL, METHOD_LABEL } from '@/finanzen/labels';
import { eur } from '@/finanzen/format';
import { recordPaymentAction } from '@/app/(shell)/finanzen/actions';

const METHODS: PaymentMethod[] = ['ueberweisung', 'lastschrift', 'kreditkarte', 'paypal', 'sonstige'];

export function OffenePostenDetail({ item }: { item: OpenItemDetail }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [amount, setAmount] = useState(item.remaining > 0 ? String(item.remaining.toFixed(2)) : '');
  const [method, setMethod] = useState<PaymentMethod>('ueberweisung');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const settled = item.status === 'bezahlt';
  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  const submit = () => {
    const a = Number(amount.replace(',', '.'));
    if (!Number.isFinite(a) || a <= 0) { setError('Betrag > 0 angeben.'); return; }
    setError(null);
    start(async () => {
      try {
        await recordPaymentAction(item.id, { amount: a, method, reference: reference || undefined });
        setReference(''); router.refresh();
      } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link href="/finanzen" className="text-brand hover:text-brand-dark">← Offene Posten</Link>
        <h2 className="text-xl font-bold tracking-tight">{item.reference ?? DIRECTION_LABEL[item.direction]}</h2>
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-sm dark:bg-neutral-800">{DIRECTION_LABEL[item.direction]}</span>
        <span className={`rounded px-2 py-0.5 text-sm ${item.overdue ? 'bg-danger/15 text-danger' : 'bg-neutral-100 dark:bg-neutral-800'}`}>
          {item.overdue ? 'Überfällig' : OI_STATUS_LABEL[item.status]}
        </span>
        <span className="text-neutral-500">{item.contactName}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="anno text-neutral-500">Betrag</p><p className="mt-1 text-lg font-semibold">{eur(item.amount)}</p>
          <p className="anno mt-1 text-neutral-500">NETTO · OHNE MWST</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="anno text-neutral-500">Bezahlt</p><p className="mt-1 text-lg font-semibold">{eur(item.paid)}</p>
        </div>
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="anno text-neutral-500">Rest · fällig {item.dueDate}</p><p className="mt-1 text-lg font-semibold">{eur(item.remaining)}</p>
        </div>
      </div>

      {item.orderId && (
        <p className="text-sm text-neutral-600 dark:text-neutral-300">
          Beleg: <Link href={`/verkauf/belege/${item.orderId}`} className="text-brand hover:text-brand-dark">{item.orderNumber}</Link>
          {item.orderStatus === 'rechnung_gestellt' && ' — Vollausgleich setzt den Beleg auf „bezahlt".'}
        </p>
      )}

      {!settled && (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <p className="anno mb-2 text-neutral-500">Zahlung erfassen</p>
          <div className="flex flex-wrap items-end gap-2">
            <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Betrag" className={`${input} w-28`} />
            <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={input}>
              {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
            </select>
            <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Referenz (optional)" className={`${input} flex-1`} />
            <button onClick={submit} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Buchen</button>
          </div>
          {error && <p className="mt-2 text-sm text-danger">{error}</p>}
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="anno mb-2 text-neutral-500">Zahlungen</p>
        {item.payments.length === 0
          ? <p className="text-sm text-neutral-500">Noch keine Zahlungen.</p>
          : (
            <table className="w-full text-sm">
              <tbody>
                {item.payments.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-200 dark:border-neutral-800">
                    <td className="py-1 text-neutral-500">{p.paidAt.slice(0, 10)}</td>
                    <td>{eur(p.amount)}</td>
                    <td>{METHOD_LABEL[p.method]}</td>
                    <td className="text-neutral-500">{p.reference ?? ''}</td>
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

- [ ] **Step 5: Typecheck, full suite, commit**

Run: `npx tsc --noEmit`
Run: `set -a; source .env; set +a; npx vitest run` — expect only the known `tests/db/rls.test.ts` failures; no new failures.
```bash
git add src/app/\(shell\)/finanzen/page.tsx src/app/\(shell\)/finanzen/\[id\] src/components/OffenePostenListe.tsx src/components/OffenePostenDetail.tsx
git commit -m "feat(finanzen): Offene Posten Übersicht + Detail (Zahlung erfassen, CSV-Export)"
```

---

### Task 10: UI — Warteschlange & Lieferantenrechnung

**Files:**
- Create: `src/app/(shell)/finanzen/warteschlange/page.tsx`
- Create: `src/components/Warteschlange.tsx`
- Create: `src/app/(shell)/finanzen/neu/page.tsx`
- Create: `src/components/LieferantenrechnungForm.tsx`

**Interfaces:**
- Consumes: `listUnassignedPayments`, `listOpenItemOptions`, `listContactOptions` (Task 4); `assignPaymentAction`, `recordUnassignedPaymentAction`, `createKreditorInvoiceAction` (Task 6); `eur` (Task 3); `METHOD_LABEL` (Task 3).

- [ ] **Step 1: Create `src/app/(shell)/finanzen/warteschlange/page.tsx`**

```tsx
import { listUnassignedPayments, listOpenItemOptions } from '@/finanzen/repository';
import { Warteschlange } from '@/components/Warteschlange';

export const dynamic = 'force-dynamic';

export default async function WarteschlangePage() {
  const [payments, options] = await Promise.all([listUnassignedPayments(), listOpenItemOptions()]);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Finanzen · Warteschlange</h2>
      <Warteschlange payments={payments} options={options} />
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/Warteschlange.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { UnassignedPayment, OpenItemOption, PaymentMethod } from '@/finanzen/types';
import { METHOD_LABEL } from '@/finanzen/labels';
import { eur } from '@/finanzen/format';
import { assignPaymentAction, recordUnassignedPaymentAction } from '@/app/(shell)/finanzen/actions';

const METHODS: PaymentMethod[] = ['ueberweisung', 'lastschrift', 'kreditkarte', 'paypal', 'sonstige'];

export function Warteschlange({ payments, options }: { payments: UnassignedPayment[]; options: OpenItemOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [assign, setAssign] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  // Neue nicht zugeordnete Zahlung
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('ueberweisung');
  const [reference, setReference] = useState('');

  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  const run = (fn: () => Promise<unknown>) => start(async () => {
    setError(null);
    try { await fn(); router.refresh(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
  });

  const doAssign = (paymentId: string) => {
    const openItemId = assign[paymentId];
    if (!openItemId) { setError('Zielposten wählen.'); return; }
    run(() => assignPaymentAction(paymentId, openItemId));
  };

  const addUnassigned = () => {
    const a = Number(amount.replace(',', '.'));
    if (!Number.isFinite(a) || a <= 0) { setError('Betrag > 0 angeben.'); return; }
    run(async () => { await recordUnassignedPaymentAction({ amount: a, method, reference: reference || undefined }); setAmount(''); setReference(''); });
  };

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <p className="anno mb-2 text-neutral-500">Zahlung erfassen (ohne Zuordnung)</p>
        <div className="flex flex-wrap items-end gap-2">
          <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Betrag" className={`${input} w-28`} />
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={input}>
            {METHODS.map((m) => <option key={m} value={m}>{METHOD_LABEL[m]}</option>)}
          </select>
          <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Verwendungszweck" className={`${input} flex-1`} />
          <button onClick={addUnassigned} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Erfassen</button>
        </div>
      </div>

      <table className="w-full text-sm">
        <thead><tr className="anno text-left text-neutral-500">
          <th className="py-2">Datum</th><th className="text-right">Betrag</th><th>Methode</th><th>Verwendungszweck</th><th>Zuordnen</th>
        </tr></thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2 text-neutral-500">{p.paidAt.slice(0, 10)}</td>
              <td className="text-right">{eur(p.amount)}</td>
              <td>{METHOD_LABEL[p.method]}</td>
              <td className="text-neutral-500">{p.reference ?? ''}</td>
              <td>
                <div className="flex items-center gap-2">
                  <select value={assign[p.id] ?? ''} onChange={(e) => setAssign({ ...assign, [p.id]: e.target.value })} className={input}>
                    <option value="">— Posten wählen —</option>
                    {options.map((o) => <option key={o.id} value={o.id}>{o.label} · Rest {eur(o.remaining)}</option>)}
                  </select>
                  <button onClick={() => doAssign(p.id)} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Zuordnen</button>
                </div>
              </td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr><td colSpan={5} className="py-6 text-center text-neutral-500">Keine offenen Zahlungen in der Warteschlange.</td></tr>
          )}
        </tbody>
      </table>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 3: Create `src/app/(shell)/finanzen/neu/page.tsx`**

```tsx
import { listContactOptions } from '@/finanzen/repository';
import { LieferantenrechnungForm } from '@/components/LieferantenrechnungForm';

export const dynamic = 'force-dynamic';

export default async function NeuePage() {
  const contacts = await listContactOptions();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Finanzen · Lieferantenrechnung</h2>
      <LieferantenrechnungForm contacts={contacts} />
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/LieferantenrechnungForm.tsx`**

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ContactOption } from '@/finanzen/types';
import { createKreditorInvoiceAction } from '@/app/(shell)/finanzen/actions';

export function LieferantenrechnungForm({ contacts }: { contacts: ContactOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [supplierId, setSupplierId] = useState(contacts[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);

  const input = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

  const submit = () => {
    const a = Number(amount.replace(',', '.'));
    if (!supplierId || !Number.isFinite(a) || a <= 0 || !dueDate || !reference) {
      setError('Lieferant, Betrag > 0, Fälligkeit und Referenz angeben.'); return;
    }
    setError(null);
    start(async () => {
      try {
        const id = await createKreditorInvoiceAction({ supplierId, amount: a, dueDate, reference });
        router.push(`/finanzen/${id}`);
      } catch (e) { setError(e instanceof Error ? e.message : 'Fehler'); }
    });
  };

  return (
    <div className="max-w-lg space-y-3 rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <label className="block text-sm">
        <span className="anno text-neutral-500">Lieferant</span>
        <select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className={`${input} mt-1 w-full`}>
          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="block text-sm">
        <span className="anno text-neutral-500">Betrag (netto)</span>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0,00" className={`${input} mt-1 w-full`} />
      </label>
      <label className="block text-sm">
        <span className="anno text-neutral-500">Fällig am</span>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={`${input} mt-1 w-full`} />
      </label>
      <label className="block text-sm">
        <span className="anno text-neutral-500">Referenz (Rechnungsnr.)</span>
        <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="ER-…" className={`${input} mt-1 w-full`} />
      </label>
      <button onClick={submit} disabled={pending} className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50">Rechnung anlegen</button>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Typecheck & commit**

Run: `npx tsc --noEmit`
```bash
git add src/app/\(shell\)/finanzen/warteschlange src/app/\(shell\)/finanzen/neu src/components/Warteschlange.tsx src/components/LieferantenrechnungForm.tsx
git commit -m "feat(finanzen): Warteschlange (zuordnen/erfassen) + Lieferantenrechnung-Formular"
```

---

### Task 11: Help page, full suite & bryx-test deploy verification

**Files:**
- Modify: `src/lib/help/content.ts` (add `finanzen` module page)

- [ ] **Step 1: Run help-content test to confirm it now fails (app registered, page missing)**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: FAIL — no `group:'module'` page with slug `finanzen`.

- [ ] **Step 2: Add the help page to `src/lib/help/content.ts`**

Insert this page object immediately after the `verfuegbarkeit` module page object, before the `// ── Administration` comment:
```ts
  {
    slug: 'finanzen',
    title: 'Finanzen',
    summary: 'Offene Posten, Zahlungsabgleich, Zuordnen-Warteschlange und Buchungsexport.',
    group: 'module',
    sections: [
      {
        heading: 'Was macht das Modul?',
        blocks: [
          { type: 'p', text: 'Finanzen zeigt die offenen Posten beider Richtungen: Debitoren (was Kunden schulden, aus Verkaufsrechnungen) und Kreditoren (was wir Lieferanten schulden). Überfälligkeit wird aus dem Fälligkeitsdatum abgeleitet.' },
        ],
      },
      {
        heading: 'Wichtige Funktionen',
        blocks: [
          { type: 'list', items: [
            'Zahlung erfassen: gleicht eine Zahlung einen Debitor-Posten voll aus, wird der zugehörige Verkaufsbeleg automatisch auf „bezahlt" gesetzt (bezahlt-Perle im Faden).',
            'Teilzahlungen setzen den Posten auf „teilweise bezahlt"; der Rest bleibt offen.',
            'Zuordnen-Warteschlange: nicht zugeordnete Zahlungen (z. B. ohne bekannte Rechnung) erfassen und später einem offenen Posten zuordnen.',
            'Lieferantenrechnung erfassen: legt einen Kreditor-Posten an (optional mit Bestellbezug).',
            'Buchungsexport: CSV aller Posten (Semikolon, Komma-Dezimal, UTF-8) für die weitere Verarbeitung.',
          ] },
        ],
      },
      {
        heading: 'Beträge & Grenzen',
        blocks: [
          { type: 'p', text: 'Alle Beträge sind netto (ohne MwSt) — das Modell führt keine Steuerlogik. Der Export ist ein pragmatischer Buchungs-CSV, kein DATEV-EXTF-konformer Stapel.' },
        ],
      },
    ],
  },
```

- [ ] **Step 3: Run the help-content test to verify it passes**

Run: `npx vitest run tests/lib/help-content.test.ts`
Expected: PASS.

- [ ] **Step 4: Run the full suite**

Run: `set -a; source .env; set +a; npx vitest run`
Expected: PASS except the known `tests/db/rls.test.ts` host-caveat failures. Confirm no new failures.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/help/content.ts
git commit -m "docs(hilfe): Finanzen-Modulhilfe (Offene Posten, Zahlung, Warteschlange, Export)"
```

- [ ] **Step 7: Deploy to bryx-test and verify in the browser (NEVER production)**

Run: `/opt/budp-dev/deploy.sh`
Then, with an admin login, verify at `https://bryx-test.lumeapps.de`:
- Rail shows **Finanzen** (FI); `/finanzen` opens Offene Posten with KPI tiles (Debitor/Kreditor/überfällig, „NETTO"-Anno) and the seeded Kreditor-OP `ER-2026-4711`.
- The `b2b-rechnung` debitor OP is offen; open it → „Zahlung erfassen" with the full remaining prefilled → Buchen → OP wird „bezahlt" **und** der Beleg erscheint im Verkauf (`/verkauf/belege/...`) als „bezahlt" (bezahlt-Perle im Faden).
- A partial payment on another debitor OP → „teilweise bezahlt".
- Warteschlange zeigt die Seed-Zahlung `SEPA-778`; „Zuordnen" zu einem offenen Posten funktioniert.
- Lieferantenrechnung anlegen → Redirect aufs neue Kreditor-Detail.
- Export CSV lädt eine `buchungen.csv` herunter.
- Überfällige Posten rot; Konsole fehlerfrei.

- [ ] **Step 8: Finish the branch**

Use the `superpowers:finishing-a-development-branch` skill to open the PR (stacked on the B5 branch `feat/phase-2-verfuegbarkeit` / PR #69).

---

## Self-Review (completed during authoring)

- **Spec coverage:** §1 App-Registrierung → Task 1. §2.2 transitionOrderStatus-Refactor → Task 2. §2.1/§2.3 Repository → Tasks 4/5. §3 Actions → Task 6. §4 UI → Tasks 9/10. §5 Export → Task 7. §6 Seed/Hilfe → Tasks 8/11. §7 Tests → distributed + Task 11.
- **Placeholder scan:** no TBD/TODO; every code step is complete; every enum/label spelled out.
- **Type consistency:** `PaymentInput`/`KreditorInvoiceInput` identical across repository, actions, UI; `recordPayment(openItemId, input)` signature matches action and UI call; `transitionOrderStatus(orderId, target, client?)` third param consumed only by `settleOpenItem`; `OpenItemDetail.orderStatus` drives the „setzt Beleg auf bezahlt"-Hinweis and the settle branch consistently.
- **Trap coverage:** app-access grant (Task 1); transaction + `FOR UPDATE` + guards in every writer (Task 5); overdue derived not stored; single status bottleneck preserved (settle delegates to `transitionOrderStatus`); Netto labels on money tiles; danger token for overdue (consistent with B5).
