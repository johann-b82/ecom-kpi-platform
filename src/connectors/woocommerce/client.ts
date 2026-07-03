import type { WooOrder } from './types';

export interface WooConfig {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

const PER_PAGE = 100;
const REQUEST_TIMEOUT_MS = 30_000;
// Only the fields normalizeDelta consumes — cuts the per-page payload ~99%
// (full orders are ~27 KB each; a store with thousands of orders otherwise
// downloads hundreds of MB per full sync).
const ORDER_FIELDS = 'id,status,date_created,total,customer_id,billing';

export class WooCommerceClient {
  private readonly base: string;
  private readonly auth: string;

  constructor(
    private readonly config: WooConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs: number = REQUEST_TIMEOUT_MS,
  ) {
    // Store URL may be entered without a scheme (e.g. "bryxtoys.com"); default
    // to https:// so fetch can parse it. Trailing slashes are stripped.
    const storeUrl = /^https?:\/\//i.test(config.storeUrl) ? config.storeUrl : `https://${config.storeUrl}`;
    this.base = `${storeUrl.replace(/\/+$/, '')}/wp-json/wc/v3`;
    // HTTP Basic auth over HTTPS — keeps the secrets out of the URL.
    this.auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  }

  async fetchAllOrders(modifiedAfter?: Date): Promise<WooOrder[]> {
    const all: WooOrder[] = [];
    let page = 1;
    const mod = modifiedAfter
      ? `&modified_after=${encodeURIComponent(modifiedAfter.toISOString())}&dates_are_gmt=true`
      : '';
    for (;;) {
      const url = `${this.base}/orders?per_page=${PER_PAGE}&page=${page}&orderby=id&order=asc&status=any&_fields=${ORDER_FIELDS}${mod}`;
      const res = await this.get(url);
      if (!res.ok) {
        throw new Error(`WooCommerce fetch failed: ${res.status} ${await res.text()}`);
      }
      const batch = (await res.json()) as WooOrder[];
      all.push(...batch);
      if (batch.length < PER_PAGE) break;
      page += 1;
    }
    return all;
  }

  // Fetch with a per-request timeout so an unresponsive store fails fast with a
  // clear message instead of hanging until the sync runner kills the process.
  private async get(url: string): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      return await this.fetchImpl(url, {
        headers: { Authorization: `Basic ${this.auth}`, Accept: 'application/json' },
        signal: controller.signal,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        throw new Error(`WooCommerce request timed out after ${this.timeoutMs / 1000}s: ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
