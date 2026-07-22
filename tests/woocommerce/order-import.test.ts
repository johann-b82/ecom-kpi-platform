import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  mapOrderStatus, billingContactKey, mapBillingToContact, mapOrderLines, mapOrderTotal, mapRefundNet,
} from '@/woocommerce/order-import';
import { pool } from '@/lib/db';
import { importWooCommerceOrders } from '@/woocommerce/order-import';
import { seedKontakte } from '../../scripts/seed-kontakte';
import { seedKatalog } from '../../scripts/seed-katalog';

describe('mapOrderStatus', () => {
  it('mappt WooCommerce-Status auf ERP-Belegstatus', () => {
    expect(mapOrderStatus('completed')).toBe('bezahlt');
    expect(mapOrderStatus('processing')).toBe('auftrag');
    expect(mapOrderStatus('on-hold')).toBe('auftrag');
    expect(mapOrderStatus('pending')).toBe('angebot');
    expect(mapOrderStatus('cancelled')).toBe('storniert');
    expect(mapOrderStatus('failed')).toBe('storniert');
    expect(mapOrderStatus('refunded')).toBe('bezahlt');
  });

  it('refunded ist ein bezahlter Verkauf (die Gutschrift ist ein eigener Beleg)', () => {
    expect(mapOrderStatus('refunded')).toBe('bezahlt');
    expect(mapOrderStatus('cancelled')).toBe('storniert');   // unveraendert
    expect(mapOrderStatus('completed')).toBe('bezahlt');     // unveraendert
  });

  it('fällt auf angebot zurück bei unbekanntem Status', () => {
    expect(mapOrderStatus('irgendwas')).toBe('angebot');
  });
});

describe('billingContactKey', () => {
  it('nutzt die E-Mail (lowercase) als Dedup-Schlüssel', () => {
    expect(billingContactKey({ email: 'Max@Example.COM', first_name: 'Max', postcode: '10115' })).toBe('max@example.com');
  });

  it('fällt ohne E-Mail auf Name + PLZ zurück', () => {
    expect(billingContactKey({ first_name: 'Max', last_name: 'Muster', postcode: '10115' })).toBe('max muster 10115');
  });
});

describe('mapBillingToContact', () => {
  it('bevorzugt die Firma als Name, sonst Vor-/Nachname', () => {
    expect(mapBillingToContact({ company: 'Muster GmbH', first_name: 'Max', last_name: 'Muster', country: 'DE', email: 'a@b.de' }).name)
      .toBe('Muster GmbH');
    expect(mapBillingToContact({ first_name: 'Max', last_name: 'Muster', country: 'DE' }).name).toBe('Max Muster');
  });

  it('übernimmt Land als tax_country und E-Mail', () => {
    const c = mapBillingToContact({ first_name: 'A', last_name: 'B', country: 'AT', email: 'a@b.at' });
    expect(c.taxCountry).toBe('AT');
    expect(c.email).toBe('a@b.at');
  });
});

describe('mapOrderLines', () => {
  const skuToVariant = new Map([['SKU-A', 'var-a'], ['SKU-B', 'var-b']]);

  it('löst Positionen per SKU auf und überspringt unbekannte', () => {
    const items = [
      { sku: 'SKU-A', quantity: 2, price: '5.00' },
      { sku: 'SKU-UNBEKANNT', quantity: 1, price: '9.00' },
      { sku: 'SKU-B', quantity: 3, price: '4.50' },
    ];
    const r = mapOrderLines(items, skuToVariant);
    expect(r.lines).toEqual([
      { variantId: 'var-a', quantity: 2, unitPrice: 5 },
      { variantId: 'var-b', quantity: 3, unitPrice: 4.5 },
    ]);
    expect(r.skipped).toEqual(['SKU-UNBEKANNT']);
  });

  it('überspringt Positionen ohne SKU', () => {
    const r = mapOrderLines([{ sku: '', quantity: 1, price: '1.00' }], skuToVariant);
    expect(r.lines).toHaveLength(0);
    expect(r.skipped).toEqual(['(ohne SKU)']);
  });
});

