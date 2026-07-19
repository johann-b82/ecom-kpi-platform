import { pool } from '@/lib/db';
import type { DateRange } from '@/lib/types';
import type { OrderChannel, OrderStatus } from '@/verkauf/types';

const REV = "o.status <> 'storniert'";
const ORDER_DATE = 'COALESCE(o.placed_at, o.created_at)::date';

export interface CustomerMetricRow {
  contactId: string; name: string; segment: 'geschaeft' | 'privat';
  orders: number; revenueNet: number; avgOrderValueNet: number;
  lastOrderAt: string | null; daysSinceLast: number | null;
  lifetimeOrders: number; clv: number; isReturning: boolean;
}

// Alle Kunden mit >=1 Lifetime-Beleg (optional segmentgefiltert): Perioden-Kennzahlen
// (Umsatz/#/AOV im Zeitraum) + Lifetime-Kennzahlen (letzte Bestellung, CLV, Wiederkäufer).
export async function customerMetrics(
  range: DateRange, opts: { segment?: 'geschaeft' | 'privat' } = {},
): Promise<CustomerMetricRow[]> {
  const r = await pool.query(
    `WITH lifetime AS (
       SELECT o.contact_id,
              COUNT(DISTINCT o.id) FILTER (WHERE ${REV}) AS lt_orders,
              COALESCE(SUM(l.quantity*l.unit_price) FILTER (WHERE ${REV}),0)::float8 AS clv,
              MAX(${ORDER_DATE}) FILTER (WHERE ${REV}) AS last_order
         FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id=o.id
        GROUP BY o.contact_id
     ),
     period AS (
       SELECT o.contact_id,
              COUNT(DISTINCT o.id) FILTER (WHERE ${REV}) AS p_orders,
              COALESCE(SUM(l.quantity*l.unit_price) FILTER (WHERE ${REV}),0)::float8 AS p_revenue
         FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id=o.id
        WHERE ${ORDER_DATE} BETWEEN $1 AND $2
        GROUP BY o.contact_id
     )
     SELECT c.id, c.name, c.segment,
            COALESCE(p.p_orders,0)::int AS orders,
            COALESCE(p.p_revenue,0)::float8 AS revenue,
            lt.last_order::text AS last_order,
            (CURRENT_DATE - lt.last_order)::int AS days_since_last,
            lt.lt_orders::int AS lifetime_orders,
            lt.clv::float8 AS clv
       FROM contacts c
       JOIN lifetime lt ON lt.contact_id=c.id AND lt.lt_orders >= 1
       LEFT JOIN period p ON p.contact_id=c.id
      WHERE c.is_customer = true
        AND ($3::text IS NULL OR c.segment = $3)
      ORDER BY revenue DESC, c.name`,
    [range.start, range.end, opts.segment ?? null]);
  return r.rows.map((x: any) => {
    const orders = Number(x.orders), revenueNet = Number(x.revenue);
    return {
      contactId: x.id, name: x.name, segment: x.segment,
      orders, revenueNet, avgOrderValueNet: orders > 0 ? revenueNet / orders : 0,
      lastOrderAt: x.last_order, daysSinceLast: x.days_since_last === null ? null : Number(x.days_since_last),
      lifetimeOrders: Number(x.lifetime_orders), clv: Number(x.clv),
      isReturning: Number(x.lifetime_orders) >= 2,
    };
  });
}

export interface CustomerSummary {
  orders: number; revenueNet: number; avgOrderValueNet: number;
  firstOrderAt: string | null; lastOrderAt: string | null;
  isReturning: boolean; clv: number;
}

export async function customerSummary(contactId: string): Promise<CustomerSummary> {
  const r = await pool.query(
    `SELECT COUNT(DISTINCT o.id) FILTER (WHERE ${REV})::int AS orders,
            COALESCE(SUM(l.quantity*l.unit_price) FILTER (WHERE ${REV}),0)::float8 AS revenue,
            MIN(${ORDER_DATE}) FILTER (WHERE ${REV})::text AS first_order,
            MAX(${ORDER_DATE}) FILTER (WHERE ${REV})::text AS last_order
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id=o.id
      WHERE o.contact_id = $1`, [contactId]);
  const x = r.rows[0];
  const orders = Number(x.orders), revenueNet = Number(x.revenue);
  return {
    orders, revenueNet, avgOrderValueNet: orders > 0 ? revenueNet / orders : 0,
    firstOrderAt: x.first_order, lastOrderAt: x.last_order,
    isReturning: orders >= 2, clv: revenueNet,
  };
}

export interface CustomerOrderRow {
  id: string; number: string; placedAt: string; channel: OrderChannel;
  status: OrderStatus; revenueNet: number;
}

export async function customerOrders(contactId: string): Promise<CustomerOrderRow[]> {
  const r = await pool.query(
    `SELECT o.id, o.number, ${ORDER_DATE}::text AS placed_at, o.channel, o.status,
            COALESCE(SUM(l.quantity*l.unit_price),0)::float8 AS revenue
       FROM sales_orders o LEFT JOIN sales_order_lines l ON l.order_id=o.id
      WHERE o.contact_id=$1
      GROUP BY o.id
      ORDER BY ${ORDER_DATE} DESC, o.number DESC`, [contactId]);
  return r.rows.map((x: any) => ({
    id: x.id, number: x.number, placedAt: x.placed_at, channel: x.channel,
    status: x.status, revenueNet: Number(x.revenue),
  }));
}
