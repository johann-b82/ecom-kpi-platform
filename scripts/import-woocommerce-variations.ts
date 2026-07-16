import { WooCommerceMirror } from '../src/woocommerce/mirror';
import { importWooCommerceVariations } from '../src/woocommerce/catalog-import';
import { loadConnectorConfig } from '../src/lib/credentials';
import { pool } from '../src/lib/db';

async function main() {
  const cfg = await loadConnectorConfig('woocommerce');
  const mirror = new WooCommerceMirror({
    storeUrl: cfg.WOOCOMMERCE_STORE_URL,
    consumerKey: cfg.WOOCOMMERCE_CONSUMER_KEY,
    consumerSecret: cfg.WOOCOMMERCE_CONSUMER_SECRET,
  });

  const pl = await pool.query<{ id: string }>('SELECT id FROM price_lists WHERE is_default LIMIT 1');
  const priceListId = pl.rows[0].id;

  // Variable products: the imported parent variants whose raw_payload.type = 'variable'.
  const variable = await pool.query<{ woo_id: string; product_id: string }>(
    `SELECT er.external_id AS woo_id, pv.product_id
       FROM external_references er
       JOIN product_variants pv ON pv.id = er.entity_id
      WHERE er.source_system='woocommerce' AND er.entity_type='product_variant'
        AND er.raw_payload->>'type' = 'variable'`);
  console.log(`${variable.rows.length} variable Produkte — hole Variationen…`);

  const items: { parentProductId: string; raw: Record<string, unknown> }[] = [];
  let i = 0;
  for (const row of variable.rows) {
    let page = 1;
    for (;;) {
      const p = await mirror.fetchVariationsRaw(Number(row.woo_id), page);
      for (const raw of p.items) items.push({ parentProductId: row.product_id, raw });
      if (page >= p.totalPages || p.items.length === 0) break;
      page += 1;
    }
    if (++i % 20 === 0) console.log(`  ${i}/${variable.rows.length} Produkte, ${items.length} Variationen`);
  }

  console.log(`Importiere ${items.length} Variationen…`);
  const r = await importWooCommerceVariations(pool, items, priceListId);
  console.log('Ergebnis:', JSON.stringify(r, null, 2));
  await pool.end();
}

main().catch((e) => { console.error(e); process.exit(1); });
