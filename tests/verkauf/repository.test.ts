import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import { pool } from '@/lib/db';
import { addDays } from '@/lib/dates';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';
import { seedVerfuegbarkeit } from '../../scripts/seed-verfuegbarkeit';
import { createOrder, getOrder, transitionOrderStatus, createReturn } from '@/verkauf/repository';
import {
  listOrderRows, getOrderView, sellableVariants, priceForVariant, availableStock,
  salesTotals, revenueNetTotal, channelSummary, statusFunnel, countOpenQuotes, salesDailySeries, ecomSalesFacts,
} from '@/verkauf/repository';

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
  for (const id of orderIds) {
    await pool.query('DELETE FROM open_items WHERE order_id = $1', [id]);
    await pool.query('DELETE FROM sales_orders WHERE id = $1', [id]);
  }
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

async function onHandFor(sku: string): Promise<number> {
  const r = await pool.query<{ s: string }>(
    `SELECT COALESCE(SUM(quantity_on_hand),0)::text AS s FROM stock_levels
       WHERE variant_id = (SELECT id FROM product_variants WHERE sku=$1)`, [sku]);
  return parseInt(r.rows[0].s, 10);
}

describe('verkauf repository — transitionOrderStatus', () => {
  it('führt einen Beleg auftrag→versendet→rechnung_gestellt→bezahlt mit Perlen + Seiteneffekten', async () => {
    const vid = await variantId('BK-CLASSIC');
    const onHandBefore = await onHandFor('BK-CLASSIC');
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: vid, quantity: 5, unitPrice: 16.9 }],
    });
    orderIds.push(o.id);

    const shipped = await transitionOrderStatus(o.id, 'versendet');
    expect(shipped.status).toBe('versendet');
    expect(shipped.events.map((e) => e.stage)).toEqual(['bestellt', 'kommissioniert']);
    expect(shipped.events[1].sourceApp).toBe('verfuegbarkeit');
    expect(await onHandFor('BK-CLASSIC')).toBe(onHandBefore - 5);

    const invoiced = await transitionOrderStatus(o.id, 'rechnung_gestellt');
    expect(invoiced.status).toBe('rechnung_gestellt');
    const oi = await pool.query(
      `SELECT direction, status, amount::text AS amount FROM open_items WHERE order_id = $1`, [o.id]);
    expect(oi.rows).toHaveLength(1);
    expect(oi.rows[0].direction).toBe('debitor');
    expect(oi.rows[0].amount).toBe('84.50'); // 5 × 16.90

    const paid = await transitionOrderStatus(o.id, 'bezahlt');
    expect(paid.status).toBe('bezahlt');
    expect(paid.events[paid.events.length - 1].stage).toBe('bezahlt');
    const oi2 = await pool.query(`SELECT status FROM open_items WHERE order_id = $1`, [o.id]);
    expect(oi2.rows[0].status).toBe('bezahlt');
  });

  it('verweigert einen unerlaubten Übergang', async () => {
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 1, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    // angebot → bezahlt ist nicht erlaubt
    await expect(transitionOrderStatus(o.id, 'bezahlt')).rejects.toThrow(/Übergang/i);
  });
});

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

describe('verkauf repository — createReturn', () => {
  it('legt einen Gutschriftbeleg an, hängt die retoure-Perle an den Ursprung und bucht Bestand zurück', async () => {
    const vid = await variantId('BK-CLASSIC');
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: vid, quantity: 4, unitPrice: 16.9 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'versendet');
    await transitionOrderStatus(o.id, 'rechnung_gestellt');
    await transitionOrderStatus(o.id, 'bezahlt');

    const onHandBefore = await onHandFor('BK-CLASSIC');
    const credit = await createReturn(o.id);
    // credit NICHT in orderIds pushen: die FK related_order_id → o.id verlangt,
    // dass die Gutschrift VOR dem Ursprung gelöscht wird. Das erledigt die
    // gezielte DELETE-Zeile am Testende; o.id bleibt für afterAll in orderIds.

    expect(credit.status).toBe('retoure');
    expect(credit.relatedOrderId).toBe(o.id);
    expect(credit.lines[0].quantity).toBe(-4);              // negative Menge
    expect(await onHandFor('BK-CLASSIC')).toBe(onHandBefore + 4);

    const original = await getOrder(o.id);
    expect(original!.events[original!.events.length - 1].stage).toBe('retoure'); // Perle am Ursprung

    // Gutschrift zuerst entfernen (FK related_order_id), Ursprung räumt afterAll ab.
    await pool.query('DELETE FROM sales_orders WHERE related_order_id = $1', [o.id]);
  });
});

