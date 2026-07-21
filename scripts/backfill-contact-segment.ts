// Backfill B2C-Segment für importierte WooCommerce-Kontakte aus dem gespiegelten
// Billing (external_references.raw_payload): echter Firmenname → 'geschaeft',
// sonst 'privat'. Platzhalter-Firmennamen (z. B. „-- Anrede wählen --") werden via
// realCompany verworfen → korrekt 'privat'. Idempotent. Manuelle Kontakte unberührt.
import { pool } from '../src/lib/db';
import { cleanContactSegments } from '../src/kontakte/name-cleanup';

async function main() {
  const changed = await cleanContactSegments(pool);
  console.log(`Segment neu gesetzt: ${changed}.`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
