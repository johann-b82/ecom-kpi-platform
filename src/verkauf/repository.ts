import { pool } from '@/lib/db';
import type { PoolClient } from 'pg';
import { nextOrderNumber } from './number';
import type {
  SalesOrder, SalesOrderDetail, SalesOrderEvent, SalesOrderInput, SalesOrderLine,
  EventStage, SourceApp, OrderStatus, OrderChannel,
  OrderRow, OrderView, SellableVariant, CustomerOption, PriceEntry,
  DateRange, SalesTotals, ChannelSummary, StatusCount,
} from './types';

const ORDER_COLS = `id, tenant_id, number, contact_id, channel, status, price_list_id,
  related_order_id, currency, placed_at::text AS placed_at, created_at::text AS created_at`;

function mapOrder(x: any): SalesOrder {
  return {
    id: x.id, tenantId: x.tenant_id, number: x.number, contactId: x.contact_id,
    channel: x.channel, status: x.status, priceListId: x.price_list_id,
    relatedOrderId: x.related_order_id, currency: x.currency,
    placedAt: x.placed_at, createdAt: x.created_at,
  };
}
function mapLine(x: any): SalesOrderLine {
  return { id: x.id, orderId: x.order_id, variantId: x.variant_id, quantity: x.quantity, unitPrice: Number(x.unit_price) };
}
function mapEvent(x: any): SalesOrderEvent {
  return {
    id: x.id, orderId: x.order_id, stage: x.stage, sourceApp: x.source_app,
    note: x.note, automated: x.automated, occurredAt: x.occurred_at,
  };
}

export async function listOrders(): Promise<SalesOrder[]> {
  const r = await pool.query(`SELECT ${ORDER_COLS} FROM sales_orders ORDER BY number`);
  return r.rows.map(mapOrder);
}

export async function getOrder(id: string): Promise<SalesOrderDetail | null> {
  const r = await pool.query(`SELECT ${ORDER_COLS} FROM sales_orders WHERE id = $1`, [id]);
  if (r.rows.length === 0) return null;
  const order = mapOrder(r.rows[0]);
  const lines = await pool.query(
    `SELECT id, order_id, variant_id, quantity, unit_price FROM sales_order_lines WHERE order_id = $1 ORDER BY id`, [id]);
  const events = await pool.query(
    `SELECT id, order_id, stage, source_app, note, automated, occurred_at::text AS occurred_at
       FROM sales_order_events WHERE order_id = $1 ORDER BY occurred_at`, [id]);
  return { ...order, lines: lines.rows.map(mapLine), events: events.rows.map(mapEvent) };
}

// ── interne Seiteneffekt-Helfer (laufen innerhalb einer Transaktion) ──

async function writeEvent(
  c: PoolClient, orderId: string, stage: EventStage, sourceApp: SourceApp, automated = false, note: string | null = null,
): Promise<void> {
  await c.query(
    `INSERT INTO sales_order_events (order_id, stage, source_app, automated, note)
     VALUES ($1,$2,$3,$4,$5)`,
    [orderId, stage, sourceApp, automated, note]);
}

async function defaultWarehouseId(c: PoolClient): Promise<string> {
  const r = await c.query<{ id: string }>('SELECT id FROM warehouses WHERE is_default LIMIT 1');
  if (r.rows.length === 0) throw new Error('Kein Standardlager (is_default) definiert.');
  return r.rows[0].id;
}

// Phase-2-Vereinfachung: Reservierung auf dem Standardlager. Die Aggregatzahl
// SUM(reserved) bleibt korrekt; lagergenaues Festnageln erfolgt bewusst nicht (§5).
async function reserveStock(c: PoolClient, orderId: string): Promise<void> {
  const wh = await defaultWarehouseId(c);
  await c.query(
    `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_reserved)
       SELECT variant_id, $2, SUM(quantity) FROM sales_order_lines WHERE order_id = $1 GROUP BY variant_id
     ON CONFLICT (variant_id, warehouse_id)
       DO UPDATE SET quantity_reserved = stock_levels.quantity_reserved + excluded.quantity_reserved`,
    [orderId, wh]);
}