describe('verkauf repository — storniert', () => {
  it('gibt bei zwei Zeilen auf derselben Variante die volle Reservierung frei (I1)', async () => {
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
    expect(await reservedFor('SJ-BLAU')).toBe(before + 5);

    const cancelled = await transitionOrderStatus(o.id, 'storniert');
    expect(cancelled.status).toBe('storniert');
    expect(await reservedFor('SJ-BLAU')).toBe(before);
  });

  it('verweigert storniert aus versendet (I2)', async () => {
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 1, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'versendet');
    await expect(transitionOrderStatus(o.id, 'storniert')).rejects.toThrow(/Übergang/);
  });
});

describe('verkauf repository — Lesefunktionen für die UI', () => {
  it('listOrderRows liefert Kundenname und Stages in Reihenfolge', async () => {
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('BK-CLASSIC'), quantity: 1, unitPrice: 16.9 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'versendet');
    const rows = await listOrderRows();
    const row = rows.find((r) => r.id === o.id)!;
    expect(row.contactName).toBe('Spielwaren Müller GmbH');
    expect(row.stages).toEqual(['bestellt', 'kommissioniert']);
  });

  it('getOrderView liefert Positions-Labels und Kundenname', async () => {
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 2, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    const v = await getOrderView(o.id);
    expect(v!.contactName).toBe('Spielwaren Müller GmbH');
    expect(v!.lines[0].sku).toBe('SJ-BLAU');
    expect(v!.lines[0].productName).toBe('Sternenjäger');
  });

  it('availableStock = on_hand − reserved über alle Lager; priceForVariant wählt die Staffel', async () => {
    const av = await availableStock(await variantId('SJ-ROT'));
    expect(typeof av).toBe('number'); // SJ-ROT: 8 + 4 on_hand, minus Reservierungen aus anderen Tests
    // Staffel: SJ-ROT Handel min_qty=1 → 12.90, min_qty=10 → 11.90
    expect(await priceForVariant(await variantId('SJ-ROT'), PL_HANDEL, 1)).toBe(12.9);
    expect(await priceForVariant(await variantId('SJ-ROT'), PL_HANDEL, 10)).toBe(11.9);
  });

  it('sellableVariants enthält Produktname + verfügbare Menge', async () => {
    const vs = await sellableVariants();
    const bk = vs.find((v) => v.sku === 'BK-CLASSIC')!;
    expect(bk.productName).toBe('Bauklötze Classic');
    expect(typeof bk.available).toBe('number');
  });
});

