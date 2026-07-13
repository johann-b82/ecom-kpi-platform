import { pool } from '@/lib/db';
import type { PoolClient } from 'pg';
import { nextOrderNumber } from './number';
import type {
  SalesOrder, SalesOrderDetail, SalesOrderEvent, SalesOrderInput, SalesOrderLine,
  EventStage, SourceApp,
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
