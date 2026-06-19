import { describe, it, expect, vi } from 'vitest';
import { GoogleAdsClient } from '@/connectors/google/client';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

const config = {
  developerToken: 'DEV', clientId: 'CID', clientSecret: 'SEC',
  refreshToken: 'RT', customerId: '1112223333', loginCustomerId: '9998887777',
};

describe('GoogleAdsClient.search', () => {
  it('holt ein Token und ruft searchStream, flacht Chunks', async () => {
    const token = { access_token: 'AT' };
    const stream = [
      { results: [{ segments: { date: '2026-01-01' }, metrics: { costMicros: '1' } }] },
      { results: [{ segments: { date: '2026-01-02' }, metrics: { costMicros: '2' } }] },
    ];
    const fetchMock = vi.fn().mockResolvedValueOnce(res(token)).mockResolvedValueOnce(res(stream));
    const client = new GoogleAdsClient(config, fetchMock as unknown as typeof fetch);
    const rows = await client.search(30);

    expect(rows.map((r) => r.segments.date)).toEqual(['2026-01-01', '2026-01-02']);

    // 1. Call: Token-Endpoint mit Refresh-Grant
    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    const tokenBody = JSON.parse((tokenInit as RequestInit).body as string);
    expect(tokenBody).toMatchObject({ grant_type: 'refresh_token', client_id: 'CID', refresh_token: 'RT' });

    // 2. Call: searchStream
    const [searchUrl, searchInit] = fetchMock.mock.calls[1];
    expect(searchUrl).toBe('https://googleads.googleapis.com/v17/customers/1112223333/googleAds:searchStream');
    expect((searchInit as RequestInit).headers).toMatchObject({
      Authorization: 'Bearer AT',
      'developer-token': 'DEV',
      'login-customer-id': '9998887777',
    });
    expect(JSON.parse((searchInit as RequestInit).body as string).query).toMatch(/SELECT segments\.date/);
  });

  it('wirft bei Auth-Fehler', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ error: 'invalid_grant' }, 400));
    const client = new GoogleAdsClient(config, fetchMock as unknown as typeof fetch);
    await expect(client.search(7)).rejects.toThrow(/auth failed: 400/);
  });

  it('wirft bei searchStream-Fehler', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ access_token: 'AT' }))
      .mockResolvedValueOnce(res({ error: {} }, 403));
    const client = new GoogleAdsClient(config, fetchMock as unknown as typeof fetch);
    await expect(client.search(7)).rejects.toThrow(/searchStream failed: 403/);
  });
});
