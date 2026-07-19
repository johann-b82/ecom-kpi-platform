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

// Top-N Kunden mit >=1 Lifetime-Beleg (optional segmentgefiltert), nach Umsatz
// absteigend: Perioden-Kennzahlen (Umsatz/#/AOV im Zeitraum) + Lifetime-Kennzahlen
// (letzte Bestellung, CLV, Wiederkäufer). `limit` begrenzt die Tabellenzeilen
// (Default 500) — die aggregierten Kopf-KPIs kommen aus customerKpis (voller Bestand).
export async function customerMetrics(
  range: DateRange, opts: { segment?: 'geschaeft' | 'privat'; limit?: number } = {},
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
      ORDER BY revenue DESC, c.name
      LIMIT $4`,
    [range.start, range.end, opts.segment ?? null, opts.limit ?? 500]);
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

export interface CustomerKpis {
  activeCustomers: number; revenueNet: number; orders: number;
  returningCustomers: number; totalCustomers: number;
}

// Aggregierte Kopf-KPIs über den VOLLEN Kundenbestand (nicht die Top-N-Tabelle):
// aktive Kunden (>=1 Beleg im Zeitraum), Perioden-Umsatz/#, Wiederkäufer (lifetime>=2)
// unter den aktiven, und Gesamtzahl der Kunden mit >=1 Lifetime-Beleg.
export async function customerKpis(
  range: DateRange, opts: { segment?: 'geschaeft' | 'privat' } = {},
): Promise<CustomerKpis> {
  const inRange = `${ORDER_DATE} BETWEEN $1 AND $2`;
  const r = await pool.query(
    `WITH per AS (
       SELECT c.id,
              COUNT(DISTINCT o.id) FILTER (WHERE ${REV} AND ${inRange})::int AS p_orders,
              COALESCE(SUM(l.quantity*l.unit_price) FILTER (WHERE ${REV} AND ${inRange}),0)::float8 AS p_revenue,
              COUNT(DISTINCT o.id) FILTER (WHERE ${REV})::int AS lt_orders
         FROM contacts c
         JOIN sales_orders o ON o.contact_id = c.id
         LEFT JOIN sales_order_lines l ON l.order_id = o.id
        WHERE c.is_customer = true AND ($3::text IS NULL OR c.segment = $3)
        GROUP BY c.id
       HAVING COUNT(DISTINCT o.id) FILTER (WHERE ${REV}) >= 1
     )
     SELECT COUNT(*) FILTER (WHERE p_orders > 0)::int AS active_customers,
            COALESCE(SUM(p_revenue),0)::float8 AS revenue,
            COALESCE(SUM(p_orders),0)::int AS orders,
            COUNT(*) FILTER (WHERE p_orders > 0 AND lt_orders >= 2)::int AS returning_customers,
            COUNT(*)::int AS total_customers
       FROM per`,
    [range.start, range.end, opts.segment ?? null]);
  const x = r.rows[0];
  return {
    activeCustomers: Number(x.active_customers), revenueNet: Number(x.revenue),
    orders: Number(x.orders), returningCustomers: Number(x.returning_customers),
    totalCustomers: Number(x.total_customers),
  };
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
