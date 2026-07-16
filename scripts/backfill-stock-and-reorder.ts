// Backfill für Verfügbarkeit · Bestand:
//  1) physischer Bestand aus den WooCommerce-Rohdaten (external_references
//     raw_payload.stock_quantity) ins Standardlager,
//  2) Default-Meldebestand = 4-Wochen-Absatzpuffer, nur wo noch keiner gesetzt ist.
// Idempotent und wiederholbar. Der Katalog-Import lief bewusst bestandsneutral;
// dieses Skript zieht den Ist-Bestand nachträglich aus demselben Rohdatenspiegel.
import { pool } from '../src/lib/db';
import { reorderBufferUnits } from '../src/verfuegbarkeit/reorder';

const WINDOW_DAYS = 84; // 12-Wochen-Absatzfenster, auf 4 Wochen hochgerechnet (glättet Ausreißer)
const WEEKS = 4;

async function main() {
  const wh = await pool.query<{ id: string }>('SELECT id FROM warehouses WHERE is_default LIMIT 1');
  if (wh.rows.length === 0) throw new Error('Kein Standardlager (is_default) definiert.');
  const warehouseId = wh.rows[0].id;

  // 1) Bestand aus WooCommerce-Rohdaten ins Standardlager. DISTINCT ON, damit ein
  // Variant mit mehreren Referenzen den ON-CONFLICT-Datensatz nicht zweimal trifft.
  const stock = await pool.query(
    `INSERT INTO stock_levels (variant_id, warehouse_id, quantity_on_hand)
     SELECT variant_id, $1, qty FROM (
       SELECT DISTINCT ON (er.entity_id)
              er.entity_id AS variant_id,
              (er.raw_payload->>'stock_quantity')::int AS qty
         FROM external_references er
        WHERE er.source_system = 'woocommerce'
          AND er.entity_type = 'product_variant'
          AND (er.raw_payload->>'stock_quantity') ~ '^-?[0-9]+$'
        ORDER BY er.entity_id, er.last_synced_at DESC
     ) s
     ON CONFLICT (variant_id, warehouse_id)
       DO UPDATE SET quantity_on_hand = EXCLUDED.quantity_on_hand`,
    [warehouseId]);
  console.log(`Bestand gesetzt: ${stock.rowCount} Varianten (Standardlager).`);

  // 2) Default-Meldebestand aus dem Absatz der letzten WINDOW_DAYS Tage.
  const sales = await pool.query<{ variant_id: string; units: string }>(
    `SELECT l.variant_id, SUM(l.quantity)::int AS units
       FROM sales_order_lines l
       JOIN sales_orders o ON o.id = l.order_id
      WHERE COALESCE(o.placed_at, o.created_at)::date >= (CURRENT_DATE - $1::int)
        AND o.status NOT IN ('angebot','storniert')
      GROUP BY l.variant_id`,
    [WINDOW_DAYS]);

  let updated = 0;
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    for (const row of sales.rows) {
      const reorder = reorderBufferUnits(Number(row.units), WINDOW_DAYS, WEEKS);
      if (reorder <= 0) continue;
      const r = await c.query(
        `UPDATE product_variants SET reorder_point = $2
          WHERE id = $1 AND (reorder_point IS NULL OR reorder_point = 0)`,
        [row.variant_id, reorder]);
      updated += r.rowCount ?? 0;
    }
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
  console.log(`Meldebestand (Default, ${WEEKS} Wochen Absatz) gesetzt: ${updated} Varianten.`);

  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
