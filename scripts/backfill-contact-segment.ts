// Backfill B2C-Segment für bereits importierte WooCommerce-Kontakte:
// Billing ohne Firmenname → 'privat'. Der Firmenname liegt im gespiegelten
// Rohdaten-Payload (external_references.raw_payload = billing). Manuelle/übrige
// Kontakte behalten den Default 'geschaeft'. Idempotent.
import { pool } from '../src/lib/db';

async function main() {
  const priv = await pool.query(
    `UPDATE contacts c SET segment = 'privat'
       FROM external_references er
      WHERE er.entity_type = 'contact' AND er.source_system = 'woocommerce'
        AND er.entity_id = c.id
        AND NULLIF(TRIM(er.raw_payload->>'company'), '') IS NULL
        AND c.segment <> 'privat'`);
  const geschaeft = await pool.query(
    `UPDATE contacts c SET segment = 'geschaeft'
       FROM external_references er
      WHERE er.entity_type = 'contact' AND er.source_system = 'woocommerce'
        AND er.entity_id = c.id
        AND NULLIF(TRIM(er.raw_payload->>'company'), '') IS NOT NULL
        AND c.segment <> 'geschaeft'`);
  console.log(`Segment gesetzt: privat=${priv.rowCount}, geschaeft=${geschaeft.rowCount}.`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
