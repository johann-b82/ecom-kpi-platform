import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool } from '@/lib/db';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder, getOrder } from '@/verkauf/repository';

const MUELLER = 'c1c1c1c1-0000-4000-8000-000000000001'; // Spielwaren Müller, K-0001
const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const orderIds: string[] = [];

async function variantId(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  return r.rows[0].id;
}
async function reservedFor(sku: string): Promise<number> {
  const r = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(quantity_reserved),0)::text AS s FROM stock_levels
       WHERE variant_id = (SELECT id FROM product_variants WHERE sku=$1)`, [sku]);
  return parseInt(r.rows[0].s, 10);
}

beforeAll(async () => {
  await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit();
});
afterAll(async () => {
  for (const id of orderIds) await pool.query('DELETE FROM sales_orders WHERE id = $1', [id]);
  await pool.end();
});

describe('verkauf repository — createOrder', () => {
  it('b2b_portal startet als angebot, ohne Perle und ohne Reservierung', async () => {
    const before = await reservedFor('SJ-BLAU');
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 3, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    expect(o.number).toMatch(/^A-\d{4}-\d{4}$/);
    expect(o.status).toBe('angebot');
    expect(o.events).toHaveLength(0);
    expect(await reservedFor('SJ-BLAU')).toBe(before);
  });

  it('shop startet als auftrag, mit automatischer bestellt-Perle und Reservierung', async () => {
    const before = await reservedFor('SJ-BLAU');
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 2, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    expect(o.status).toBe('auftrag');
    expect(o.events).toHaveLength(1);
    expect(o.events[0].stage).toBe('bestellt');
    expect(o.events[0].automated).toBe(true);
    expect(await reservedFor('SJ-BLAU')).toBe(before + 2);
    const back = await getOrder(o.id);
    expect(back?.lines).toHaveLength(1);
  });

  it('shop mit zwei Zeilen auf derselben Variante reserviert die Summe', async () => {
    const before = await reservedFor('SJ-BLAU');
    const vid = await variantId('SJ-BLAU');
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [
        { variantId: vid, quantity: 2, unitPrice: 11.9 },
        { variantId: vid, quantity: 3, unitPrice: 11.9 },
      ],
    });
    orderIds.push(o.id);
    expect(o.status).toBe('auftrag');
    expect(await reservedFor('SJ-BLAU')).toBe(before + 5);
    const back = await getOrder(o.id);
    expect(back?.lines).toHaveLength(2);
  });
});
