import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setCredential, deleteCredential, loadConnectorConfig } from '@/lib/credentials';
import { pool } from '@/lib/db';

beforeAll(() => { process.env.CREDENTIALS_KEY = Buffer.alloc(32, 5).toString('base64'); });
afterAll(async () => {
  await pool.query(`DELETE FROM connector_credentials WHERE connector = 'shopware'`);
  await pool.end();
});

describe('loadConnectorConfig (integration, benötigt DB)', () => {
  it('gibt vollständige Config zurück, wenn alle Pflichtfelder gesetzt sind', async () => {
    await setCredential('shopware', 'SHOPWARE_API_URL', 'https://shop.example');
    await setCredential('shopware', 'SHOPWARE_CLIENT_ID', 'cid');
    await setCredential('shopware', 'SHOPWARE_CLIENT_SECRET', 'sec');
    const cfg = await loadConnectorConfig('shopware');
    expect(cfg).toMatchObject({
      SHOPWARE_API_URL: 'https://shop.example',
      SHOPWARE_CLIENT_ID: 'cid',
      SHOPWARE_CLIENT_SECRET: 'sec',
    });
  });

  it('wirft mit /setup-Hinweis bei fehlendem Pflichtfeld', async () => {
    await deleteCredential('shopware', 'SHOPWARE_CLIENT_SECRET');
    await expect(loadConnectorConfig('shopware')).rejects.toThrow(/\/setup/);
  });
});
