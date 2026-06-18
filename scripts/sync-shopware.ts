import { ShopwareClient } from '../src/connectors/shopware/client';
import { normalizeOrders } from '../src/connectors/shopware/connector';
import { writeOrdersAndCustomers } from '../src/connectors/shopware/write';
import { pool } from '../src/lib/db';

async function main() {
  const apiUrl = process.env.SHOPWARE_API_URL;
  const clientId = process.env.SHOPWARE_CLIENT_ID;
  const clientSecret = process.env.SHOPWARE_CLIENT_SECRET;
  if (!apiUrl || !clientId || !clientSecret) {
    throw new Error('Missing SHOPWARE_API_URL / SHOPWARE_CLIENT_ID / SHOPWARE_CLIENT_SECRET in environment.');
  }

  const client = new ShopwareClient({ apiUrl, clientId, clientSecret });
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
