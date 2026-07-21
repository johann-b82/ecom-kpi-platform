import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder, transitionOrderStatus } from '@/verkauf/repository';
import { customerMetrics, customerKpis, customerSummary, customerOrders } from '@/kontakte/analytics';

const MUELLER = 'c1c1c1c1-0000-4000-8000-000000000001';
const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const today = new Date().toISOString().slice(0, 10);
const ALL = { start: '2000-01-01', end: today };
const orderIds: string[] = [];

async function variantId(sku: string): Promise<string> {
  return (await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku=$1', [sku])).rows[0].id;
}
async function order(qty: number, price: number): Promise<string> {
  const o = await createOrder({ contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
    lines: [{ variantId: await variantId('SJ-BLAU'), quantity: qty, unitPrice: price }] });
  orderIds.push(o.id); return o.id;
}

beforeAll(async () => { await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit(); });
afterAll(async () => {
  for (const id of orderIds) {
    await pool.query('DELETE FROM sales_order_lines WHERE order_id=$1', [id]);
    await pool.query('DELETE FROM open_items WHERE order_id=$1', [id]);
    await pool.query('DELETE FROM sales_orders WHERE id=$1', [id]);
  }
  await pool.end();
});

describe('kontakte analytics', () => {
  it('customerSummary: Umsatz/Orders lifetime, Storno ausgeschlossen, isReturning ab 2', async () => {
    const before = await customerSummary(MUELLER);
    await order(2, 10);                                  // +20, +1 Order
    await order(1, 30);                                  // +30, +1 Order
    const cancel = await order(5, 10); await transitionOrderStatus(cancel, 'storniert'); // zählt nicht
    const after = await customerSummary(MUELLER);
    expect(after.orders - before.orders).toBe(2);
    expect(after.revenueNet - before.revenueNet).toBeCloseTo(50, 2);
    expect(after.isReturning).toBe(true);
    expect(after.lastOrderAt).toBe(today);
  });

  it('customerMetrics: MUELLER erscheint mit Perioden-Umsatz und lifetime CLV; Segmentfilter greift', async () => {
    await order(3, 10);                                  // +30 heute
    const rows = await customerMetrics(ALL);
    const m = rows.find((r) => r.contactId === MUELLER);
    expect(m).toBeDefined();
    expect(m!.orders).toBeGreaterThanOrEqual(1);
    expect(m!.revenueNet).toBeGreaterThan(0);
    expect(m!.avgOrderValueNet).toBeCloseTo(m!.revenueNet / m!.orders, 2);
    expect(m!.clv).toBeGreaterThanOrEqual(m!.revenueNet);   // lifetime >= Periode
    // Segmentfilter: MUELLER ist 'geschaeft'
    const priv = await customerMetrics(ALL, { segment: 'privat' });
    expect(priv.find((r) => r.contactId === MUELLER)).toBeUndefined();
  });

  it('customerOrders: liefert die Belege des Kunden mit Betrag, neueste zuerst', async () => {
    await order(2, 15);
    const list = await customerOrders(MUELLER);
    expect(list.length).toBeGreaterThan(0);
    expect(list[0].revenueNet).toBeGreaterThan(0);
    expect(list[0].number).toMatch(/^(A|WC)-/);
  });

  it('customerKpis: aggregiert über den vollen Bestand; totalCustomers >= activeCustomers', async () => {
    await order(2, 20);
    const kpis = await customerKpis(ALL);
    const rows = await customerMetrics(ALL, { limit: 100000 });
    expect(kpis.activeCustomers).toBe(rows.filter((r) => r.orders > 0).length);
    expect(kpis.totalCustomers).toBe(rows.length);
    expect(kpis.revenueNet).toBeCloseTo(rows.reduce((s, r) => s + r.revenueNet, 0), 1);
    expect(kpis.returningCustomers).toBe(rows.filter((r) => r.orders > 0 && r.isReturning).length);
    expect(kpis.totalCustomers).toBeGreaterThanOrEqual(kpis.activeCustomers);
  });

  it('customerMetrics: limit begrenzt die Zeilen auf die Top-N nach Umsatz', async () => {
    await order(3, 25);
    const top = await customerMetrics(ALL, { limit: 1 });
    expect(top).toHaveLength(1);
    const all = await customerMetrics(ALL, { limit: 100000 });
    expect(top[0].revenueNet).toBeCloseTo(Math.max(...all.map((r) => r.revenueNet)), 2); // höchster Umsatz zuerst
  });

  async function createOrderWithLines(lines: { qty: number; price: number }[]): Promise<string> {
    const vid = await variantId('SJ-BLAU');
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: lines.map((l) => ({ variantId: vid, quantity: l.qty, unitPrice: l.price })),
    });
    orderIds.push(o.id);
    return o.id;
  }

  it('customerKpis: gespeicherte Belegsumme hat Vorrang und vervielfacht nicht', async () => {
    const before = (await customerKpis(ALL)).revenueNet;
    const id = await createOrderWithLines([{ qty: 1, price: 10 }, { qty: 1, price: 10 }]);
    await pool.query(`UPDATE sales_orders SET total_net = 100 WHERE id = $1`, [id]);
    const after = (await customerKpis(ALL)).revenueNet;
    expect(after - before).toBeCloseTo(100);   // 100, nicht 20 und nicht 200
  });
});
