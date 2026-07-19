// Einmal/idempotent: bereinigt WooCommerce-Kontaktnamen (Junk aus dem company-Feld)
// aus dem gespiegelten Billing-Payload. Auf bryx-test (später Prod) ausführen.
import { pool } from '../src/lib/db';
import { cleanContactNames } from '../src/kontakte/name-cleanup';

async function main() {
  const changed = await cleanContactNames(pool);
  console.log(`Kontaktnamen bereinigt: ${changed}.`);
  await pool.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
