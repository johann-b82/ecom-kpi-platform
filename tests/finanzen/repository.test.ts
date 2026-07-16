import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder, transitionOrderStatus, getOrder } from '@/verkauf/repository';
import {
  listOpenItems, getOpenItem, listContactOptions, listOpenItemOptions, listUnassignedPayments,
  listPurchaseOrderOptions,
  recordPayment, assignPayment, recordUnassignedPayment, createKreditorInvoice, exportBookings,
} from '@/finanzen/repository';

const MUELLER = 'c1c1c1c1-0000-4000-8000-000000000001';
const GUANGZHOU = 'c1c1c1c1-0000-4000-8000-000000000005'; // reiner Lieferant (is_supplier=true, is_customer=false)
const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const orderIds: string[] = [];
const kreditorItemIds: string[] = [];

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
  for (const id of kreditorItemIds) {
    await pool.query('DELETE FROM payments WHERE open_item_id = $1', [id]);
    await pool.query('DELETE FROM open_items WHERE id = $1', [id]);
  }
  await pool.query(`DELETE FROM payments WHERE open_item_id IS NULL AND external_reference LIKE 'TEST-%'`);
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

  it('listContactOptions liefert nur Lieferanten (für Eingangsrechnung/Kreditor)', async () => {
    const opts = await listContactOptions();
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.find((o) => o.id === GUANGZHOU)).toBeDefined();
    expect(opts.find((o) => o.id === MUELLER)).toBeUndefined(); // MUELLER ist reiner Kunde
  });

  it('listPurchaseOrderOptions liefert Bestellungen mit supplierId und B-Nummer', async () => {
    const opts = await listPurchaseOrderOptions();
    expect(opts.length).toBeGreaterThan(0);
    const po = opts[0];
    expect(po.number).toMatch(/^B-\d{4}-\d{4}$/);
    expect(po.supplierId).toBeTruthy();
  });

  it('listOpenItemOptions liefert offene Posten mit remaining, Label und ohne bezahlte Posten', async () => {
    const { openItemId, amount } = await invoicedOrder(2, 11.9);
    const opts = await listOpenItemOptions(MUELLER);
    expect(opts.length).toBeGreaterThan(0);
    const opt = opts.find((o) => o.id === openItemId);
    expect(opt).toBeDefined();
    expect(opt!.contactId).toBe(MUELLER);
    expect(opt!.remaining).toBeCloseTo(amount, 2); // unbezahlt → remaining == amount
    expect(opt!.label).toEqual(expect.any(String));
    expect(opt!.label.length).toBeGreaterThan(0);

    const statusById = new Map(
      (await pool.query<{ id: string; status: string }>('SELECT id, status FROM open_items WHERE id = ANY($1)', [
        opts.map((o) => o.id),
      ])).rows.map((r) => [r.id, r.status]),
    );
    expect(opts.every((o) => statusById.get(o.id) !== 'bezahlt')).toBe(true);
  });
});

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

  it('createKreditorInvoice mit purchaseOrderId → getOpenItem liefert purchaseOrderNumber', async () => {
    const po = (await listPurchaseOrderOptions())[0];
    expect(po).toBeDefined();
    const id = await createKreditorInvoice({
      supplierId: po.supplierId, amount: 200, dueDate: '2026-09-30', reference: 'TEST-kred-po',
      purchaseOrderId: po.id,
    });
    kreditorItemIds.push(id);
    const detail = await getOpenItem(id);
    expect(detail!.purchaseOrderId).toBe(po.id);
    expect(detail!.purchaseOrderNumber).toBe(po.number);
  });
});

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