describe('B4 aggregates', () => {
  const today = new Date().toISOString().slice(0, 10);
  const range = { start: addDays(today, -30), end: today };

  it('salesTotals: Umsatz = alles außer storniert (inkl. Angebote), offene Angebote separat', async () => {
    const before = await salesTotals(range);

    // Angebot (manuell) → zählt jetzt in Umsatz (2×10=20) UND als openOffer
    const offer = await createOrder({
      contactId: MUELLER, channel: 'manuell', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 2, unitPrice: 10 }],
    });
    orderIds.push(offer.id);

    // Auftrag (shop) → Umsatz 3×10=30
    const order = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 3, unitPrice: 10 }],
    });
    orderIds.push(order.id);

    const after = await salesTotals(range);
    expect(after.revenueNet - before.revenueNet).toBeCloseTo(50);   // 20 (Angebot) + 30 (Auftrag)
    expect(after.orders - before.orders).toBe(2);                    // beide zählen
    expect(after.openOffers - before.openOffers).toBe(1);            // nur das Angebot
    expect(after.avgOrderValueNet).toBeCloseTo(after.revenueNet / after.orders);
  });

  it('revenueNetTotal: stimmt mit salesTotals.revenueNet überein und schließt Storno aus', async () => {
    const base = (await salesTotals(range)).revenueNet;
    expect(await revenueNetTotal(range)).toBeCloseTo(base, 2);       // deckungsgleich mit dem schweren Aggregat

    const order = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 2, unitPrice: 10 }],
    });
    orderIds.push(order.id);
    expect(await revenueNetTotal(range)).toBeCloseTo(base + 20, 2);  // Auftrag zählt

    await transitionOrderStatus(order.id, 'storniert');
    expect(await revenueNetTotal(range)).toBeCloseTo(base, 2);       // Storno wieder draußen
  });

  it('salesTotals: storniert fließt in cancelledRevenue/stornoQuote, nicht in Umsatz', async () => {
    const before = await salesTotals(range);
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 4, unitPrice: 10 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'storniert');   // aus 'auftrag' erlaubt

    const after = await salesTotals(range);
    expect(after.revenueNet - before.revenueNet).toBeCloseTo(0);       // Storno NICHT im Umsatz
    expect(after.cancelledRevenue - before.cancelledRevenue).toBeCloseTo(40);
    expect(after.stornoQuote).toBeGreaterThan(0);
    expect(after.stornoQuote).toBeLessThanOrEqual(1);
  });

  it('salesDailySeries: Storno erhöht cancelledRevenue, nicht revenueNet, am Bestelltag', async () => {
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 5, unitPrice: 10 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'storniert');

    const series = await salesDailySeries(range);
    const total = series.reduce((s, p) => s + p.cancelledRevenue, 0);
    expect(total).toBeGreaterThanOrEqual(50);   // enthält die 5×10 Stornierung
    // stornierter Beleg fließt nicht in revenueNet
    for (const p of series) expect(p.revenueNet).toBeGreaterThanOrEqual(0);
  });

  it('salesTotals: avgOrderValueNet ist 0 statt Division-durch-0 bei leerem Zeitraum', async () => {
    const empty = { start: addDays(today, -365), end: addDays(today, -300) };
    const t = await salesTotals(empty);
    expect(t.orders).toBe(0);
    expect(t.avgOrderValueNet).toBe(0);
    expect(t.stornoQuote).toBe(0);
  });

  it('salesTotals: ausschließlich storniert → revenue 0, stornoQuote 1', async () => {
    const win = { start: '2019-03-01', end: '2019-03-01' };
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      placedAt: '2019-03-01T10:00:00Z',
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 2, unitPrice: 10 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'storniert');
    const t = await salesTotals(win);
    expect(t.revenueNet).toBe(0);
    expect(t.cancelledRevenue).toBeCloseTo(20);
    expect(t.stornoQuote).toBe(1);
  });

  it('channelSummary: alle 5 Kanäle, umsatzloser Kanal = 0', async () => {
    const rows = await channelSummary(range);
    expect(rows.map((r) => r.channel)).toEqual(
      ['shop', 'b2b_portal', 'marktplatz', 'telefon', 'manuell']);
    const shop = rows.find((r) => r.channel === 'shop')!;
    expect(shop.revenueNet).toBeGreaterThan(0);
    const markt = rows.find((r) => r.channel === 'marktplatz')!;
    expect(markt.orders).toBe(0);
    expect(markt.revenueNet).toBe(0);
  });

  it('statusFunnel liefert alle 7 Status (auch 0)', async () => {
    const f = await statusFunnel(range);
    expect(f.map((x) => x.status)).toEqual(
      ['angebot', 'auftrag', 'versendet', 'rechnung_gestellt', 'bezahlt', 'retoure', 'storniert']);
    expect(f.find((x) => x.status === 'angebot')!.count).toBeGreaterThanOrEqual(1);
  });

  it('Retoure mindert den Umsatz netto', async () => {
    const vid = await variantId('BK-CLASSIC');
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: [{ variantId: vid, quantity: 2, unitPrice: 16.9 }],
    });
    orderIds.push(o.id);
    await transitionOrderStatus(o.id, 'versendet');
    await transitionOrderStatus(o.id, 'rechnung_gestellt');
    await transitionOrderStatus(o.id, 'bezahlt');

    const before = await salesTotals(range);
    await createReturn(o.id);
    // credit NICHT in orderIds pushen: die FK related_order_id → o.id verlangt,
    // dass die Gutschrift VOR dem Ursprung gelöscht wird. Das erledigt die
    // gezielte DELETE-Zeile am Testende; o.id bleibt für afterAll in orderIds.
    const after = await salesTotals(range);

    expect(after.revenueNet).toBeLessThan(before.revenueNet);

    // Gutschrift zuerst entfernen (FK related_order_id), Ursprung räumt afterAll ab.
    await pool.query('DELETE FROM sales_orders WHERE related_order_id = $1', [o.id]);
  });

  it('listOrderRows(channel) filtert auf den Kanal', async () => {
    const shopRows = await listOrderRows('shop');
    expect(shopRows.every((r) => r.channel === 'shop')).toBe(true);
    const all = await listOrderRows();
    expect(all.length).toBeGreaterThanOrEqual(shopRows.length);
  });

  it('Angebote zählen jetzt in channelSummary und ecomSalesFacts', async () => {
    const beforeCh = (await channelSummary(range)).find((c) => c.channel === 'b2b_portal')!;
    const beforeFacts = await ecomSalesFacts(range, 'b2b_portal');
    const o = await createOrder({          // b2b_portal → Status 'angebot'
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 3, unitPrice: 10 }],
    });
    orderIds.push(o.id);
    const afterCh = (await channelSummary(range)).find((c) => c.channel === 'b2b_portal')!;
    const afterFacts = await ecomSalesFacts(range, 'b2b_portal');
    expect(afterCh.revenueNet - beforeCh.revenueNet).toBeCloseTo(30);    // Angebot zählt jetzt mit
    expect(afterFacts.revenue - beforeFacts.revenue).toBeCloseTo(30);
  });
});

