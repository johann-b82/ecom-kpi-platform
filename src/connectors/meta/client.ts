import { addDays } from '@/lib/dates';
import type { MetaInsightRow, MetaInsightsResponse } from './types';

const BASE = 'https://graph.facebook.com';
const VERSION = 'v21.0';

export class MetaClient {
  constructor(
    private readonly accessToken: string,
    private readonly adAccountId: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchInsights(days: number): Promise<MetaInsightRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    const since = addDays(today, -(days - 1));
    const params = new URLSearchParams({
      level: 'account',
      time_increment: '1',
      time_range: JSON.stringify({ since, until: today }),
      fields: 'spend,impressions,clicks,actions,action_values',
      limit: '500',
    });
    let url: string | null = `${BASE}/${VERSION}/act_${this.adAccountId}/insights?${params.toString()}`;

    const rows: MetaInsightRow[] = [];
    while (url) {
      const res = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`Meta insights failed: ${res.status} ${await res.text()}`);
      }
      const json = (await res.json()) as MetaInsightsResponse;
      rows.push(...json.data);
      url = json.paging?.next ?? null;
    }
    return rows;
  }
}
