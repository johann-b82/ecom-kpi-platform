import { WooCommerceClient } from '../src/connectors/woocommerce/client';
import { normalizeOrders } from '../src/connectors/woocommerce/connector';
import { writeOrdersAndCustomers } from '../src/connectors/woocommerce/write';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';

async function main() {
  const cfg = await loadConnectorConfig('woocommerce');
  const client = new WooCommerceClient({
    storeUrl: cfg.WOOCOMMERCE_STORE_URL,
    consumerKey: cfg.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: cfg.WOOCOMMERCE_CONSUMER_SECRET,
  });
  console.log('Fetching orders from WooCommerce…');
  const raw = await client.fetchAllOrders();
  console.log(`Fetched ${raw.length} raw orders.`);

  const data = normalizeOrders(raw);
  console.log(`Normalized → ${data.orders.length} orders / ${data.customers.length} customers (nur completed+processing).`);

  await writeOrdersAndCustomers(data);
  console.log('Wrote orders + customers to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
