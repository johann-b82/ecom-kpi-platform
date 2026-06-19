import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/credentials', async (orig) => {
  const actual = await orig() as Record<string, unknown>;
  return { ...actual, getCredentials: vi.fn() };
});

import { loadConnectorConfig, getCredentials } from '@/lib/credentials';

describe('loadConnectorConfig', () => {
  it('gibt vollständige Config zurück', async () => {
    (getCredentials as any).mockResolvedValue({ SHOPWARE_API_URL: 'u', SHOPWARE_CLIENT_ID: 'i', SHOPWARE_CLIENT_SECRET: 's' });
    expect(await loadConnectorConfig('shopware')).toMatchObject({ SHOPWARE_CLIENT_SECRET: 's' });
  });
  it('wirft mit /setup-Hinweis bei fehlendem Pflichtfeld', async () => {
    (getCredentials as any).mockResolvedValue({ SHOPWARE_API_URL: 'u' });
    await expect(loadConnectorConfig('shopware')).rejects.toThrow(/\/setup/);
  });
});
