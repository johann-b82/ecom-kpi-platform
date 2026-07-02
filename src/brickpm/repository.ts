import { pool } from '@/lib/db';
import type { BpmProduct, BpmPromotion, BpmNotification } from './types';
import { computeCockpitStats, sortHeuteWichtig, type CockpitStats } from './cockpit';

function toDate(v: Date | null): string | null { return v ? v.toISOString().slice(0, 10) : null; }

export async function listProducts(): Promise<BpmProduct[]> {
  const r = await pool.query('SELECT * FROM bpm_products ORDER BY id');
  return r.rows.map((x) => ({
    id: x.id, name: x.name, cat: x.cat, series: x.series, status: x.status, year: x.year, parts: x.parts,
    uvp: x.uvp, price: x.price, cost: x.cost, tMgn: x.t_mgn, mMgn: x.m_mgn, stock: x.stock, minStock: x.min_stock,
    validFrom: toDate(x.valid_from), validTo: toDate(x.valid_to), channel: x.channel, succ: x.succ, descr: x.descr,
  }));
}

export async function listPromotions(): Promise<BpmPromotion[]> {
  const r = await pool.query('SELECT * FROM bpm_promotions ORDER BY id');
  return r.rows.map((x) => ({
    id: x.id, name: x.name, productId: x.product_id, type: x.type, startDate: toDate(x.start_date), endDate: toDate(x.end_date),
    targetUnits: x.target_units, sold: x.sold, targetRev: x.target_rev, expMgn: x.exp_mgn, status: x.status, note: x.note,
  }));
}

export async function listNotifications(): Promise<BpmNotification[]> {
  const r = await pool.query('SELECT * FROM bpm_notifications ORDER BY id');
  return r.rows.map((x) => ({
    id: x.id, type: x.type, priority: x.priority, refId: x.ref_id, msg: x.msg, action: x.action,
    status: x.status, due: toDate(x.due), role: x.role, target: x.target,
  }));
}

export interface CockpitData { stats: CockpitStats; heuteWichtig: BpmNotification[]; offene: BpmNotification[] }

export async function getCockpit(): Promise<CockpitData> {
  const [products, promotions, notifications] = await Promise.all([listProducts(), listPromotions(), listNotifications()]);
  return {
    stats: computeCockpitStats(products, promotions, notifications),
    heuteWichtig: sortHeuteWichtig(notifications),
    offene: notifications.filter((n) => n.status === 'offen'),
  };
}
