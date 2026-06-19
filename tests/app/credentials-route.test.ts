import { describe, it, expect, vi } from 'vitest';

const { setCredential, deleteCredential } = vi.hoisted(() => ({
  setCredential: vi.fn(async () => {}),
  deleteCredential: vi.fn(async () => {}),
}));

vi.mock('@/lib/credentials', () => ({
  listStatus: async () => [
    { connector: 'shopware', field: 'SHOPWARE_API_URL', isSet: true, updatedAt: '2026-01-01' },
    { connector: 'shopware', field: 'SHOPWARE_CLIENT_SECRET', isSet: true, updatedAt: '2026-01-01' },
  ],
  getCredential: async (_c: string, f: string) => (f === 'SHOPWARE_API_URL' ? 'https://shop.example' : 'SHOULD-NOT-LEAK'),
  setCredential,
  deleteCredential,
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
    setCredential.mockClear(); deleteCredential.mockClear();
    const req = new Request('http://x/api/credentials', {
      method: 'POST',
      body: JSON.stringify({ connector: 'shopware', fields: { SHOPWARE_CLIENT_SECRET: 'new', SHOPWARE_CLIENT_ID: '', SHOPWARE_API_URL: null } }),
    });
    await POST(req);
    expect(setCredential).toHaveBeenCalledWith('shopware', 'SHOPWARE_CLIENT_SECRET', 'new');
    expect(setCredential).not.toHaveBeenCalledWith('shopware', 'SHOPWARE_CLIENT_ID', '');
    expect(deleteCredential).toHaveBeenCalledWith('shopware', 'SHOPWARE_API_URL');
  });
});