describe('mapOrderTotal', () => {
  it('summiert alle Positionen — auch die ohne SKU (geloeschte Produkte)', () => {
    const items = [
      { sku: 'A1', quantity: 2, price: 10, total: '20.00' },
      { quantity: 1, price: 55.5, total: '55.50' },          // ohne SKU
      { sku: 'B2', quantity: 1, price: 5, total: '5.00' },
    ];
    expect(mapOrderTotal(items as any)).toBeCloseTo(80.5);
  });
  it('nutzt total (nach Rabatt), nicht subtotal', () => {
    const items = [{ sku: 'A1', quantity: 1, price: 100, subtotal: '100.00', total: '80.00' }];
    expect(mapOrderTotal(items as any)).toBeCloseTo(80);
  });
  it('leere Liste ergibt 0, fehlendes total zaehlt als 0', () => {
    expect(mapOrderTotal([])).toBe(0);
    expect(mapOrderTotal([{ sku: 'X', quantity: 1, price: 1 }] as any)).toBe(0);
  });
});

describe('mapRefundNet', () => {
  it('nimmt die Netto-Summe der Erstattungspositionen', () => {
    const r = { amount: '45.85', total_tax: '-7.32',
      line_items: [{ total: '-30.00' }, { total: '-8.53' }] };
    expect(mapRefundNet(r as any)).toBeCloseTo(-38.53);
  });
  it('faellt ohne Positionen auf |amount| - |total_tax| zurueck', () => {
    expect(mapRefundNet({ amount: '45.85', total_tax: '-7.32' } as any)).toBeCloseTo(-38.53);
  });
  it('liefert immer ein negatives Ergebnis, egal wie das Vorzeichen kommt', () => {
    expect(mapRefundNet({ amount: '10', total_tax: '0', line_items: [{ total: '10.00' }] } as any)).toBeCloseTo(-10);
    expect(mapRefundNet({ amount: '10', total_tax: '0', line_items: [{ total: '-10.00' }] } as any)).toBeCloseTo(-10);
  });
  it('leere Eingabe ergibt 0', () => {
    expect(mapRefundNet({} as any)).toBe(0);
  });

  it('bleibt auch bei anomalem tax > amount negativ (Vertrag: immer <= 0)', () => {
    expect(mapRefundNet({ amount: '5', total_tax: '-9' } as any)).toBeLessThanOrEqual(0);
  });
});

