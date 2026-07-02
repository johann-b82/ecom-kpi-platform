import { pool } from '@/lib/db';
import type { BpmProduct, BpmPromotion, BpmNotification } from './types';
import { computeCockpitStats, sortHeuteWichtig, type CockpitStats } from './cockpit';

// DATE columns are cast to text in SQL (`::text` → 'YYYY-MM-DD' or null) so the value is
// timezone-independent — node-pg would otherwise parse a DATE to a JS Date at LOCAL midnight,
// which shifts the day under a positive-offset TZ. Matches the repo's `::text` date pattern.

export async function listProducts(): Promise<BpmProduct[]> {
  const r = await pool.query(
    `SELECT id,name,cat,series,status,year,parts,uvp,price,cost,t_mgn,m_mgn,stock,min_stock,
            valid_from::text AS valid_from, valid_to::text AS valid_to, channel,succ,descr
       FROM bpm_products ORDER BY id`,
  );
  return r.rows.map((x) => ({
    id: x.id, name: x.name, cat: x.cat, series: x.series, status: x.status, year: x.year, parts: x.parts,
    uvp: x.uvp, price: x.price, cost: x.cost, tMgn: x.t_mgn, mMgn: x.m_mgn, stock: x.stock, minStock: x.min_stock,
    validFrom: x.valid_from, validTo: x.valid_to, channel: x.channel, succ: x.succ, descr: x.descr,
  }));
}

export async function listPromotions(): Promise<BpmPromotion[]> {
  const r = await pool.query(
    `SELECT id,name,product_id,type, start_date::text AS start_date, end_date::text AS end_date,
            target_units,sold,target_rev,exp_mgn,status,note
       FROM bpm_promotions ORDER BY id`,
  );
  return r.rows.map((x) => ({
    id: x.id, name: x.name, productId: x.product_id, type: x.type, startDate: x.start_date, endDate: x.end_date,
    targetUnits: x.target_units, sold: x.sold, targetRev: x.target_rev, expMgn: x.exp_mgn, status: x.status, note: x.note,
  }));
}

export async function listNotifications(): Promise<BpmNotification[]> {
  const r = await pool.query(
    `SELECT id,type,priority,ref_id,msg,action,status, due::text AS due, role,target
       FROM bpm_notifications ORDER BY id`,
  );
  return r.rows.map((x) => ({
    id: x.id, type: x.type, priority: x.priority, refId: x.ref_id, msg: x.msg, action: x.action,
    status: x.status, due: x.due, role: x.role, target: x.target,
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
