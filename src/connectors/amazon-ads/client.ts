import { gunzipSync } from 'node:zlib';
import { addDays } from '@/lib/dates';
import type { AmazonAdsReportRow, AmazonAdsReportStatus } from './types';

const BASE = 'https://advertising-api-eu.amazon.com';
// Reporting v3 limits: max 31 days per spCampaigns report, ~95 days lookback.
const MAX_WINDOW_DAYS = 31;
const MAX_LOOKBACK_DAYS = 90;
const POLL_INTERVAL_MS = 5_000;
const MAX_POLLS = 60;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class AmazonAdsClient {
  constructor(
    private readonly accessToken: string,
    private readonly clientId: string,
    private readonly profileId: string,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly sleepImpl: (ms: number) => Promise<void> = defaultSleep,
  ) {}

  private headers(contentType?: string): Record<string, string> {
    const h: Record<string, string> = {
      Authorization: `Bearer ${this.accessToken}`,
      'Amazon-Advertising-API-ClientId': this.clientId,
      'Amazon-Advertising-API-Scope': this.profileId,
    };
    if (contentType) h['Content-Type'] = contentType;
    return h;
  }

  private async createReport(startDate: string, endDate: string): Promise<string> {
    const res = await this.fetchImpl(`${BASE}/reporting/reports`, {
      method: 'POST',
      headers: this.headers('application/vnd.createasyncreportrequest.v3+json'),
      body: JSON.stringify({
        name: `ecom-platform spCampaigns ${startDate}..${endDate}`,
        startDate,
        endDate,
        configuration: {
          adProduct: 'SPONSORED_PRODUCTS',
          reportTypeId: 'spCampaigns',
          groupBy: ['campaign'],
          columns: ['date', 'cost', 'impressions', 'clicks', 'purchases14d', 'sales14d'],
          timeUnit: 'DAILY',
          format: 'GZIP_JSON',
        },
      }),
    });
    if (!res.ok) throw new Error(`Amazon Ads report create failed: ${res.status} ${await res.text()}`);
    return ((await res.json()) as AmazonAdsReportStatus).reportId;
  }

  private async waitForReport(reportId: string): Promise<string> {
    for (let i = 0; i < MAX_POLLS; i++) {
      const res = await this.fetchImpl(`${BASE}/reporting/reports/${reportId}`, { headers: this.headers() });
      if (!res.ok) throw new Error(`Amazon Ads report status failed: ${res.status} ${await res.text()}`);
      const status = (await res.json()) as AmazonAdsReportStatus;
      if (status.status === 'COMPLETED' && status.url) return status.url;
      if (status.status === 'FAILURE') throw new Error(`Amazon Ads report FAILURE: ${status.failureReason ?? 'unbekannt'}`);
      await this.sleepImpl(POLL_INTERVAL_MS);
    }
    throw new Error(`Amazon Ads report Timeout nach ${MAX_POLLS} Polls (reportId ${reportId}).`);
  }

  private async downloadReport(url: string): Promise<AmazonAdsReportRow[]> {
    const res = await this.fetchImpl(url);
    if (!res.ok) throw new Error(`Amazon Ads report download failed: ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    return JSON.parse(gunzipSync(buf).toString('utf8')) as AmazonAdsReportRow[];
  }

  async fetchDailyReport(days: number): Promise<AmazonAdsReportRow[]> {
    const capped = Math.min(days, MAX_LOOKBACK_DAYS);
    const today = new Date().toISOString().slice(0, 10);
    const start = addDays(today, -(capped - 1));
    const rows: AmazonAdsReportRow[] = [];
    let windowStart = start;
    while (windowStart <= today) {
      const windowEnd = [addDays(windowStart, MAX_WINDOW_DAYS - 1), today].sort()[0];
      const reportId = await this.createReport(windowStart, windowEnd);
      const url = await this.waitForReport(reportId);
      rows.push(...(await this.downloadReport(url)));
      windowStart = addDays(windowEnd, 1);
    }
    return rows;
  }
}
