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
