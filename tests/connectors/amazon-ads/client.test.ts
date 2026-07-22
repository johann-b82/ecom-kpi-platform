import { describe, it, expect, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { AmazonAdsClient } from '@/connectors/amazon-ads/client';

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}
function gzRes(rows: unknown): Response {
  const buf = gzipSync(Buffer.from(JSON.stringify(rows)));
  return { ok: true, status: 200, arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) } as unknown as Response;
}
const noSleep = async () => {};

describe('AmazonAdsClient.fetchDailyReport', () => {
  it('creates a report, polls until COMPLETED, downloads and parses gzip json', async () => {
    const rows = [{ date: '2026-07-01', cost: 12.5, impressions: 100, clicks: 5, purchases14d: 1, sales14d: 40 }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ reportId: 'r1', status: 'PENDING' }))
      .mockResolvedValueOnce(res({ reportId: 'r1', status: 'PROCESSING' }))
      .mockResolvedValueOnce(res({ reportId: 'r1', status: 'COMPLETED', url: 'https://s3.test/r1.gz' }))
      .mockResolvedValueOnce(gzRes(rows));
    const client = new AmazonAdsClient('TOK', 'LWA', '111', fetchMock as unknown as typeof fetch, noSleep);
    const out = await client.fetchDailyReport(7);
    expect(out).toEqual(rows);

    const [createUrl, createInit] = fetchMock.mock.calls[0];
    expect(createUrl).toBe('https://advertising-api-eu.amazon.com/reporting/reports');
    expect((createInit as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer TOK',
      'Amazon-Advertising-API-ClientId': 'LWA',
      'Amazon-Advertising-API-Scope': '111',
      'Content-Type': 'application/vnd.createasyncreportrequest.v3+json',
    });
    const body = JSON.parse((createInit as RequestInit).body as string);
    expect(body.configuration).toMatchObject({
      adProduct: 'SPONSORED_PRODUCTS', reportTypeId: 'spCampaigns', timeUnit: 'DAILY', format: 'GZIP_JSON',
      columns: ['date', 'cost', 'impressions', 'clicks', 'purchases14d', 'sales14d'],
    });
    expect(fetchMock.mock.calls[1][0]).toBe('https://advertising-api-eu.amazon.com/reporting/reports/r1');
  });

  it('splits ranges over 31 days into multiple report jobs', async () => {
    const mk = (d: string) => [{ date: d, cost: 1, impressions: 1, clicks: 1, purchases14d: 0, sales14d: 0 }];
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ reportId: 'a', status: 'COMPLETED', url: 'https://s3.test/a.gz' }))
      .mockResolvedValueOnce(res({ reportId: 'a', status: 'COMPLETED', url: 'https://s3.test/a.gz' }))
      .mockResolvedValueOnce(gzRes(mk('2026-06-01')))
      .mockResolvedValueOnce(res({ reportId: 'b', status: 'COMPLETED', url: 'https://s3.test/b.gz' }))
      .mockResolvedValueOnce(res({ reportId: 'b', status: 'COMPLETED', url: 'https://s3.test/b.gz' }))
      .mockResolvedValueOnce(gzRes(mk('2026-07-01')));
    const client = new AmazonAdsClient('TOK', 'LWA', '111', fetchMock as unknown as typeof fetch, noSleep);
    const out = await client.fetchDailyReport(40);
    expect(out.map((r) => r.date)).toEqual(['2026-06-01', '2026-07-01']);
    // two create calls with adjacent, non-overlapping windows
    const startsEnds = [fetchMock.mock.calls[0], fetchMock.mock.calls[3]].map(([, init]) => {
      const b = JSON.parse((init as RequestInit).body as string);
      return [b.startDate, b.endDate] as [string, string];
    });
    expect(startsEnds[0][1] < startsEnds[1][0]).toBe(true);
  });

  it('fails cleanly on report FAILURE and on poll timeout', async () => {
    const failMock = vi.fn()
      .mockResolvedValueOnce(res({ reportId: 'r1', status: 'PENDING' }))
      .mockResolvedValueOnce(res({ reportId: 'r1', status: 'FAILURE', failureReason: 'boom' }));
    const c1 = new AmazonAdsClient('TOK', 'LWA', '111', failMock as unknown as typeof fetch, noSleep);
    await expect(c1.fetchDailyReport(7)).rejects.toThrow(/FAILURE/);

    const stuckMock = vi.fn().mockResolvedValue(res({ reportId: 'r1', status: 'PROCESSING' }));
    const c2 = new AmazonAdsClient('TOK', 'LWA', '111', stuckMock as unknown as typeof fetch, noSleep);
    await expect(c2.fetchDailyReport(7)).rejects.toThrow(/Timeout/);
  });

  it('throws with status on a non-OK create response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ message: 'throttled' }, 429));
    const client = new AmazonAdsClient('TOK', 'LWA', '111', fetchMock as unknown as typeof fetch, noSleep);
    await expect(client.fetchDailyReport(7)).rejects.toThrow(/429/);
  });
});
