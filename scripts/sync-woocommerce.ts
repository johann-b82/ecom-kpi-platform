import { WooCommerceClient } from '../src/connectors/woocommerce/client';
import { normalizeDelta } from '../src/connectors/woocommerce/connector';
import { fullReplace, applyDelta } from '../src/lib/orders-store';
import { getWatermarks, setWatermarks, shouldFullResync } from '../src/connectors/woocommerce/watermark';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';
import { WooCommerceMirror } from '../src/woocommerce/mirror';
import { importWooCommerceOrders } from '../src/woocommerce/order-import';
import { getErpWatermarks, setErpWatermarks, shouldErpFullResync } from '../src/woocommerce/erp-watermark';

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
    await fullReplace('woocommerce', upserts);
  } else {
    const since = new Date(syncedAt!.getTime() - DELTA_OVERLAP_MS);
    console.log(`Incremental sync: orders modified after ${since.toISOString()}…`);
    const raw = await client.fetchAllOrders(since);
    const { upserts, deleteIds } = normalizeDelta(raw);
    console.log(`Fetched ${raw.length} modified; upsert ${upserts.length}, delete ${deleteIds.length}.`);
    await applyDelta('woocommerce', upserts, deleteIds);
  }

  await setWatermarks(startedAt, { full });
  console.log(`Wrote orders + customers to canonical DB. Done (${full ? 'full' : 'incremental'}).`);

  // ── ERP-Belege (sales_orders) aus denselben WooCommerce-Bestellungen ──
  // Eigener Fetch (voller _fields inkl. line_items) + eigener Watermark; hält
  // sales_orders inkl. Statuswechsel/Storno aktuell.
  const mirror = new WooCommerceMirror({
    storeUrl: cfg.WOOCOMMERCE_STORE_URL,
    consumerKey: cfg.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: cfg.WOOCOMMERCE_CONSUMER_SECRET,
  });
  const pl = await pool.query<{ id: string }>('SELECT id FROM price_lists WHERE is_default LIMIT 1');
  if (pl.rows.length === 0) {
    console.log('ERP-Import übersprungen: keine Standard-Preisliste.');
  } else {
    const erpStarted = new Date();
    const wm = await getErpWatermarks();
    const erpFull = shouldErpFullResync(wm.syncedAt, wm.fullSyncedAt, erpStarted);
    const since = erpFull ? undefined : new Date(wm.syncedAt!.getTime() - DELTA_OVERLAP_MS);
    console.log(`ERP-Import: ${erpFull ? 'full' : `delta seit ${since!.toISOString()}`}…`);
    const orders: Record<string, unknown>[] = [];
    let page = 1;
    for (;;) {
      const p = await mirror.fetchOrdersRaw(page, 100, since);
      orders.push(...p.items);
      if (page >= p.totalPages || p.items.length === 0) break;
      page += 1;
    }
    const r = await importWooCommerceOrders(pool, orders, pl.rows[0].id);
    await setErpWatermarks(erpStarted, { full: erpFull });
    console.log(`ERP-Import fertig: ${JSON.stringify(r)}`);
  }

  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
