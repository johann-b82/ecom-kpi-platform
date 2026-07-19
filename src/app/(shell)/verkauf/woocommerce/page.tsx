import Link from 'next/link';
import { isConfigured, loadConnectorConfig } from '@/lib/credentials';
import { WooCommerceMirror, formatAmount, type MirrorOrder, type MirrorProduct } from '@/woocommerce/mirror';

export const dynamic = 'force-dynamic';

const PER = 20;

type Tab = 'orders' | 'products';

export default async function WooCommercePage({ searchParams }: { searchParams: { tab?: string; page?: string } }) {
  const tab: Tab = searchParams.tab === 'products' ? 'products' : 'orders';
  const page = Math.max(1, Number.parseInt(searchParams.page ?? '1', 10) || 1);

  if (!(await isConfigured('woocommerce'))) {
    return (
      <div className="space-y-4">
        <Header host={null} ordersTotal={null} productsTotal={null} error={null} />
        <p className="rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-600 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-300">
          Keine WooCommerce-Zugangsdaten hinterlegt. Bitte unter <Link href="/setup" className="text-brand hover:text-brand-dark">Setup</Link> Store-URL, Consumer Key und Secret eintragen.
        </p>
      </div>
    );
  }

  let host: string | null = null;
  let ordersTotal: number | null = null;
  let productsTotal: number | null = null;
  let totalPages = 1;
  let orderItems: MirrorOrder[] = [];
  let productItems: MirrorProduct[] = [];
  let error: string | null = null;

  try {
    const cfg = await loadConnectorConfig('woocommerce');
    const mirror = new WooCommerceMirror({
      storeUrl: cfg.WOOCOMMERCE_STORE_URL,
      consumerKey: cfg.WOOCOMMERCE_CONSUMER_KEY,
      consumerSecret: cfg.WOOCOMMERCE_CONSUMER_SECRET,
    });
    host = mirror.host;
    if (tab === 'products') {
      const p = await mirror.fetchProductsPage(page, PER);
      productItems = p.items; productsTotal = p.total; totalPages = p.totalPages;
      ordersTotal = (await mirror.fetchOrdersPage(1, 1)).total;
    } else {
      const o = await mirror.fetchOrdersPage(page, PER);
      orderItems = o.items; ordersTotal = o.total; totalPages = o.totalPages;
      productsTotal = (await mirror.fetchProductsPage(1, 1)).total;
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="space-y-4">
      <Header host={host} ordersTotal={ordersTotal} productsTotal={productsTotal} error={error} />

      {error ? (
        <p className="rounded-md border border-neutral-200 bg-white p-4 text-sm text-neutral-700 dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-200">
          Verbindung fehlgeschlagen: <span className="font-mono text-xs">{error}</span>
        </p>
      ) : (
        <>
          <div className="flex items-center gap-2">
            <TabLink tab="orders" active={tab === 'orders'} label={`Bestellungen${ordersTotal !== null ? ` (${ordersTotal.toLocaleString('de-DE')})` : ''}`} />
            <TabLink tab="products" active={tab === 'products'} label={`Produkte${productsTotal !== null ? ` (${productsTotal.toLocaleString('de-DE')})` : ''}`} />
          </div>

          {tab === 'orders' ? <OrdersTable rows={orderItems} /> : <ProductsTable rows={productItems} />}

          <Pagination tab={tab} page={page} totalPages={totalPages} />
        </>
      )}
    </div>
  );
}

function Header({ host, ordersTotal, productsTotal, error }:
  { host: string | null; ordersTotal: number | null; productsTotal: number | null; error: string | null }) {
  const state = host === null ? 'Nicht verbunden' : error ? 'Fehler' : 'Verbunden';
  const tone = state === 'Verbunden'
    ? 'bg-accent/10 text-accent'
    : 'bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300';
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verkauf · WooCommerce</h2>
        <span className={`anno rounded-full px-2 py-0.5 text-[11px] ${tone}`}>{state}</span>
      </div>
      <p className="text-sm text-neutral-500">
        {host ? <>Live-Spiegel aus <span className="font-mono text-neutral-700 dark:text-neutral-300">{host}</span> · read-only, keine Übernahme ins ERP.</> : 'Read-only Kanaldaten aus WooCommerce.'}
      </p>
    </div>
  );
}

function TabLink({ tab, active, label }: { tab: Tab; active: boolean; label: string }) {
  return (
    <Link href={`/verkauf/woocommerce?tab=${tab}`}
      className={`rounded px-3 py-1 text-sm ${active
        ? 'bg-accent text-white'
        : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700'}`}>
      {label}
    </Link>
  );
}

function OrdersTable({ rows }: { rows: MirrorOrder[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="anno text-left text-neutral-500">
          <th className="py-2">Nummer</th><th>Datum</th><th>Status</th><th className="text-right">Betrag</th><th>Währung</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2 font-mono text-xs">{r.number}</td>
              <td className="text-neutral-500">{r.dateCreated.slice(0, 10)}</td>
              <td>{r.status}</td>
              <td className="text-right tabular-nums">{formatAmount(r.total)}</td>
              <td className="text-neutral-500">{r.currency}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-neutral-500">Keine Bestellungen.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function ProductsTable({ rows }: { rows: MirrorProduct[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="anno text-left text-neutral-500">
          <th className="py-2">Name</th><th>SKU</th><th>Typ</th><th>Status</th><th className="text-right">Bestand</th><th className="text-right">Preis</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-2">{r.name}</td>
              <td className="font-mono text-xs">{r.sku || '—'}</td>
              <td className="text-neutral-500">{r.type}</td>
              <td>{r.status}</td>
              <td className="text-right tabular-nums">{r.stockQuantity ?? '—'}</td>
              <td className="text-right tabular-nums">{formatAmount(r.price)}</td>
            </tr>
          ))}
          {rows.length === 0 && <tr><td colSpan={6} className="py-6 text-center text-neutral-500">Keine Produkte.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}

function Pagination({ tab, page, totalPages }: { tab: Tab; page: number; totalPages: number }) {
  const prev = page > 1 ? page - 1 : null;
  const next = page < totalPages ? page + 1 : null;
  const cell = 'rounded px-3 py-1 text-sm bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700';
  const disabled = 'rounded px-3 py-1 text-sm text-neutral-400 dark:text-neutral-600';
  return (
    <div className="flex items-center gap-3 pt-1 text-sm text-neutral-500">
      {prev ? <Link href={`/verkauf/woocommerce?tab=${tab}&page=${prev}`} className={cell}>← Zurück</Link> : <span className={disabled}>← Zurück</span>}
      <span>Seite {page.toLocaleString('de-DE')} von {totalPages.toLocaleString('de-DE')}</span>
      {next ? <Link href={`/verkauf/woocommerce?tab=${tab}&page=${next}`} className={cell}>Weiter →</Link> : <span className={disabled}>Weiter →</span>}
    </div>
  );
}
