import { pool } from '@/lib/db';
import type { PoolClient } from 'pg';
import { transitionOrderStatus } from '@/verkauf/repository';
import type {
  OpenItemRow, OpenItemDetail, PaymentRow, UnassignedPayment,
  OpenItemOption, ContactOption, OpenItemFilter, PaymentInput, KreditorInvoiceInput,
  PurchaseOrderOption,
} from './types';
import type { DateRange } from '@/verkauf/types';

export async function listOpenItems(filter: OpenItemFilter = {}): Promise<OpenItemRow[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.direction) { params.push(filter.direction); where.push(`oi.direction = $${params.length}`); }
  if (filter.onlyOpen) where.push(`oi.status <> 'bezahlt'`);
  if (filter.dueFrom) { params.push(filter.dueFrom); where.push(`oi.due_date >= $${params.length}`); }
  if (filter.dueTo) { params.push(filter.dueTo); where.push(`oi.due_date <= $${params.length}`); }
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
            oi.purchase_order_id, po.number AS purchase_order_number,
            oi.amount::text AS amount, oi.due_date::text AS due_date, oi.status,
            COALESCE((SELECT SUM(p.amount) FROM payments p WHERE p.open_item_id = oi.id), 0)::text AS paid,
            (oi.status <> 'bezahlt' AND oi.due_date < CURRENT_DATE) AS overdue
       FROM open_items oi
       JOIN contacts c ON c.id = oi.contact_id
       LEFT JOIN sales_orders so ON so.id = oi.order_id
       LEFT JOIN purchase_orders po ON po.id = oi.purchase_order_id
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
    purchaseOrderId: x.purchase_order_id, purchaseOrderNumber: x.purchase_order_number,
    amount, dueDate: x.due_date, status: x.status,
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

// Nur Lieferanten (Vorlieferanten) — Eingangsrechnungen werden nur diesen zugeordnet,
// nicht den (zahlreichen) B2C-Kundenkontakten.
export async function listContactOptions(): Promise<ContactOption[]> {
  const r = await pool.query(`SELECT id, name FROM contacts WHERE is_supplier = true ORDER BY name`);
  return r.rows.map((x) => ({ id: x.id, name: x.name }));
}

// Bestellungen als Auswahloptionen für die Verknüpfung einer Eingangsrechnung
// (im Formular clientseitig auf den gewählten Lieferanten gefiltert).
export async function listPurchaseOrderOptions(): Promise<PurchaseOrderOption[]> {
  const r = await pool.query(
    `SELECT id, number, supplier_id, status FROM purchase_orders ORDER BY number DESC`);
  return r.rows.map((x) => ({ id: x.id, number: x.number, supplierId: x.supplier_id, status: x.status }));
}

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

// Operativer Cashflow — Einzahlungen: Zahlungseingänge auf Debitor-Posten.
// Nicht zugeordnete Zahlungen (open_item_id IS NULL) zählen bewusst nicht mit
// (JOIN statt LEFT JOIN); sie fließen erst nach Zuordnung ein.
export async function cashflowIn(range: DateRange): Promise<number> {
  const r = await pool.query<{ total: number }>(
    `SELECT COALESCE(SUM(p.amount), 0)::float8 AS total
       FROM payments p JOIN open_items oi ON oi.id = p.open_item_id
      WHERE oi.direction = 'debitor'
        AND p.paid_at::date BETWEEN $1 AND $2`,
    [range.start, range.end]);
  return Number(r.rows[0].total);
}

export async function cashflowInByDay(range: DateRange): Promise<{ day: string; amount: number }[]> {
  const r = await pool.query(
    `SELECT p.paid_at::date::text AS day, COALESCE(SUM(p.amount), 0)::float8 AS amount
       FROM payments p JOIN open_items oi ON oi.id = p.open_item_id
      WHERE oi.direction = 'debitor'
        AND p.paid_at::date BETWEEN $1 AND $2
      GROUP BY day ORDER BY day`,
    [range.start, range.end]);
  return r.rows.map((x: any) => ({ day: x.day, amount: Number(x.amount) }));
}
