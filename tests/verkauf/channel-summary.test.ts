import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool } from '@/lib/db';
import { addDays } from '@/lib/dates';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder, channelSummary } from '@/verkauf/repository';
import type { DateRange } from '@/verkauf/types';

const MUELLER = 'c1c1c1c1-0000-4000-8000-000000000001';
const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const orderIds: string[] = [];
const ccIds: string[] = [];

async function variantId(sku: string): Promise<string> {
  const r = await pool.query<{ id: string }>('SELECT id FROM product_variants WHERE sku = $1', [sku]);
  return r.rows[0].id;
}

beforeAll(async () => {
  await seedKontakte(); await seedKatalog(); await seedVerfuegbarkeit();
  await pool.query('UPDATE product_variants SET purchase_price = 5 WHERE sku = $1', ['SJ-BLAU']);
});
afterAll(async () => {
  for (const id of ccIds) await pool.query('DELETE FROM channel_costs WHERE id = $1', [id]);
  for (const id of orderIds) {
    await pool.query('DELETE FROM open_items WHERE order_id = $1', [id]);
    await pool.query('DELETE FROM sales_orders WHERE id = $1', [id]);
  }
  await pool.end();
});

describe('channelSummary Kosten', () => {
  it('berechnet Wareneinsatz und DB je Kanal aus order_costs', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const range: DateRange = { start: addDays(today, -1), end: today };
    // marktplatz startet als 'auftrag' (wird von channelSummary gezählt; b2b_portal
    // startet als 'angebot' und wird herausgefiltert), und keine geseedete ad_spend
    // mappt auf marktplatz (google/meta/tiktok→shop, kein amazon_ads im Seed) → die
    // Werbung-Differenz ist 0 und die DB-Differenz = Umsatz − Wareneinsatz exakt.
    const before = (await channelSummary(range)).find((c) => c.channel === 'marktplatz')!;
    const o = await createOrder({
      contactId: MUELLER, channel: 'marktplatz', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 10, unitPrice: 20 }],
    });
    orderIds.push(o.id);
    const after = (await channelSummary(range)).find((c) => c.channel === 'marktplatz')!;
    expect(after.revenueNet - before.revenueNet).toBeCloseTo(200, 2);   // 10×20
    expect(after.wareneinsatz - before.wareneinsatz).toBeCloseTo(50, 2); // 10×5
    // DB-Zuwachs = Umsatz − Wareneinsatz (b2b hat keine Werbung/Gebühren im Test)
    expect(after.db - before.db).toBeCloseTo(150, 2);
  });

  it('addiert manuelle channel_costs(werbung) in die Werbung-Spalte', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const range: DateRange = { start: addDays(today, -1), end: today };
    const before = (await channelSummary(range)).find((c) => c.channel === 'telefon')!;
    const cc = await pool.query<{ id: string }>(
      `INSERT INTO channel_costs (channel, type, period_start, period_end, amount, source)
       VALUES ('telefon','werbung',$1,$1,300,'manuell') RETURNING id`, [today]);
    ccIds.push(cc.rows[0].id);
    const after = (await channelSummary(range)).find((c) => c.channel === 'telefon')!;
    expect(after.werbung - before.werbung).toBeCloseTo(300, 2);
  });
});
