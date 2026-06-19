import { addDays } from '@/lib/dates';
import type { TikTokReportRow, TikTokReportResponse } from './types';

const BASE = 'https://business-api.tiktok.com';
const VERSION = 'v1.3';

export class TikTokClient {
  constructor(
    private readonly accessToken: string,
    private readonly advertiserId: string,
    private readonly valueMetric: string,
    private readonly videoMetric: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchReport(days: number): Promise<TikTokReportRow[]> {
    const today = new Date().toISOString().slice(0, 10);
    const startDate = addDays(today, -(days - 1));
    const metrics = ['spend', 'impressions', 'clicks', 'conversion', this.valueMetric, this.videoMetric];

    const rows: TikTokReportRow[] = [];
    let page = 1;
    for (;;) {
      const params = new URLSearchParams({
        advertiser_id: this.advertiserId,
        report_type: 'BASIC',
        data_level: 'AUCTION_ADVERTISER',
        dimensions: JSON.stringify(['stat_time_day']),
        metrics: JSON.stringify(metrics),
        start_date: startDate,
        end_date: today,
        page: String(page),
        page_size: '1000',
      });
      const url = `${BASE}/open_api/${VERSION}/report/integrated/get/?${params.toString()}`;
      const res = await this.fetchImpl(url, { headers: { 'Access-Token': this.accessToken } });
      if (!res.ok) {
        throw new Error(`TikTok report HTTP ${res.status}: ${await res.text()}`);
      }
      const json = (await res.json()) as TikTokReportResponse;
      if (json.code !== 0) {
        throw new Error(`TikTok report error code ${json.code}: ${json.message}`);
      }
      rows.push(...(json.data?.list ?? []));
      const totalPage = json.data?.page_info?.total_page ?? 1;
      if (page >= totalPage) break;
      page += 1;
    }
    return rows;
  }
}
