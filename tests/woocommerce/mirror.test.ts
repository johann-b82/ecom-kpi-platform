import { describe, it, expect, vi } from 'vitest';
import { WooCommerceMirror, normalizeOrder, normalizeProduct, formatAmount } from '@/woocommerce/mirror';

function res(body: unknown, headers: Record<string, string> = {}, status = 200): Response {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => JSON.stringify(body),
    headers: { get: (k: string) => h.get(k.toLowerCase()) ?? null },
  } as unknown as Response;
}

const cfg = { storeUrl: 'shop.example.com', consumerKey: 'ck', consumerSecret: 'cs' };

describe('normalizeOrder', () => {
  it('bildet ein rohes WooCommerce-Order-Objekt auf MirrorOrder ab', () => {
    const raw = { id: 52029, number: '52029', status: 'processing', date_created: '2026-07-16T09:05:17', total: '75.89', currency: 'EUR' };
    expect(normalizeOrder(raw)).toEqual({
      id: 52029, number: '52029', status: 'processing', dateCreated: '2026-07-16T09:05:17', total: '75.89', currency: 'EUR',
    });
  });

  it('fällt auf die id zurück, wenn number fehlt', () => {
    const raw = { id: 7, status: 'completed', date_created: '2026-01-01T00:00:00', total: '1.00', currency: 'EUR' };
    expect(normalizeOrder(raw).number).toBe('7');
  });
});

describe('normalizeProduct', () => {
  it('bildet ein rohes WooCommerce-Product-Objekt auf MirrorProduct ab', () => {
    const raw = { id: 51216, name: 'Brick Arch 1x6x2', sku: '10112939', type: 'variable', status: 'publish', stock_quantity: 13, price: '2.50' };
    expect(normalizeProduct(raw)).toEqual({
      id: 51216, name: 'Brick Arch 1x6x2', sku: '10112939', type: 'variable', status: 'publish', stockQuantity: 13, price: '2.50',
    });
  });

  it('setzt stockQuantity auf null, wenn kein Bestand geführt wird', () => {
    const raw = { id: 1, name: 'X', sku: '', type: 'simple', status: 'draft', stock_quantity: null, price: '0.00' };
    expect(normalizeProduct(raw).stockQuantity).toBeNull();
  });
});

describe('formatAmount', () => {
  it('rundet Gleitkomma-Rauschen auf zwei Nachkommastellen (de-DE)', () => {
    expect(formatAmount('0.6999999951')).toBe('0,70');
    expect(formatAmount('0.5000000033')).toBe('0,50');
  });

  it('formatiert saubere Beträge einheitlich', () => {
    expect(formatAmount('75.89')).toBe('75,89');
    expect(formatAmount('0.0000')).toBe('0,00');
  });

  it('liefert einen Gedankenstrich für leere oder nicht-numerische Werte', () => {
    expect(formatAmount('')).toBe('—');
    expect(formatAmount('abc')).toBe('—');
  });
});

