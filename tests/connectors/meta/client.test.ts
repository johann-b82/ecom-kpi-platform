import { describe, it, expect, vi } from 'vitest';
import { MetaClient } from '@/connectors/meta/client';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('MetaClient.fetchInsights', () => {
  it('baut den act-Insights-Request und folgt paging.next', async () => {
    const page1 = { data: [{ date_start: '2026-01-01' }], paging: { next: 'https://graph.facebook.com/next-page' } };
    const page2 = { data: [{ date_start: '2026-01-02' }] };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res(page1))
      .mockResolvedValueOnce(res(page2));
    const client = new MetaClient('TOK', '12345', fetchMock as unknown as typeof fetch);
    const rows = await client.fetchInsights(30);

    expect(rows.map((r) => r.date_start)).toEqual(['2026-01-01', '2026-01-02']);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('https://graph.facebook.com/v21.0/act_12345/insights');
    expect(url).toContain('time_increment=1');
    expect(url).toContain('level=account');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer TOK' });
    // zweiter Call folgt exakt der next-URL
    expect(fetchMock.mock.calls[1][0]).toBe('https://graph.facebook.com/next-page');
  });

  it('wirft bei HTTP-Fehler mit Status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ error: { message: 'bad token' } }, 400));
    const client = new MetaClient('TOK', '12345', fetchMock as unknown as typeof fetch);
    await expect(client.fetchInsights(7)).rejects.toThrow(/insights failed: 400/);
  });
});
