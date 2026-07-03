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

  it('fordert nur die benötigten Felder an (_fields) — reduziert die Payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]));
    const client = new WooCommerceClient(cfg, fetchMock as unknown as typeof fetch);
    await client.fetchAllOrders();
    expect(fetchMock.mock.calls[0][0]).toContain('_fields=id,status,date_created,total,customer_id,billing');
  });

  it('fügt modified_after (GMT) hinzu, wenn ein Datum übergeben wird', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]));
    const client = new WooCommerceClient(cfg, fetchMock as unknown as typeof fetch);
    await client.fetchAllOrders(new Date('2026-07-01T10:00:00.000Z'));
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('modified_after=2026-07-01T10%3A00%3A00.000Z');
    expect(url).toContain('dates_are_gmt=true');
  });

  it('lässt modified_after weg, wenn kein Datum übergeben wird', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]));
    const client = new WooCommerceClient(cfg, fetchMock as unknown as typeof fetch);
    await client.fetchAllOrders();
    expect(fetchMock.mock.calls[0][0]).not.toContain('modified_after');
  });

  it('ergänzt https:// wenn die Store-URL kein Schema hat', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]));
    const client = new WooCommerceClient(
      { storeUrl: 'bryxtoys.com', consumerKey: 'ck', consumerSecret: 'cs' },
      fetchMock as unknown as typeof fetch,
    );
    await client.fetchAllOrders();
    expect(fetchMock.mock.calls[0][0]).toMatch(/^https:\/\/bryxtoys\.com\/wp-json\/wc\/v3\/orders\?/);
  });

  it('behält ein vorhandenes http://-Schema bei', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([]));
    const client = new WooCommerceClient(
      { storeUrl: 'http://shop.local/', consumerKey: 'ck', consumerSecret: 'cs' },
      fetchMock as unknown as typeof fetch,
    );
    await client.fetchAllOrders();
    expect(fetchMock.mock.calls[0][0]).toMatch(/^http:\/\/shop\.local\/wp-json\/wc\/v3\/orders\?/);
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

  it('wirft einen klaren Timeout-Fehler, wenn der Store nicht antwortet', async () => {
    // fetch that hangs until its abort signal fires — like a real unresponsive host.
    const fetchMock = vi.fn((_url: string, init: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      }),
    );
    const client = new WooCommerceClient(cfg, fetchMock as unknown as typeof fetch, 20);
    await expect(client.fetchAllOrders()).rejects.toThrow(/timed out after 0\.02s/i);
  });
});
