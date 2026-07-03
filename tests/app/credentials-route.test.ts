import { describe, it, expect, vi } from 'vitest';

const { setCredential, deleteCredential, isConfigured } = vi.hoisted(() => ({
  setCredential: vi.fn(async () => {}),
  deleteCredential: vi.fn(async () => {}),
  isConfigured: vi.fn(async () => false),
}));

vi.mock('@/lib/credentials', () => ({
  listStatus: async () => [
    { connector: 'shopware', field: 'SHOPWARE_API_URL', isSet: true, updatedAt: '2026-01-01' },
    { connector: 'shopware', field: 'SHOPWARE_CLIENT_SECRET', isSet: true, updatedAt: '2026-01-01' },
  ],
  getCredential: async (_c: string, f: string) => (f === 'SHOPWARE_API_URL' ? 'https://shop.example' : 'SHOULD-NOT-LEAK'),
  setCredential,
  deleteCredential,
  isConfigured,
}));

import { GET, POST } from '@/app/api/credentials/route';

describe('GET /api/credentials', () => {
  it('liefert nicht-secret-Werte, aber NIE secret-Werte', async () => {
    const body = await (await GET()).json();
    const url = body.fields.find((f: any) => f.field === 'SHOPWARE_API_URL');
    const secret = body.fields.find((f: any) => f.field === 'SHOPWARE_CLIENT_SECRET');
    expect(url.value).toBe('https://shop.example');
    expect(secret.value).toBeUndefined();
    expect(JSON.stringify(body)).not.toContain('SHOULD-NOT-LEAK');
  });
});

describe('POST /api/credentials', () => {
  it('setzt nicht-leere, ignoriert leere, löscht null', async () => {
    setCredential.mockClear(); deleteCredential.mockClear(); isConfigured.mockResolvedValue(false);
    const req = new Request('http://x/api/credentials', {
      method: 'POST',
      body: JSON.stringify({ connector: 'shopware', fields: { SHOPWARE_CLIENT_SECRET: 'new', SHOPWARE_CLIENT_ID: '', SHOPWARE_API_URL: null } }),
    });
    await POST(req);
    expect(setCredential).toHaveBeenCalledWith('shopware', 'SHOPWARE_CLIENT_SECRET', 'new');
    expect(setCredential).not.toHaveBeenCalledWith('shopware', 'SHOPWARE_CLIENT_ID', '');
    expect(deleteCredential).toHaveBeenCalledWith('shopware', 'SHOPWARE_API_URL');
  });

  it('blockiert WooCommerce mit 409, wenn Shopware bereits konfiguriert ist', async () => {
    setCredential.mockClear(); isConfigured.mockResolvedValue(true); // shopware sibling gesetzt
    const req = new Request('http://x/api/credentials', {
      method: 'POST',
      body: JSON.stringify({ connector: 'woocommerce', fields: { WOOCOMMERCE_STORE_URL: 'https://shop', WOOCOMMERCE_CONSUMER_KEY: 'ck', WOOCOMMERCE_CONSUMER_SECRET: 'cs' } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Shopware ist bereits konfiguriert/);
    expect(setCredential).not.toHaveBeenCalled();
  });

  it('erlaubt das Trennen (null) auch wenn das Geschwister gesetzt ist', async () => {
    deleteCredential.mockClear(); isConfigured.mockResolvedValue(true);
    const req = new Request('http://x/api/credentials', {
      method: 'POST',
      body: JSON.stringify({ connector: 'woocommerce', fields: { WOOCOMMERCE_STORE_URL: null } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(deleteCredential).toHaveBeenCalledWith('woocommerce', 'WOOCOMMERCE_STORE_URL');
  });

  it('erlaubt das Setzen, wenn kein Geschwister konfiguriert ist', async () => {
    setCredential.mockClear(); isConfigured.mockResolvedValue(false);
    const req = new Request('http://x/api/credentials', {
      method: 'POST',
      body: JSON.stringify({ connector: 'woocommerce', fields: { WOOCOMMERCE_STORE_URL: 'https://shop' } }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(setCredential).toHaveBeenCalledWith('woocommerce', 'WOOCOMMERCE_STORE_URL', 'https://shop');
  });
});

import { exclusiveSiblings } from '@/lib/connector-fields';

describe('exclusiveSiblings', () => {
  it('paart Shopware und WooCommerce', () => {
    expect(exclusiveSiblings('woocommerce')).toEqual(['shopware']);
    expect(exclusiveSiblings('shopware')).toEqual(['woocommerce']);
  });
  it('gibt [] für Connectoren ohne Exklusivgruppe zurück', () => {
    expect(exclusiveSiblings('ga4')).toEqual([]);
    expect(exclusiveSiblings('meta')).toEqual([]);
  });
});
