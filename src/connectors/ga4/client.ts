import { GoogleAuth } from 'google-auth-library';
import type { Ga4Report } from './types';

export const GA4_METRICS = [
  'sessions', 'screenPageViews', 'totalUsers', 'newUsers', 'engagedSessions', 'addToCarts', 'checkouts',
] as const;

export type TokenProvider = () => Promise<string>;

export class Ga4Client {
  constructor(
    private readonly propertyId: string,
    private readonly getToken: TokenProvider,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnv(propertyId: string): Ga4Client {
    const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    const getToken: TokenProvider = async () => {
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (!token.token) throw new Error('GA4 auth: no access token returned');
      return token.token;
    };
    return new Ga4Client(propertyId, getToken);
  }

  static fromCredentials(propertyId: string, credentials: object): Ga4Client {
    const auth = new GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/analytics.readonly'] });
    const getToken: TokenProvider = async () => {
      const client = await auth.getClient();
      const token = await client.getAccessToken();
      if (!token.token) throw new Error('GA4 auth: no access token returned');
      return token.token;
    };
    return new Ga4Client(propertyId, getToken);
  }

  async runReport(days: number): Promise<Ga4Report> {
    const token = await this.getToken();
    const body = {
      dateRanges: [{ startDate: `${days - 1}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: 'date' }],
      metrics: GA4_METRICS.map((name) => ({ name })),
      orderBys: [{ dimension: { dimensionName: 'date' } }],
      limit: 100000,
    };
    const res = await this.fetchImpl(
      `https://analyticsdata.googleapis.com/v1beta/properties/${this.propertyId}:runReport`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      throw new Error(`GA4 runReport failed: ${res.status} ${await res.text()}`);
    }
    return (await res.json()) as Ga4Report;
  }
}
