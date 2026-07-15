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