describe('importWooCommerceOrders — Status/Event-Reconcile', () => {
  const WOO_ID = 99900001;
  const NUM = `WC-${WOO_ID}`;
  let priceListId: string;

  const rawOrder = (status: string) => ({
    id: WOO_ID, number: String(WOO_ID), status,
    date_created: '2026-07-10T10:00:00', date_paid: '2026-07-10T10:05:00', currency: 'EUR',
    billing: { first_name: 'Recon', last_name: 'Test', email: 'recon.test@example.com', country: 'DE', postcode: '10115' },
    line_items: [{ sku: 'SJ-BLAU', quantity: 2, price: '10.00' }],
  });

  async function statusOf(): Promise<string> {
    const r = await pool.query<{ status: string }>('SELECT status FROM sales_orders WHERE number=$1', [NUM]);
    return r.rows[0]?.status;
  }
  async function eventStages(): Promise<string[]> {
    const r = await pool.query<{ stage: string }>(
      `SELECT e.stage FROM sales_order_events e JOIN sales_orders o ON o.id=e.order_id
        WHERE o.number=$1 ORDER BY e.stage`, [NUM]);
    return r.rows.map((x) => x.stage);
  }

  beforeAll(async () => {
    await seedKontakte(); await seedKatalog();
    const pl = await pool.query<{ id: string }>('SELECT id FROM price_lists WHERE is_default LIMIT 1');
    priceListId = pl.rows[0].id;
    await importWooCommerceOrders(pool, [rawOrder('processing')], priceListId); // → auftrag
  });

  afterAll(async () => {
    await pool.query(
      `DELETE FROM external_references WHERE entity_type='sales_order'
         AND entity_id IN (SELECT id FROM sales_orders WHERE number=$1)`, [NUM]);
    await pool.query('DELETE FROM sales_orders WHERE number=$1', [NUM]);
    await pool.query(`DELETE FROM contacts WHERE id IN (
      SELECT entity_id FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='recon.test@example.com')`);
    await pool.query(`DELETE FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='recon.test@example.com'`);
    await pool.end();
  });

  it('setup: processing wurde als auftrag importiert', async () => {
    expect(await statusOf()).toBe('auftrag');
  });

  it('re-import als cancelled → status storniert, ordersUpdated=1, keine Zeilen-Dubletten', async () => {
    const r = await importWooCommerceOrders(pool, [rawOrder('cancelled')], priceListId);
    expect(r.ordersUpdated).toBe(1);
    expect(await statusOf()).toBe('storniert');
    const lines = await pool.query('SELECT count(*)::int n FROM sales_order_lines l JOIN sales_orders o ON o.id=l.order_id WHERE o.number=$1', [NUM]);
    expect(lines.rows[0].n).toBe(1);
  });

  it('re-import als completed → bezahlt mit bezahlt-Event; dann refunded → bleibt bezahlt', async () => {
    await importWooCommerceOrders(pool, [rawOrder('completed')], priceListId);
    expect(await statusOf()).toBe('bezahlt');
    expect(await eventStages()).toEqual(['bestellt', 'bezahlt']);

    await importWooCommerceOrders(pool, [rawOrder('refunded')], priceListId);
    expect(await statusOf()).toBe('bezahlt');
    expect(await eventStages()).toEqual(['bestellt', 'bezahlt']);
  });

  it('re-import mit gleichem Status → ordersUpdated=0 (idempotent)', async () => {
    const r = await importWooCommerceOrders(pool, [rawOrder('refunded')], priceListId);
    expect(r.ordersUpdated).toBe(0);
    expect(await statusOf()).toBe('bezahlt');
  });

  it('setzt total_net beim Import und auch beim erneuten Import (idempotent)', async () => {
    const raw = [{
      id: 987654, number: '987654', status: 'completed', date_created: '2026-05-01T10:00:00',
      billing: { first_name: 'Max', last_name: 'Muster', email: 'max@example.com' },
      line_items: [
        { sku: 'SKU-EXIST', quantity: 1, price: 30, total: '30.00' },
        { quantity: 1, price: 70, total: '70.00' },   // ohne SKU -> Position faellt weg, Summe nicht
      ],
    }];
    await importWooCommerceOrders(pool, raw as any, priceListId);
    const a = await pool.query(`SELECT total_net FROM sales_orders WHERE number = 'WC-987654'`);
    expect(Number(a.rows[0].total_net)).toBeCloseTo(100);

    await importWooCommerceOrders(pool, raw as any, priceListId);   // erneut
    const b = await pool.query(`SELECT total_net FROM sales_orders WHERE number = 'WC-987654'`);
    expect(Number(b.rows[0].total_net)).toBeCloseTo(100);

    await pool.query(
      `DELETE FROM external_references WHERE entity_type='sales_order'
         AND entity_id IN (SELECT id FROM sales_orders WHERE number='WC-987654')`);
    await pool.query(`DELETE FROM sales_orders WHERE number='WC-987654'`);
    await pool.query(`DELETE FROM contacts WHERE id IN (
      SELECT entity_id FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='max@example.com')`);
    await pool.query(`DELETE FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='max@example.com'`);
  });

  it('legt je Erstattung eine negative Gutschrift an, verknuepft und idempotent', async () => {
    const raw = [{
      id: 771001, number: '771001', status: 'refunded', date_created: '2026-06-22T10:00:00',
      date_paid: '2026-06-22T10:05:00', currency: 'EUR',
      billing: { first_name: 'Rita', last_name: 'Retoure', email: 'rita@example.com' },
      line_items: [{ sku: 'SKU-EXIST', quantity: 1, price: 100, total: '100.00' }],
      refunds: [{ id: 990001, total: '-100.00' }],
    }];
    const fetchRefunds = async () => ([{
      id: 990001, date_created: '2026-07-14T15:42:30', amount: '119.00', total_tax: '-19.00',
      line_items: [{ total: '-100.00' }],
    }] as any);

    await importWooCommerceOrders(pool, raw as any, priceListId, fetchRefunds);

    // Ursprungsbeleg ist ein Verkauf
    const o = await pool.query(`SELECT id, status, total_net FROM sales_orders WHERE number='WC-771001'`);
    expect(o.rows[0].status).toBe('bezahlt');
    expect(Number(o.rows[0].total_net)).toBeCloseTo(100);

    // Gutschrift: negativ, verknuepft, mit Erstattungsdatum
    const g = await pool.query(
      `SELECT status, total_net, related_order_id, placed_at::date::text AS d
         FROM sales_orders WHERE number='WC-771001-R990001'`);
    expect(g.rows.length).toBe(1);
    expect(g.rows[0].status).toBe('retoure');
    expect(Number(g.rows[0].total_net)).toBeCloseTo(-100);
    expect(g.rows[0].related_order_id).toBe(o.rows[0].id);
    expect(g.rows[0].d).toBe('2026-07-14');

    // Idempotenz: zweiter Import legt KEINE zweite Gutschrift an
    await importWooCommerceOrders(pool, raw as any, priceListId, fetchRefunds);
    const again = await pool.query(`SELECT count(*)::int AS n FROM sales_orders WHERE number LIKE 'WC-771001-R%'`);
    expect(again.rows[0].n).toBe(1);

    await pool.query(
      `DELETE FROM external_references WHERE entity_type='sales_order'
         AND entity_id IN (SELECT id FROM sales_orders WHERE number LIKE 'WC-771001%')`);
    await pool.query(`DELETE FROM sales_orders WHERE number LIKE 'WC-771001%'`);
    await pool.query(`DELETE FROM contacts WHERE id IN (
      SELECT entity_id FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='rita@example.com')`);
    await pool.query(`DELETE FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='rita@example.com'`);
  });

  it('Verkauf und Gutschrift ergeben im Umsatz netto 0', async () => {
    const { salesTotals } = await import('@/verkauf/repository');
    const RANGE = { start: '2026-06-01', end: '2026-07-31' };
    const before = (await salesTotals(RANGE)).revenueNet;
    const raw = [{
      id: 771002, number: '771002', status: 'refunded', date_created: '2026-06-23T10:00:00',
      date_paid: '2026-06-23T10:05:00', currency: 'EUR',
      billing: { first_name: 'Nino', last_name: 'Netto', email: 'nino@example.com' },
      line_items: [{ sku: 'SKU-EXIST', quantity: 1, price: 50, total: '50.00' }],
      refunds: [{ id: 990002, total: '-50.00' }],
    }];
    const fetchRefunds = async () => ([{
      id: 990002, date_created: '2026-07-01T09:00:00', amount: '50.00', total_tax: '0',
      line_items: [{ total: '-50.00' }],
    }] as any);
    await importWooCommerceOrders(pool, raw as any, priceListId, fetchRefunds);
    const after = (await salesTotals(RANGE)).revenueNet;
    expect(after - before).toBeCloseTo(0);   // +50 Verkauf, -50 Gutschrift

    await pool.query(
      `DELETE FROM external_references WHERE entity_type='sales_order'
         AND entity_id IN (SELECT id FROM sales_orders WHERE number LIKE 'WC-771002%')`);
    await pool.query(`DELETE FROM sales_orders WHERE number LIKE 'WC-771002%'`);
    await pool.query(`DELETE FROM contacts WHERE id IN (
      SELECT entity_id FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='nino@example.com')`);
    await pool.query(`DELETE FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='nino@example.com'`);
  });

  it('Bestandspfad (bereits importiert) legt beim erneuten Import mit Erstattung ebenfalls eine Gutschrift an', async () => {
    const rawNoRefund = {
      id: 771003, number: '771003', status: 'completed', date_created: '2026-06-24T10:00:00',
      date_paid: '2026-06-24T10:05:00', currency: 'EUR',
      billing: { first_name: 'Bea', last_name: 'Bestand', email: 'bea@example.com' },
      line_items: [{ sku: 'SKU-EXIST', quantity: 1, price: 40, total: '40.00' }],
    };
    // 1. Neuanlage, OHNE fetchRefunds — Ursprungsbeleg entsteht ganz normal.
    const r1 = await importWooCommerceOrders(pool, [rawNoRefund] as any, priceListId);
    expect(r1.ordersCreated).toBe(1);
    expect(r1.creditNotesCreated).toBe(0);

    // 2. Erneuter Import desselben Belegs, jetzt refunded + fetchRefunds gesetzt
    //    → nimmt den BESTANDSPFAD (external_references existiert bereits).
    const rawRefunded = { ...rawNoRefund, status: 'refunded', refunds: [{ id: 990003, total: '-40.00' }] };
    const fetchRefunds = async () => ([{
      id: 990003, date_created: '2026-07-15T08:00:00', amount: '40.00', total_tax: '0',
      line_items: [{ total: '-40.00' }],
    }] as any);
    const r2 = await importWooCommerceOrders(pool, [rawRefunded] as any, priceListId, fetchRefunds);
    expect(r2.ordersCreated).toBe(0);   // Bestandspfad, keine Neuanlage
    expect(r2.creditNotesCreated).toBe(1);

    const o = await pool.query(`SELECT id, status FROM sales_orders WHERE number='WC-771003'`);
    expect(o.rows[0].status).toBe('bezahlt');
    const g = await pool.query(
      `SELECT status, total_net, related_order_id FROM sales_orders WHERE number='WC-771003-R990003'`);
    expect(g.rows.length).toBe(1);
    expect(g.rows[0].status).toBe('retoure');
    expect(Number(g.rows[0].total_net)).toBeCloseTo(-40);
    expect(g.rows[0].related_order_id).toBe(o.rows[0].id);

    await pool.query(
      `DELETE FROM external_references WHERE entity_type='sales_order'
         AND entity_id IN (SELECT id FROM sales_orders WHERE number LIKE 'WC-771003%')`);
    await pool.query(`DELETE FROM sales_orders WHERE number LIKE 'WC-771003%'`);
    await pool.query(`DELETE FROM contacts WHERE id IN (
      SELECT entity_id FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='bea@example.com')`);
    await pool.query(`DELETE FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='bea@example.com'`);
  });

  it('storniert mit Erstattung → KEINE Gutschrift, salesTotals unveraendert', async () => {
    const { salesTotals } = await import('@/verkauf/repository');
    const RANGE = { start: '2026-06-01', end: '2026-07-31' };
    const raw = [{
      id: 771004, number: '771004', status: 'cancelled', date_created: '2026-06-25T10:00:00',
      currency: 'EUR',
      billing: { first_name: 'Stella', last_name: 'Storno', email: 'stella@example.com' },
      line_items: [{ sku: 'SKU-EXIST', quantity: 1, price: 60, total: '60.00' }],
      refunds: [{ id: 990004, total: '-60.00' }],
    }];
    const fetchRefunds = async () => ([{
      id: 990004, date_created: '2026-07-16T08:00:00', amount: '60.00', total_tax: '0',
      line_items: [{ total: '-60.00' }],
    }] as any);

    const before = (await salesTotals(RANGE)).revenueNet;
    const r = await importWooCommerceOrders(pool, raw as any, priceListId, fetchRefunds);
    const after = (await salesTotals(RANGE)).revenueNet;

    expect(r.creditNotesCreated).toBe(0);
    expect(r.creditNotesSkipped).toBe(1);
    expect(after - before).toBeCloseTo(0);   // storniert traegt 0 bei, keine Gutschrift dazu

    const g = await pool.query(`SELECT count(*)::int AS n FROM sales_orders WHERE number LIKE 'WC-771004-R%'`);
    expect(g.rows[0].n).toBe(0);

    await pool.query(
      `DELETE FROM external_references WHERE entity_type='sales_order'
         AND entity_id IN (SELECT id FROM sales_orders WHERE number LIKE 'WC-771004%')`);
    await pool.query(`DELETE FROM sales_orders WHERE number LIKE 'WC-771004%'`);
    await pool.query(`DELETE FROM contacts WHERE id IN (
      SELECT entity_id FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='stella@example.com')`);
    await pool.query(`DELETE FROM external_references WHERE source_system='woocommerce'
        AND entity_type='contact' AND external_id='stella@example.com'`);
  });
});
