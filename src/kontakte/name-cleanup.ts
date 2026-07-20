import type { Pool, PoolClient } from 'pg';
import { cleanContactName, realCompany, type BillingName } from './name';

// Rechnet je WooCommerce-Kontakt den Namen aus dem gespiegelten Billing neu und
// aktualisiert nur, wenn er sich ändert. Idempotent. Gibt die Anzahl der Änderungen zurück.
export async function cleanContactNames(db: Pool | PoolClient): Promise<number> {
  const r = await db.query<{ id: string; name: string; billing: BillingName }>(
    `SELECT c.id, c.name, er.raw_payload AS billing
       FROM contacts c
       JOIN external_references er
         ON er.entity_type = 'contact' AND er.source_system = 'woocommerce' AND er.entity_id = c.id`);
  let changed = 0;
  for (const row of r.rows) {
    const next = cleanContactName(row.billing ?? {});
    if (next && next !== row.name) {
      await db.query(`UPDATE contacts SET name = $2 WHERE id = $1`, [row.id, next]);
      changed++;
    }
  }
  return changed;
}

// Rechnet je WooCommerce-Kontakt das Segment aus dem Billing neu (echter Firmenname
// → geschaeft, sonst privat — via realCompany, das Platzhalter verwirft) und
// aktualisiert nur bei Änderung. Idempotent. Gibt die Anzahl der Änderungen zurück.
export async function cleanContactSegments(db: Pool | PoolClient): Promise<number> {
  const r = await db.query<{ id: string; segment: string; billing: BillingName }>(
    `SELECT c.id, c.segment, er.raw_payload AS billing
       FROM contacts c
       JOIN external_references er
         ON er.entity_type = 'contact' AND er.source_system = 'woocommerce' AND er.entity_id = c.id`);
  let changed = 0;
  for (const row of r.rows) {
    const next = realCompany(row.billing ?? {}) ? 'geschaeft' : 'privat';
    if (next !== row.segment) {
      await db.query(`UPDATE contacts SET segment = $2 WHERE id = $1`, [row.id, next]);
      changed++;
    }
  }
  return changed;
}
