// Read-only WooCommerce "Spiegel": fetches orders/products live from the wc/v3
// REST API for display in the ERP. No DB writes — the external_references mirror
// and mapping into sales_orders/product_variants are a later step (Phase 3, P3).
// Deliberately separate from src/connectors/woocommerce (System A analytics sync).

export interface MirrorConfig {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface MirrorOrder {
  id: number;
  number: string;
  status: string;
  dateCreated: string;
  total: string;
  currency: string;
}

export interface MirrorProduct {
  id: number;
  name: string;
  sku: string;
  type: string;
  status: string;
  stockQuantity: number | null;
  price: string;
}

export interface MirrorPage<T> {
  items: T[];
  total: number;
  totalPages: number;
  page: number;
}

export interface ConnectionResult {
  ok: boolean;
  host: string;
  status: number;
  total?: number;
}

// Only the fields the mirror view displays — keeps the payload small.
const ORDER_FIELDS = 'id,number,status,date_created,total,currency';
const PRODUCT_FIELDS = 'id,name,sku,type,status,stock_quantity,price';
const REQUEST_TIMEOUT_MS = 30_000;

// WooCommerce returns money as strings that can carry float noise
// (e.g. "0.6999999951"). Round to a clean 2-decimal de-DE display; a dash
// for empty or non-numeric values.
export function formatAmount(raw: string): string {
  if (!raw) return '—';
  const n = Number(raw);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function normalizeOrder(raw: Record<string, unknown>): MirrorOrder {
  const number = raw.number != null && raw.number !== '' ? String(raw.number) : String(raw.id);
  return {
    id: raw.id as number,
    number,
    status: (raw.status as string) ?? '',
    dateCreated: (raw.date_created as string) ?? '',
    total: (raw.total as string) ?? '',
    currency: (raw.currency as string) ?? '',
  };
}

export function normalizeProduct(raw: Record<string, unknown>): MirrorProduct {
  return {
    id: raw.id as number,
    name: (raw.name as string) ?? '',
    sku: (raw.sku as string) ?? '',
    type: (raw.type as string) ?? '',
    status: (raw.status as string) ?? '',
    stockQuantity: (raw.stock_quantity as number | null) ?? null,
    price: (raw.price as string) ?? '',
  };
}

export class WooCommerceMirror {
  private readonly base: string;
  private readonly auth: string;
  readonly host: string;

  constructor(
    config: MirrorConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
  ) {
    const storeUrl = /^https?:\/\//i.test(config.storeUrl) ? config.storeUrl : `https://${config.storeUrl}`;
    const clean = storeUrl.replace(/\/+$/, '');
    this.base = `${clean}/wp-json/wc/v3`;
    this.host = new URL(clean).host;
    this.auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  }

  private async get(url: string): Promise<Response> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        headers: { Authorization: `Basic ${this.auth}` },
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private static totals(res: Response): { total: number; totalPages: number } {
    return {
      total: Number(res.headers.get('x-wp-total')) || 0,
      totalPages: Number(res.headers.get('x-wp-totalpages')) || 0,
    };
  }

  async fetchOrdersPage(page = 1, perPage = 20): Promise<MirrorPage<MirrorOrder>> {
    const url = `${this.base}/orders?per_page=${perPage}&page=${page}&orderby=date&order=desc&status=any&_fields=${ORDER_FIELDS}`;
    const res = await this.get(url);
    if (!res.ok) throw new Error(`WooCommerce orders fetch failed: ${res.status} ${await res.text()}`);
    const items = ((await res.json()) as Record<string, unknown>[]).map(normalizeOrder);
    const { total, totalPages } = WooCommerceMirror.totals(res);
    return { items, total, totalPages, page };
  }

  async fetchProductsPage(page = 1, perPage = 20): Promise<MirrorPage<MirrorProduct>> {
    const url = `${this.base}/products?per_page=${perPage}&page=${page}&orderby=date&order=desc&_fields=${PRODUCT_FIELDS}`;
    const res = await this.get(url);
    if (!res.ok) throw new Error(`WooCommerce products fetch failed: ${res.status} ${await res.text()}`);
    const items = ((await res.json()) as Record<string, unknown>[]).map(normalizeProduct);
    const { total, totalPages } = WooCommerceMirror.totals(res);
    return { items, total, totalPages, page };
  }

  // Orders incl. billing + line_items for the ERP import; optional modifiedAfter
  // for incremental syncs (WooCommerce bumps date_modified on any status change).
  async fetchOrdersRaw(page = 1, perPage = 100, modifiedAfter?: Date): Promise<MirrorPage<Record<string, unknown>>> {
    const fields = 'id,number,status,date_created,date_paid,total,currency,customer_id,billing,line_items';
    const mod = modifiedAfter
      ? `&modified_after=${encodeURIComponent(modifiedAfter.toISOString())}&dates_are_gmt=true`
      : '';
    const url = `${this.base}/orders?per_page=${perPage}&page=${page}&orderby=id&order=asc&status=any&_fields=${fields}${mod}`;
    const res = await this.get(url);
    if (!res.ok) throw new Error(`WooCommerce orders fetch failed: ${res.status} ${await res.text()}`);
    const items = (await res.json()) as Record<string, unknown>[];
    const { total, totalPages } = WooCommerceMirror.totals(res);
    return { items, total, totalPages, page };
  }

  // Full, unmodified product payload (no _fields narrowing) — used by the catalog
  // import so external_references.raw_payload stores the verbatim API response.
  async fetchProductsRaw(page = 1, perPage = 100): Promise<MirrorPage<Record<string, unknown>>> {
    const url = `${this.base}/products?per_page=${perPage}&page=${page}&orderby=id&order=asc`;
    const res = await this.get(url);
    if (!res.ok) throw new Error(`WooCommerce products fetch failed: ${res.status} ${await res.text()}`);
    const items = (await res.json()) as Record<string, unknown>[];
    const { total, totalPages } = WooCommerceMirror.totals(res);
    return { items, total, totalPages, page };
  }

  // Variations of a variable product — used by the variation catalog import so
  // order lines that reference variation SKUs can resolve.
  async fetchVariationsRaw(productWooId: number, page = 1, perPage = 100): Promise<MirrorPage<Record<string, unknown>>> {
    const url = `${this.base}/products/${productWooId}/variations?per_page=${perPage}&page=${page}&orderby=id&order=asc`;
    const res = await this.get(url);
    if (!res.ok) throw new Error(`WooCommerce variations fetch failed: ${res.status} ${await res.text()}`);
    const items = (await res.json()) as Record<string, unknown>[];
    const { total, totalPages } = WooCommerceMirror.totals(res);
    return { items, total, totalPages, page };
  }

  async testConnection(): Promise<ConnectionResult> {
    const url = `${this.base}/orders?per_page=1&_fields=id`;
    const res = await this.get(url);
    if (!res.ok) return { ok: false, host: this.host, status: res.status };
    return { ok: true, host: this.host, status: res.status, total: WooCommerceMirror.totals(res).total };
  }
}
