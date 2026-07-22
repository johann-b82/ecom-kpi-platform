import { WooCommerceMirror } from '../src/woocommerce/mirror';
import { importWooCommerceOrders } from '../src/woocommerce/order-import';
import { loadConnectorConfig } from '../src/lib/credentials';
import { pool } from '../src/lib/db';

async function main() {
  const cfg = await loadConnectorConfig('woocommerce');
  const mirror = new WooCommerceMirror({
    storeUrl: cfg.WOOCOMMERCE_STORE_URL,
    consumerKey: cfg.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: cfg.WOOCOMMERCE_CONSUMER_SECRET,
  });

  const pl = await pool.query<{ id: string; name: string }>('SELECT id, name FROM price_lists WHERE is_default LIMIT 1');
  if (pl.rows.length === 0) throw new Error('Keine Standard-Preisliste (is_default) definiert.');
  const priceListId = pl.rows[0].id;

  const all: Record<string, unknown>[] = [];
  let page = 1;
  for (;;) {
    const p = await mirror.fetchOrdersRaw(page, 100);
    all.push(...p.items);
    if (page % 10 === 0 || page >= p.totalPages) {
      console.log(`  Seite ${page}/${p.totalPages} — ${all.length}/${p.total} Bestellungen geholt`);
    }
    if (page >= p.totalPages || p.items.length === 0) break;
    page += 1;
  }

  console.log(`Importiere ${all.length} Bestellungen (inerte Belege, Preisliste "${pl.rows[0].name}")…`);
  const r = await importWooCommerceOrders(pool, all, priceListId,
    (id) => mirror.fetchOrderRefunds(id) as Promise<any>);
  console.log('Ergebnis:', JSON.stringify(r, null, 2));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
