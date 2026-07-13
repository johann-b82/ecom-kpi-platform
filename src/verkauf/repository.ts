import { pool } from '@/lib/db';
import type { PoolClient } from 'pg';
import { nextOrderNumber } from './number';
import type {
  SalesOrder, SalesOrderDetail, SalesOrderEvent, SalesOrderInput, SalesOrderLine,
  EventStage, SourceApp, OrderStatus,
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
  versendet: ['rechnung_gestellt', 'storniert'],
  rechnung_gestellt: ['bezahlt', 'storniert'],
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
    `UPDATE stock_levels s SET quantity_reserved = s.quantity_reserved - l.quantity
       FROM sales_order_lines l
      WHERE l.order_id = $1 AND s.variant_id = l.variant_id AND s.warehouse_id = $2`,
    [orderId, wh]);
}

export async function transitionOrderStatus(orderId: string, target: OrderStatus): Promise<SalesOrderDetail> {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
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
        await writeEvent(c, orderId, 'bezahlt', 'finanzen');
        await c.query(`UPDATE open_items SET status = 'bezahlt' WHERE order_id = $1 AND direction = 'debitor'`, [orderId]);
        break;
      case 'storniert':
        if (from === 'auftrag') await releaseReservation(c, orderId);
        break;
    }
    await c.query(`UPDATE sales_orders SET status = $2 WHERE id = $1`, [orderId, target]);
    await c.query('COMMIT');
    return (await getOrder(orderId))!;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
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
