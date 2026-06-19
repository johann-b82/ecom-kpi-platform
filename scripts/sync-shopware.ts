import { ShopwareClient } from '../src/connectors/shopware/client';
import { normalizeOrders } from '../src/connectors/shopware/connector';
import { writeOrdersAndCustomers } from '../src/connectors/shopware/write';
import { pool } from '../src/lib/db';
import { loadConnectorConfig } from '../src/lib/credentials';

async function main() {
  const cfg = await loadConnectorConfig('shopware');
  const client = new ShopwareClient({ apiUrl: cfg.SHOPWARE_API_URL, clientId: cfg.SHOPWARE_CLIENT_ID, clientSecret: cfg.SHOPWARE_CLIENT_SECRET });
  console.log('Fetching orders from Shopware…');
  const raw = await client.fetchAllOrders();
  console.log(`Fetched ${raw.length} raw orders.`);

  const data = normalizeOrders(raw);
  console.log(`Normalized → ${data.orders.length} orders / ${data.customers.length} customers (cancelled excluded).`);

  await writeOrdersAndCustomers(data);
  console.log('Wrote orders + customers to canonical DB. Done.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
