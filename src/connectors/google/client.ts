import { addDays } from '@/lib/dates';
import type { GoogleAdsRow, GoogleAdsStreamChunk } from './types';

const VERSION = 'v17';

export interface GoogleAdsConfig {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  customerId: string;
  loginCustomerId?: string;
}

export class GoogleAdsClient {
  constructor(
    private readonly config: GoogleAdsConfig,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly tokenProvider?: () => Promise<string>,
  ) {}

  async getAccessToken(): Promise<string> {
    if (this.tokenProvider) return this.tokenProvider();
    const res = await this.fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
      }),
    });
    if (!res.ok) {
      throw new Error(`Google Ads auth failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as { access_token: string };
    return json.access_token;
  }

  async search(days: number): Promise<GoogleAdsRow[]> {
    const token = await this.getAccessToken();
    const today = new Date().toISOString().slice(0, 10);
    const start = addDays(today, -(days - 1));
    const query =
      `SELECT segments.date, metrics.cost_micros, metrics.impressions, metrics.clicks, ` +
      `metrics.conversions, metrics.conversions_value, metrics.video_views ` +
      `FROM customer WHERE segments.date BETWEEN '${start}' AND '${today}'`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      'developer-token': this.config.developerToken,
      'Content-Type': 'application/json',
    };
    if (this.config.loginCustomerId) {
      headers['login-customer-id'] = this.config.loginCustomerId;
    }

    const res = await this.fetchImpl(
      `https://googleads.googleapis.com/${VERSION}/customers/${this.config.customerId}/googleAds:searchStream`,
      { method: 'POST', headers, body: JSON.stringify({ query }) },
    );
    if (!res.ok) {
      throw new Error(`Google Ads searchStream failed: ${res.status} ${await res.text()}`);
    }
    const chunks = (await res.json()) as GoogleAdsStreamChunk[];
    return chunks.flatMap((c) => c.results ?? []);
  }
}