describe('WooCommerceMirror.fetchOrdersPage', () => {
  it('ruft die orders-Seite mit Basic-Auth, Paginierung und neueste-zuerst ab', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(
      [{ id: 2, number: '2', status: 'processing', date_created: '2026-07-16T00:00:00', total: '5.00', currency: 'EUR' }],
      { 'X-WP-Total': '13518', 'X-WP-TotalPages': '4506' },
    ));
    const mirror = new WooCommerceMirror(cfg, fetchMock as unknown as typeof fetch);
    const page = await mirror.fetchOrdersPage(1, 20);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(/^https:\/\/shop\.example\.com\/wp-json\/wc\/v3\/orders\?/);
    expect(url).toContain('per_page=20');
    expect(url).toContain('page=1');
    expect(url).toContain('orderby=date');
    expect(url).toContain('order=desc');
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${Buffer.from('ck:cs').toString('base64')}`);

    expect(page.total).toBe(13518);
    expect(page.totalPages).toBe(4506);
    expect(page.page).toBe(1);
    expect(page.items).toHaveLength(1);
    expect(page.items[0].number).toBe('2');
  });

  it('wirft mit Status und Body, wenn die API einen Fehler liefert', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ message: 'bad key' }, {}, 401));
    const mirror = new WooCommerceMirror(cfg, fetchMock as unknown as typeof fetch);
    await expect(mirror.fetchOrdersPage(1, 20)).rejects.toThrow(/401/);
  });
});

describe('WooCommerceMirror.fetchProductsPage', () => {
  it('ruft die products-Seite paginiert ab und liefert Totals aus den Headern', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res(
      [{ id: 51216, name: 'Brick', sku: '10112939', type: 'variable', status: 'publish', stock_quantity: 13, price: '2.50' }],
      { 'X-WP-Total': '442', 'X-WP-TotalPages': '23' },
    ));
    const mirror = new WooCommerceMirror(cfg, fetchMock as unknown as typeof fetch);
    const page = await mirror.fetchProductsPage(2, 20);

    expect(fetchMock.mock.calls[0][0]).toMatch(/\/wp-json\/wc\/v3\/products\?/);
    expect(fetchMock.mock.calls[0][0]).toContain('page=2');
    expect(page.total).toBe(442);
    expect(page.items[0].sku).toBe('10112939');
  });
});

describe('WooCommerceMirror.fetchProductsRaw', () => {
  it('holt die volle, unveränderte Produkt-Payload (ohne _fields-Verengung) plus Totals', async () => {
    const rawProduct = { id: 51216, name: 'Brick', sku: '10112939', categories: [{ id: 9, name: 'Steine' }], meta_data: [] };
    const fetchMock = vi.fn().mockResolvedValue(res([rawProduct], { 'X-WP-Total': '442', 'X-WP-TotalPages': '5' }));
    const mirror = new WooCommerceMirror(cfg, fetchMock as unknown as typeof fetch);
    const p = await mirror.fetchProductsRaw(1, 100);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/\/wp-json\/wc\/v3\/products\?/);
    expect(url).not.toContain('_fields=');
    expect(p.total).toBe(442);
    expect(p.items[0]).toEqual(rawProduct);
  });
});

describe('WooCommerceMirror.fetchOrdersRaw', () => {
  it('holt Bestellungen inkl. billing + line_items für den Backfill, plus Totals', async () => {
    const rawOrder = { id: 52029, number: '52029', status: 'completed', billing: { email: 'a@b.de' }, line_items: [{ sku: 'X', quantity: 1, price: '5.00' }] };
    const fetchMock = vi.fn().mockResolvedValue(res([rawOrder], { 'X-WP-Total': '13518', 'X-WP-TotalPages': '136' }));
    const mirror = new WooCommerceMirror(cfg, fetchMock as unknown as typeof fetch);
    const p = await mirror.fetchOrdersRaw(1, 100);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/\/wp-json\/wc\/v3\/orders\?/);
    expect(url).toContain('line_items');
    expect(url).toContain('billing');
    expect(url).toContain('status=any');
    expect(p.total).toBe(13518);
    expect(p.items[0]).toEqual(rawOrder);
  });

  it('hängt modified_after (dates_are_gmt) nur an, wenn ein Datum übergeben wird', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([], { 'X-WP-Total': '0', 'X-WP-TotalPages': '0' }));
    const mirror = new WooCommerceMirror(cfg, fetchMock as unknown as typeof fetch);

    await mirror.fetchOrdersRaw(1, 100);
    expect(fetchMock.mock.calls[0][0]).not.toContain('modified_after');

    await mirror.fetchOrdersRaw(1, 100, new Date('2026-07-16T00:00:00.000Z'));
    const url = fetchMock.mock.calls[1][0] as string;
    expect(url).toContain('modified_after=2026-07-16T00%3A00%3A00.000Z');
    expect(url).toContain('dates_are_gmt=true');
  });
});

describe('WooCommerceMirror.fetchVariationsRaw', () => {
  it('holt die Variationen eines variablen Produkts (voll) plus Totals', async () => {
    const rawVar = { id: 900, sku: 'PLATE-6X16-RED', price: '0.70', stock_quantity: 6, attributes: [{ name: 'Farbe', option: 'Rot' }] };
    const fetchMock = vi.fn().mockResolvedValue(res([rawVar], { 'X-WP-Total': '3', 'X-WP-TotalPages': '1' }));
    const mirror = new WooCommerceMirror(cfg, fetchMock as unknown as typeof fetch);
    const p = await mirror.fetchVariationsRaw(51216, 1);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toMatch(/\/wp-json\/wc\/v3\/products\/51216\/variations\?/);
    expect(url).not.toContain('_fields=');
    expect(p.total).toBe(3);
    expect(p.items[0]).toEqual(rawVar);
  });
});

describe('WooCommerceMirror.testConnection', () => {
  it('liefert ok=true und den Host bei erfolgreichem Ping', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res([], { 'X-WP-Total': '13518' }));
    const mirror = new WooCommerceMirror(cfg, fetchMock as unknown as typeof fetch);
    const r = await mirror.testConnection();
    expect(r.ok).toBe(true);
    expect(r.host).toBe('shop.example.com');
  });

  it('liefert ok=false bei einem HTTP-Fehler statt zu werfen', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ message: 'nope' }, {}, 403));
    const mirror = new WooCommerceMirror(cfg, fetchMock as unknown as typeof fetch);
    const r = await mirror.testConnection();
    expect(r.ok).toBe(false);
    expect(r.status).toBe(403);
  });
});
