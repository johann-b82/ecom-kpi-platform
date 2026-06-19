import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setCredential, getCredentials, getCredential, deleteCredential, listStatus } from '@/lib/credentials';
import { pool } from '@/lib/db';

beforeAll(() => { process.env.CREDENTIALS_KEY = Buffer.alloc(32, 9).toString('base64'); });
afterAll(async () => {
  await pool.query(`DELETE FROM connector_credentials WHERE connector = 'shopware'`);
  await pool.end();
});

describe('credentials store (integration, benötigt DB)', () => {
  it('set→get round-trip und Upsert', async () => {
    await setCredential('shopware', 'SHOPWARE_CLIENT_SECRET', 'sec1');
    expect((await getCredentials('shopware')).SHOPWARE_CLIENT_SECRET).toBe('sec1');
    await setCredential('shopware', 'SHOPWARE_CLIENT_SECRET', 'sec2');
    expect(await getCredential('shopware', 'SHOPWARE_CLIENT_SECRET')).toBe('sec2');
  });
  it('listStatus meldet isSet ohne Klartext', async () => {
    await setCredential('shopware', 'SHOPWARE_API_URL', 'https://shop.example');
    const st = await listStatus();
    const row = st.find((s) => s.connector === 'shopware' && s.field === 'SHOPWARE_API_URL')!;
    expect(row.isSet).toBe(true);
    expect(JSON.stringify(st)).not.toContain('https://shop.example');
  });
  it('delete entfernt das Credential', async () => {
    await deleteCredential('shopware', 'SHOPWARE_API_URL');
    expect(await getCredential('shopware', 'SHOPWARE_API_URL')).toBeNull();
  });
});
