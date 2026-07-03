import { WooCommerceClient } from '../src/connectors/woocommerce/client';
import { normalizeDelta } from '../src/connectors/woocommerce/connector';
import { fullReplace, applyDelta } from '../src/connectors/woocommerce/write';
import { getWatermarks, setWatermarks, shouldFullResync } from '../src/connectors/woocommerce/watermark';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';

const DELTA_OVERLAP_MS = 60_000; // clock-skew insurance on the modified_after boundary

async function main() {
  const cfg = await loadConnectorConfig('woocommerce');
  const client = new WooCommerceClient({
    storeUrl: cfg.WOOCOMMERCE_STORE_URL,
    consumerKey: cfg.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: cfg.WOOCOMMERCE_CONSUMER_SECRET,
  });

  const startedAt = new Date();
  const { syncedAt, fullSyncedAt } = await getWatermarks();
  const full = shouldFullResync(syncedAt, fullSyncedAt, startedAt);

  if (full) {
    console.log('Full resync: fetching all orders…');
    const raw = await client.fetchAllOrders();
    const { upserts } = normalizeDelta(raw);
    console.log(`Fetched ${raw.length}; ${upserts.length} revenue orders → full replace.`);
    await fullReplace(upserts);
  } else {
    const since = new Date(syncedAt!.getTime() - DELTA_OVERLAP_MS);
    console.log(`Incremental sync: orders modified after ${since.toISOString()}…`);
    const raw = await client.fetchAllOrders(since);
    const { upserts, deleteIds } = normalizeDelta(raw);
    console.log(`Fetched ${raw.length} modified; upsert ${upserts.length}, delete ${deleteIds.length}.`);
    await applyDelta(upserts, deleteIds);
  }

  await setWatermarks(startedAt, { full });
  console.log(`Wrote orders + customers to canonical DB. Done (${full ? 'full' : 'incremental'}).`);
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
