import { describe, it, expect, vi } from 'vitest';
import { Ga4Client } from '@/connectors/ga4/client';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('Ga4Client.runReport', () => {
  it('ruft den Property-Report mit Datum-Dimension und 8 Metriken auf', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ rows: [], metricHeaders: [] }));
    const client = new Ga4Client('12345', async () => 'TOK', fetchMock as unknown as typeof fetch);
    await client.runReport(30);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://analyticsdata.googleapis.com/v1beta/properties/12345:runReport');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer TOK' });
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.dimensions).toEqual([{ name: 'date' }]);
    expect(body.metrics.map((m: { name: string }) => m.name)).toEqual([
      'sessions', 'screenPageViews', 'totalUsers', 'newUsers', 'engagedSessions', 'addToCarts', 'checkouts',
      'ecommercePurchases',
    ]);
    expect(body.dateRanges).toEqual([{ startDate: '29daysAgo', endDate: 'today' }]);
  });

  it('wirft bei HTTP-Fehler mit Status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ error: { message: 'nope' } }, 403));
    const client = new Ga4Client('12345', async () => 'TOK', fetchMock as unknown as typeof fetch);
    await expect(client.runReport(7)).rejects.toThrow(/runReport failed: 403/);
  });
});
