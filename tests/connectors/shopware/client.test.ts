import { describe, it, expect, vi } from 'vitest';
import { ShopwareClient } from '@/connectors/shopware/client';

const config = { apiUrl: 'https://shop.example', clientId: 'id', clientSecret: 'secret' };

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

describe('ShopwareClient', () => {
  it('holt ein Token und paginiert bis total erreicht ist', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ access_token: 'T', expires_in: 600 }))      // token
      .mockResolvedValueOnce(res({ data: [{ id: 'o1' }, { id: 'o2' }], total: 3 })) // page 1
      .mockResolvedValueOnce(res({ data: [{ id: 'o3' }], total: 3 }));             // page 2
    const client = new ShopwareClient(config, fetchMock as unknown as typeof fetch);
    const orders = await client.fetchAllOrders();
    expect(orders.map((o) => o.id)).toEqual(['o1', 'o2', 'o3']);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    // erster Call ist der Token-Endpoint
    expect((fetchMock.mock.calls[0][0] as string)).toContain('/api/oauth/token');
  });

  it('erneuert das Token bei 401 und wiederholt den Request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ access_token: 'T1' }))            // initial token
      .mockResolvedValueOnce(res({}, 401))                          // page1 → 401
      .mockResolvedValueOnce(res({ access_token: 'T2' }))           // refresh token
      .mockResolvedValueOnce(res({ data: [{ id: 'o1' }], total: 1 })); // retry page1
    const client = new ShopwareClient(config, fetchMock as unknown as typeof fetch);
    const orders = await client.fetchAllOrders();
    expect(orders.map((o) => o.id)).toEqual(['o1']);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('wirft bei fehlgeschlagenem Auth', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(res({ error: 'bad' }, 401));
    const client = new ShopwareClient(config, fetchMock as unknown as typeof fetch);
    await expect(client.getToken()).rejects.toThrow(/auth failed/i);
  });
});
