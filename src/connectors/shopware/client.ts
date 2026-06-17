import type { ShopwareOrder, ShopwareOrderPage } from './types';

export interface ShopwareConfig {
  apiUrl: string;
  clientId: string;
  clientSecret: string;
}

const PAGE_SIZE = 500;

export class ShopwareClient {
  private token: string | null = null;

  constructor(
    private readonly config: ShopwareConfig,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async getToken(): Promise<string> {
    const res = await this.fetchImpl(`${this.config.apiUrl}/api/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });
    if (!res.ok) {
      throw new Error(`Shopware auth failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { access_token: string };
    this.token = json.access_token;
    return this.token;
  }

  private async authedGet(path: string): Promise<Response> {
    if (!this.token) await this.getToken();
    let res = await this.fetchImpl(`${this.config.apiUrl}${path}`, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (res.status === 401) {
      await this.getToken();
      res = await this.fetchImpl(`${this.config.apiUrl}${path}`, {
        headers: { Authorization: `Bearer ${this.token}` },
      });
    }
    return res;
  }

  async fetchAllOrders(): Promise<ShopwareOrder[]> {
    const all: ShopwareOrder[] = [];
    let page = 1;
    for (;;) {
      const path =
        `/api/order?limit=${PAGE_SIZE}&page=${page}&total-count-mode=1` +
        `&associations[orderCustomer][]&associations[stateMachineState][]`;
      const res = await this.authedGet(path);
      if (!res.ok) {
        throw new Error(`Shopware fetch failed: ${res.status} ${await res.text()}`);
      }
      const json = (await res.json()) as ShopwareOrderPage;
      all.push(...json.data);
      if (json.data.length === 0 || all.length >= (json.total ?? all.length)) break;
      page += 1;
    }
    return all;
  }
}
