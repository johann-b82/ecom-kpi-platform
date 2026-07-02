import { pool } from '@/lib/db';
import type { BpmProduct, BpmPromotion, BpmNotification, BpmGoodie, BpmCompetitor } from './types';
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
    `SELECT id,type,priority,ref_id,msg,action,status, due::text AS due, role,target,note
       FROM bpm_notifications ORDER BY id`,
  );
  return r.rows.map((x) => ({
    id: x.id, type: x.type, priority: x.priority, refId: x.ref_id, msg: x.msg, action: x.action,
    status: x.status, due: x.due, role: x.role, target: x.target, note: x.note,
  }));
}

export async function getProduct(id: string): Promise<BpmProduct | null> {
  const list = await listProducts();
  return list.find((p) => p.id === id) ?? null;
}

export async function listGoodies(): Promise<BpmGoodie[]> {
  const r = await pool.query(
    `SELECT id,name,type,cost,price,products,min_cart, valid_from::text AS valid_from, valid_to::text AS valid_to,
            status,mgn_effect,comment FROM bpm_goodies ORDER BY id`,
  );
  return r.rows.map((x) => ({
    id: x.id, name: x.name, type: x.type, cost: x.cost, price: x.price, products: x.products,
    minCart: x.min_cart, validFrom: x.valid_from, validTo: x.valid_to, status: x.status,
    mgnEffect: x.mgn_effect, comment: x.comment,
  }));
}

export async function listCompetitors(): Promise<BpmCompetitor[]> {
  const r = await pool.query(
    `SELECT id,product_id,competitor,comp_product,own_price,comp_price,avail, date::text AS date, rec
       FROM bpm_competitors ORDER BY id`,
  );
  return r.rows.map((x) => ({
    id: x.id, productId: x.product_id, competitor: x.competitor, compProduct: x.comp_product,
    ownPrice: x.own_price, compPrice: x.comp_price, avail: x.avail, date: x.date, rec: x.rec,
  }));
}

export interface AuditEntry { id: number; ts: string; actor: string | null; action: string; detail: string | null }
export async function listAuditLog(limit = 50): Promise<AuditEntry[]> {
  const r = await pool.query(
    `SELECT id, ts::text AS ts, actor, action, detail FROM bpm_audit_log ORDER BY id DESC LIMIT $1`, [limit],
  );
  return r.rows.map((x) => ({ id: x.id, ts: x.ts, actor: x.actor, action: x.action, detail: x.detail }));
}

export async function writeAudit(actor: string | null, action: string, detail: string | null): Promise<void> {
  await pool.query('INSERT INTO bpm_audit_log (actor, action, detail) VALUES ($1,$2,$3)', [actor, action, detail]);
}

export async function setNotificationStatus(id: string, status: string, actor: string | null): Promise<void> {
  await pool.query('UPDATE bpm_notifications SET status = $2 WHERE id = $1', [id, status]);
  await writeAudit(actor, 'notification.status', `${id} → ${status}`);
}

export async function simulateIntegration(id: string, actor: string | null): Promise<void> {
  const now = new Date().toISOString().slice(0, 16).replace('T', ' ');
  await pool.query('UPDATE bpm_integrations SET last_sync = $2 WHERE id = $1', [id, now]);
  await writeAudit(actor, 'integration.sync', `${id} @ ${now}`);
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
