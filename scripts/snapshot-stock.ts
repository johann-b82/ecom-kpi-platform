// Täglicher Bestands-Snapshot: (1) Live-Bestand aus WooCommerce in stock_levels,
// (2) Tages-Snapshot in stock_snapshots. Idempotent pro Tag; per Cron auf dem VPS.
import { WooCommerceMirror } from '../src/woocommerce/mirror';
import { collectStockFromMirror, applyStockLevels } from '../src/woocommerce/stock-refresh';
import { writeDailySnapshot } from '../src/verfuegbarkeit/snapshot';
import { loadConnectorConfig } from '../src/lib/credentials';
import { pool } from '../src/lib/db';

async function main() {
  const cfg = await loadConnectorConfig('woocommerce');
  const mirror = new WooCommerceMirror({
    storeUrl: cfg.WOOCOMMERCE_STORE_URL,
    consumerKey: cfg.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: cfg.WOOCOMMERCE_CONSUMER_SECRET,
  });
  const rows = await collectStockFromMirror(mirror);
  const written = await applyStockLevels(pool, rows);
  console.log(`Bestand aus WooCommerce aktualisiert: ${written} Varianten (von ${rows.length} gelesen).`);
  const snap = await writeDailySnapshot(pool);
  console.log(`Snapshot geschrieben: ${snap} neue Sätze (heute).`);
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
