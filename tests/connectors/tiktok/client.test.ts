import { describe, it, expect, vi } from 'vitest';
import { TikTokClient } from '@/connectors/tiktok/client';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const row = (d: string) => ({ dimensions: { stat_time_day: d }, metrics: { spend: '1' } });

describe('TikTokClient.fetchReport', () => {
  it('baut den Report-Request, sendet Access-Token, paginiert über total_page', async () => {
    const page1 = { code: 0, message: 'OK', data: { list: [row('2026-01-01 00:00:00')], page_info: { page: 1, page_size: 1000, total_number: 2, total_page: 2 } } };
    const page2 = { code: 0, message: 'OK', data: { list: [row('2026-01-02 00:00:00')], page_info: { page: 2, page_size: 1000, total_number: 2, total_page: 2 } } };
    const fetchMock = vi.fn().mockResolvedValueOnce(res(page1)).mockResolvedValueOnce(res(page2));
    const client = new TikTokClient('TOK', 'ADV1', 'total_complete_payment', 'video_play_actions', fetchMock as unknown as typeof fetch);
    const rows = await client.fetchReport(30);

    expect(rows.map((r) => r.dimensions.stat_time_day)).toEqual(['2026-01-01 00:00:00', '2026-01-02 00:00:00']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://business-api.tiktok.com/open_api/v1.3/report/integrated/get/');
    expect(url).toContain('advertiser_id=ADV1');
    expect(url).toContain('report_type=BASIC');
    expect(decodeURIComponent(url as string)).toContain('"total_complete_payment"');
    expect(decodeURIComponent(url as string)).toContain('"video_play_actions"');
    expect((init as RequestInit).headers).toMatchObject({ 'Access-Token': 'TOK' });
  });

  it('wirft bei Body-Fehler (code !== 0)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ code: 40105, message: 'Access token is invalid', data: {} }));
    const client = new TikTokClient('TOK', 'ADV1', 'total_complete_payment', 'video_play_actions', fetchMock as unknown as typeof fetch);
    await expect(client.fetchReport(7)).rejects.toThrow(/error code 40105.*Access token is invalid/);
  });

  it('wirft bei echtem HTTP-Fehler', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({}, 500));
    const client = new TikTokClient('TOK', 'ADV1', 'total_complete_payment', 'video_play_actions', fetchMock as unknown as typeof fetch);
    await expect(client.fetchReport(7)).rejects.toThrow(/HTTP 500/);
  });
});