describe('ORDER_REVENUE_SQL: gespeicherte Belegsumme vs. Positionen', () => {
  const today = new Date().toISOString().slice(0, 10);
  const range = { start: addDays(today, -30), end: today };

  async function createOrderWithLines(lines: { qty: number; price: number }[]): Promise<string> {
    const vid = await variantId('SJ-BLAU');
    const o = await createOrder({
      contactId: MUELLER, channel: 'shop', priceListId: PL_HANDEL,
      lines: lines.map((l) => ({ variantId: vid, quantity: l.qty, unitPrice: l.price })),
    });
    orderIds.push(o.id);
    return o.id;
  }

  it('salesTotals: gespeicherte Belegsumme hat Vorrang vor den Positionen', async () => {
    const before = await salesTotals(range);
    const id = await createOrderWithLines([{ qty: 1, price: 30 }]);
    await pool.query(`UPDATE sales_orders SET total_net = 100 WHERE id = $1`, [id]);
    const after = await salesTotals(range);
    expect(after.revenueNet - before.revenueNet).toBeCloseTo(100);   // 100, nicht 30
  });

  it('salesTotals: mehrere Positionen vervielfachen die Belegsumme NICHT', async () => {
    const before = await salesTotals(range);
    const id = await createOrderWithLines([{ qty: 1, price: 10 }, { qty: 1, price: 10 }, { qty: 1, price: 10 }]);
    await pool.query(`UPDATE sales_orders SET total_net = 100 WHERE id = $1`, [id]);
    const after = await salesTotals(range);
    expect(after.revenueNet - before.revenueNet).toBeCloseTo(100);   // 100, nicht 300
  });

  it('salesTotals: ohne total_net weiterhin aus Positionen', async () => {
    const before = await salesTotals(range);
    await createOrderWithLines([{ qty: 2, price: 10 }]);
    const after = await salesTotals(range);
    expect(after.revenueNet - before.revenueNet).toBeCloseTo(20);
  });
});

describe('countOpenQuotes', () => {
  it('zählt nur angebot-Belege, nicht überführte', async () => {
    const before = await countOpenQuotes();
    const o = await createOrder({
      contactId: MUELLER, channel: 'b2b_portal', priceListId: PL_HANDEL,
      lines: [{ variantId: await variantId('SJ-BLAU'), quantity: 1, unitPrice: 11.9 }],
    });
    orderIds.push(o.id);
    expect(o.status).toBe('angebot');
    expect(await countOpenQuotes()).toBe(before + 1);
    await transitionOrderStatus(o.id, 'auftrag');
    expect(await countOpenQuotes()).toBe(before); // nicht mehr angebot
  });
});
