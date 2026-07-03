import type { WooOrder } from './types';

export interface WooConfig {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

const PER_PAGE = 100;

export class WooCommerceClient {
  private readonly base: string;
  private readonly auth: string;

  constructor(
    private readonly config: WooConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    // Store URL may be entered without a scheme (e.g. "bryxtoys.com"); default
    // to https:// so fetch can parse it. Trailing slashes are stripped.
    const storeUrl = /^https?:\/\//i.test(config.storeUrl) ? config.storeUrl : `https://${config.storeUrl}`;
    this.base = `${storeUrl.replace(/\/+$/, '')}/wp-json/wc/v3`;
    // HTTP Basic auth over HTTPS — keeps the secrets out of the URL.
    this.auth = Buffer.from(`${config.consumerKey}:${config.consumerSecret}`).toString('base64');
  }

  async fetchAllOrders(): Promise<WooOrder[]> {
    const all: WooOrder[] = [];
    let page = 1;
    for (;;) {
      const url = `${this.base}/orders?per_page=${PER_PAGE}&page=${page}&orderby=id&order=asc&status=any`;
      const res = await this.fetchImpl(url, {
        headers: { Authorization: `Basic ${this.auth}`, Accept: 'application/json' },
      });
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
}
