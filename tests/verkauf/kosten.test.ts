import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder, createReturn, transitionOrderStatus, orderCosts } from '@/verkauf/repository';

const MUELLER = 'c1c1c1c1-0000-4000-8000-000000000001';
const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const orderIds: string[] = [];

async function variantId(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  return r.rows[0].id;
}
async function setEk(sku: string, ek: number | null): Promise<void> {
  await pool.query('UPDATE product_variants SET purchase_price = $2 WHERE sku = $1', [sku, ek]);
}

beforeAll(async () => { await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit(); });
afterAll(async () => {
  for (const id of orderIds) {
    await pool.query('DELETE FROM sales_orders WHERE related_order_id = $1', [id]);
    await pool.query('DELETE FROM open_items WHERE order_id = $1', [id]);
    await pool.query('DELETE FROM sales_orders WHERE id = $1', [id]);
  }
  await pool.end();
});

describe('EK-Einfrieren', () => {
  it('schreibt bei createOrder eine wareneinsatz-Zeile mit Menge×EK', async () => {
    await setEk('SJ-BLAU', 5);
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 3, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    const costs = await orderCosts(o.id);
    const we = costs.filter((c) => c.type === 'wareneinsatz');
    expect(we).toHaveLength(1);
    expect(we[0].amount).toBe(15);        // 3 × 5
    expect(we[0].source).toBe('berechnet');
  });

  it('schreibt KEINE wareneinsatz-Zeile, wenn purchase_price NULL ist', async () => {
    await setEk('SJ-BLAU', null);
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 2, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    expect(await orderCosts(o.id)).toHaveLength(0);
  });

  it('spiegelt den EK bei createReturn negativ', async () => {
    await setEk('SJ-BLAU', 5);
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 4, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    // Beleg bis 'bezahlt' bringen (shop startet als 'auftrag')
    await transitionOrderStatus(o.id, 'versendet');
    await transitionOrderStatus(o.id, 'rechnung_gestellt');
    await transitionOrderStatus(o.id, 'bezahlt');
    const credit = await createReturn(o.id);
    const we = (await orderCosts(credit.id)).filter((c) => c.type === 'wareneinsatz');
    expect(we[0].amount).toBe(-20);       // -4 × 5
  });
});