export async function createOrder(input: SalesOrderInput): Promise<SalesOrderDetail> {
  const startsAsAuftrag = input.channel === 'shop' || input.channel === 'marktplatz';
  const status = startsAsAuftrag ? 'auftrag' : 'angebot';
  const c = await pool.connect();
  let orderId: string;
  try {
    await c.query('BEGIN');
    const existing = await c.query<{ number: string }>('SELECT number FROM sales_orders');
    const number = nextOrderNumber(existing.rows.map((x) => x.number), new Date().getFullYear());
    const ins = await c.query(
      `INSERT INTO sales_orders (number, contact_id, channel, status, price_list_id, currency, placed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [number, input.contactId, input.channel, status, input.priceListId ?? null,
       input.currency ?? 'EUR', input.placedAt ?? null]);
    orderId = ins.rows[0].id as string;
    for (const l of input.lines) {
      await c.query(
        `INSERT INTO sales_order_lines (order_id, variant_id, quantity, unit_price) VALUES ($1,$2,$3,$4)`,
        [orderId, l.variantId, l.quantity, l.unitPrice]);
    }
    if (startsAsAuftrag) {
      await writeEvent(c, orderId, 'bestellt', 'verkauf', true);
      await reserveStock(c, orderId);
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
  return (await getOrder(orderId))!;
}

const ALLOWED: Record<OrderStatus, OrderStatus[]> = {
  angebot: ['auftrag', 'storniert'],
  auftrag: ['versendet', 'storniert'],
  versendet: ['rechnung_gestellt'],
  rechnung_gestellt: ['bezahlt'],
  bezahlt: [],       // Retoure läuft über createReturn (neuer Beleg), nicht über einen Statuswechsel
  retoure: [],
  storniert: [],
};

async function shipStock(c: PoolClient, orderId: string): Promise<void> {
  const wh = await defaultWarehouseId(c);
  const lines = await c.query<{ variant_id: string; quantity: number }>(
    `SELECT variant_id, quantity FROM sales_order_lines WHERE order_id = $1`, [orderId]);
  for (const l of lines.rows) {
    // Reservierung auf dem Standardlager freigeben ...
    await c.query(
      `UPDATE stock_levels SET quantity_reserved = quantity_reserved - $3
         WHERE variant_id = $1 AND warehouse_id = $2`, [l.variant_id, wh, l.quantity]);
    // ... und aus dem Lager mit dem höchsten Bestand entnehmen (Phase-2-simpel, überschreibbar später).
    const pick = await c.query<{ warehouse_id: string }>(
      `SELECT warehouse_id FROM stock_levels WHERE variant_id = $1 ORDER BY quantity_on_hand DESC LIMIT 1`,
      [l.variant_id]);
    const pickWh = pick.rows[0]?.warehouse_id ?? wh;
    await c.query(
      `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand)
         VALUES ($1,$2,$3)
       ON CONFLICT (variant_id, warehouse_id)
         DO UPDATE SET quantity_on_hand = stock_levels.quantity_on_hand - $3`,
      [l.variant_id, pickWh, l.quantity]);
  }
}

async function createDebitorOpenItem(c: PoolClient, orderId: string): Promise<void> {
  await c.query(
    `INSERT INTO open_items (direction, contact_id, reference, order_id, amount, due_date, status)
     SELECT 'debitor', o.contact_id, o.number, o.id,
            (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM sales_order_lines WHERE order_id = o.id),
            (CURRENT_DATE + (ct.payment_terms * INTERVAL '1 day'))::date, 'offen'
       FROM sales_orders o JOIN contacts ct ON ct.id = o.contact_id
      WHERE o.id = $1`,
    [orderId]);
}

async function releaseReservation(c: PoolClient, orderId: string): Promise<void> {
  const wh = await defaultWarehouseId(c);
  await c.query(
    `UPDATE stock_levels s SET quantity_reserved = s.quantity_reserved - agg.qty
       FROM (SELECT variant_id, SUM(quantity) AS qty FROM sales_order_lines WHERE order_id = $1 GROUP BY variant_id) agg
      WHERE s.variant_id = agg.variant_id AND s.warehouse_id = $2`,
    [orderId, wh]);
}

export async function transitionOrderStatus(
  orderId: string, target: OrderStatus, client?: PoolClient,
): Promise<SalesOrderDetail> {
  const c = client ?? await pool.connect();
  const ownTx = !client;
  try {
    if (ownTx) await c.query('BEGIN');
    const cur = await c.query<{ status: OrderStatus }>(
      `SELECT status FROM sales_orders WHERE id = $1 FOR UPDATE`, [orderId]);
    if (cur.rows.length === 0) throw new Error(`Beleg ${orderId} nicht gefunden.`);
    const from = cur.rows[0].status;
    if (!ALLOWED[from].includes(target)) {
      throw new Error(`Übergang ${from} → ${target} ist nicht erlaubt.`);
    }
    switch (target) {
      case 'auftrag':
        await writeEvent(c, orderId, 'bestellt', 'verkauf');
        await reserveStock(c, orderId);
        break;
      case 'versendet':
        await writeEvent(c, orderId, 'kommissioniert', 'verfuegbarkeit');
        await shipStock(c, orderId);
        break;
      case 'rechnung_gestellt':
        await writeEvent(c, orderId, 'rechnung_gestellt', 'verkauf');
        await createDebitorOpenItem(c, orderId);
        break;
      case 'bezahlt':
        // Lock-Reihenfolge im own-tx-Modus: sales_orders (SELECT … FOR UPDATE oben)
        // ZUERST, open_items DANACH. Finanzen (recordPayment/assignPayment) lockt
        // umgekehrt (open_items FOR UPDATE, dann via Client-Modus sales_orders).
        // Heute unkritisch — 'bezahlt' ist zur Laufzeit nur über Finanzen (Client-Modus,
        // gemeinsame Transaktion) erreichbar, der own-tx-Pfad nur im Seed. ACHTUNG bei
        // einer künftigen „auf bezahlt setzen"-Aktion AUSSERHALB Finanzen: dort open_items
        // vor sales_orders locken (oder transitionOrderStatus im Client-Modus nutzen),
        // sonst Deadlock-Gefahr durch inverse Lock-Reihenfolge.
        await writeEvent(c, orderId, 'bezahlt', 'finanzen');
        await c.query(`UPDATE open_items SET status = 'bezahlt' WHERE order_id = $1 AND direction = 'debitor'`, [orderId]);
        break;
      case 'storniert':
        if (from === 'auftrag') await releaseReservation(c, orderId);
        break;
    }
    await c.query(`UPDATE sales_orders SET status = $2 WHERE id = $1`, [orderId, target]);
    if (ownTx) await c.query('COMMIT');
    // Hinweis: im Aufrufer-Client-Modus liest getOrder über den pool (separate
    // Verbindung) den noch nicht committeten Stand nicht — der Rückgabewert ist
    // nur im self-managed Modus aussagekräftig. Aufrufer im Client-Modus
    // (recordPayment) ignorieren ihn.
    return (await getOrder(orderId))!;
  } catch (e) {
    if (ownTx) await c.query('ROLLBACK');
    throw e;
  } finally {
    if (ownTx) c.release();
  }
}

export async function createReturn(originalOrderId: string): Promise<SalesOrderDetail> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const orig = await c.query(
      `SELECT ${ORDER_COLS} FROM sales_orders WHERE id = $1 FOR UPDATE`, [originalOrderId]);
    if (orig.rows.length === 0) throw new Error(`Beleg ${originalOrderId} nicht gefunden.`);
    const o = mapOrder(orig.rows[0]);
    if (o.status !== 'bezahlt') throw new Error('Retoure nur aus Status bezahlt möglich.');

    const existing = await c.query<{ number: string }>('SELECT number FROM sales_orders');
    const number = nextOrderNumber(existing.rows.map((x) => x.number), new Date().getFullYear());
    const ins = await c.query(
      `INSERT INTO sales_orders (number, contact_id, channel, status, price_list_id, related_order_id, currency)
       VALUES ($1,$2,$3,'retoure',$4,$5,$6) RETURNING id`,
      [number, o.contactId, o.channel, o.priceListId, originalOrderId, o.currency]);
    const creditId = ins.rows[0].id as string;

    // Positionen des Ursprungs gespiegelt mit negativer Menge
    await c.query(
      `INSERT INTO sales_order_lines (order_id, variant_id, quantity, unit_price)
         SELECT $2, variant_id, -quantity, unit_price FROM sales_order_lines WHERE order_id = $1`,
      [originalOrderId, creditId]);

    // Retoure-Perle am URSPRUNGSBELEG
    await writeEvent(c, originalOrderId, 'retoure', 'verkauf');

    // Bestand zurückbuchen (Standardlager); je Variante aggregiert, damit ein
    // Ursprung mit zwei Zeilen auf derselben Variante nicht denselben
    // ON CONFLICT-Datensatz zweimal trifft (siehe reserveStock).
    const wh = await defaultWarehouseId(c);
    await c.query(
      `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand)
         SELECT variant_id, $2, SUM(quantity) FROM sales_order_lines WHERE order_id = $1 GROUP BY variant_id
       ON CONFLICT (variant_id, warehouse_id)
         DO UPDATE SET quantity_on_hand = stock_levels.quantity_on_hand + excluded.quantity_on_hand`,
      [originalOrderId, wh]);

    await c.query('COMMIT');
    return (await getOrder(creditId))!;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}

export async function listOrderRows(channel?: OrderChannel): Promise<OrderRow[]> {
  const r = await pool.query(
    `SELECT o.id, o.number, o.contact_id, c.name AS contact_name, o.channel, o.status,
            o.created_at::text AS created_at,
            COALESCE(array_agg(e.stage ORDER BY e.occurred_at) FILTER (WHERE e.stage IS NOT NULL), '{}') AS stages
       FROM sales_orders o
       JOIN contacts c ON c.id = o.contact_id
       LEFT JOIN sales_order_events e ON e.order_id = o.id
      WHERE ($1::text IS NULL OR o.channel = $1)
      GROUP BY o.id, c.name
      ORDER BY o.created_at DESC`, [channel ?? null]);
  return r.rows.map((x: any) => ({
    id: x.id, number: x.number, contactId: x.contact_id, contactName: x.contact_name,
    channel: x.channel, status: x.status, createdAt: x.created_at, stages: x.stages,
  }));
}

export async function salesTotals(range: DateRange): Promise<SalesTotals> {
  const rev = await pool.query(
    `SELECT COALESCE(SUM(l.quantity * l.unit_price), 0)::float8 AS revenue,
            COUNT(DISTINCT o.id)::int AS orders
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id = o.id
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND o.status NOT IN ('angebot','storniert')`,
    [range.start, range.end]);
  const off = await pool.query(
    `SELECT COUNT(*)::int AS open_offers FROM sales_orders o
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND o.status = 'angebot'`,
    [range.start, range.end]);
  const revenueNet = Number(rev.rows[0].revenue);
  const orders = rev.rows[0].orders;
  return {
    revenueNet, orders,
    avgOrderValueNet: orders > 0 ? revenueNet / orders : 0,
    openOffers: off.rows[0].open_offers,
  };
}

export async function channelSummary(range: DateRange): Promise<ChannelSummary[]> {
  const r = await pool.query(
    `SELECT o.channel, COUNT(DISTINCT o.id)::int AS orders,
            COALESCE(SUM(l.quantity * l.unit_price), 0)::float8 AS revenue
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id = o.id
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
        AND o.status NOT IN ('angebot','storniert')
      GROUP BY o.channel`,
    [range.start, range.end]);
  const by = new Map<string, any>(r.rows.map((x: any) => [x.channel, x]));
  const CH: OrderChannel[] = ['shop', 'b2b_portal', 'marktplatz', 'telefon', 'manuell'];
  return CH.map((channel) => {
    const row = by.get(channel);
    const orders = row ? row.orders : 0;
    const revenueNet = row ? Number(row.revenue) : 0;
    return { channel, orders, revenueNet, avgOrderValueNet: orders > 0 ? revenueNet / orders : 0 };
  });
}

export async function statusFunnel(range: DateRange): Promise<StatusCount[]> {
  const r = await pool.query(
    `SELECT status, COUNT(*)::int AS count FROM sales_orders o
      WHERE COALESCE(o.placed_at, o.created_at)::date BETWEEN $1 AND $2
      GROUP BY status`,
    [range.start, range.end]);
  const by = new Map<string, number>(r.rows.map((x: any) => [x.status, x.count]));
  const ALL: OrderStatus[] =
    ['angebot', 'auftrag', 'versendet', 'rechnung_gestellt', 'bezahlt', 'retoure', 'storniert'];
  return ALL.map((status) => ({ status, count: by.get(status) ?? 0 }));
}

export async function getOrderView(id: string): Promise<OrderView | null> {
  const base = await getOrder(id);
  if (!base) return null;
  const c = await pool.query(`SELECT name FROM contacts WHERE id = $1`, [base.contactId]);
  const lines = await pool.query(
    `SELECT l.id, l.variant_id, l.quantity, l.unit_price, v.sku, p.name AS product_name
       FROM sales_order_lines l
       JOIN product_variants v ON v.id = l.variant_id
       JOIN products p ON p.id = v.product_id
      WHERE l.order_id = $1 ORDER BY l.id`, [id]);
  return {
    ...base,
    contactName: c.rows[0]?.name ?? '',
    lines: lines.rows.map((x: any) => ({
      id: x.id, variantId: x.variant_id, sku: x.sku, productName: x.product_name,
      quantity: x.quantity, unitPrice: Number(x.unit_price),
    })),
    events: base.events,
  };
}

export async function sellableVariants(): Promise<SellableVariant[]> {
  const r = await pool.query(
    `SELECT v.id AS variant_id, v.sku, p.name AS product_name,
            COALESCE((SELECT SUM(quantity_on_hand) - SUM(quantity_reserved)
                        FROM stock_levels s WHERE s.variant_id = v.id), 0)::int AS available
       FROM product_variants v JOIN products p ON p.id = v.product_id
      WHERE v.status = 'aktiv'
      ORDER BY p.name, v.sku`);
  return r.rows.map((x: any) => ({
    variantId: x.variant_id, sku: x.sku, productName: x.product_name, available: x.available,
  }));
}

export async function priceForVariant(variantId: string, priceListId: string, qty = 1): Promise<number | null> {
  const r = await pool.query(
    `SELECT amount FROM prices
      WHERE variant_id = $1 AND price_list_id = $2 AND min_qty <= $3
      ORDER BY min_qty DESC LIMIT 1`, [variantId, priceListId, qty]);
  return r.rows.length ? Number(r.rows[0].amount) : null;
}

export async function availableStock(variantId: string): Promise<number> {
  const r = await pool.query(
    `SELECT COALESCE(SUM(quantity_on_hand) - SUM(quantity_reserved), 0)::int AS available
       FROM stock_levels WHERE variant_id = $1`, [variantId]);
  return r.rows[0].available;
}

export async function listCustomerOptions(): Promise<CustomerOption[]> {
  const r = await pool.query(
    `SELECT c.id, c.name, c.price_list_id, c.payment_terms,
            (SELECT street || ', ' || zip || ' ' || city FROM contact_addresses a
               WHERE a.contact_id = c.id AND a.type = 'lieferung'
               ORDER BY a.is_default DESC LIMIT 1) AS delivery_label
       FROM contacts c WHERE c.is_customer = true ORDER BY c.name`);
  return r.rows.map((x: any) => ({
    id: x.id, name: x.name, priceListId: x.price_list_id,
    paymentTerms: x.payment_terms, deliveryLabel: x.delivery_label,
  }));
}

export async function defaultPrices(): Promise<PriceEntry[]> {
  const r = await pool.query(`SELECT variant_id, price_list_id, amount FROM prices WHERE min_qty = 1`);
  return r.rows.map((x: any) => ({
    variantId: x.variant_id, priceListId: x.price_list_id, amount: Number(x.amount),
  }));
}
