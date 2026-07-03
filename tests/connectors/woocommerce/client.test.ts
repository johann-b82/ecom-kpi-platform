import { describe, it, expect, vi } from 'vitest';
import { WooCommerceClient } from '@/connectors/woocommerce/client';
import type { WooOrder } from '@/connectors/woocommerce/types';

function res(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as Response;
}

function order(id: number): WooOrder {
  return { id, status: 'completed', date_created: '2026-01-01T00:00:00', total: '10.00', customer_id: id };
}

const cfg = { storeUrl: 'https://shop.example.com/', consumerKey: 'ck', consumerSecret: 'cs' };

describe('WooCommerceClient', () => {
  it('nutzt Basic-Auth und die wc/v3-URL (Store-URL ohne trailing slash)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]));
    const client = new WooCommerceClient(cfg, fetchMock as unknown as typeof fetch);
    await client.fetchAllOrders();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/shop\.example\.com\/wp-json\/wc\/v3\/orders\?/);
    expect(url).toContain('status=any');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('ck:cs').toString('base64')}`);
  });

  it('paginiert, bis eine Seite < per_page zurückkommt', async () => {
    const full = Array.from({ length: 100 }, (_, i) => order(i + 1));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(full))          // Seite 1: voll → weiter
      .mockResolvedValueOnce(res([order(101)])); // Seite 2: < 100 → stop
    const client = new WooCommerceClient(cfg, fetchMock as unknown as typeof fetch);
    const all = await client.fetchAllOrders();
    expect(all).toHaveLength(101);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toContain('page=2');
  });

  it('wirft bei HTTP-Fehler mit Status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ message: 'nope' }, 401));
    const client = new WooCommerceClient(cfg, fetchMock as unknown as typeof fetch);
    await expect(client.fetchAllOrders()).rejects.toThrow(/WooCommerce fetch failed: 401/);
  });
});
