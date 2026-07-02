import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { getConnection, saveConnection, deleteConnection } from '@/lib/oauth/store';
import { pool } from '@/lib/db';

beforeAll(() => { process.env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString('base64'); });
afterAll(async () => {
  await pool.query(`DELETE FROM oauth_connections WHERE provider = 'google'`);
  await pool.end();
});

describe('oauth token store (integration, benötigt DB)', () => {
  it('save→get round-trip, tokens encrypted at rest', async () => {
    const exp = 1893456000000; // fixed epoch ms
    await saveConnection('google', { accessToken: 'AT', refreshToken: 'RT', expiresAt: exp, scope: 'sc', accountLabel: 'acct' });
    const conn = await getConnection('google');
    expect(conn).toMatchObject({ provider: 'google', accessToken: 'AT', refreshToken: 'RT', expiresAt: exp, scope: 'sc', accountLabel: 'acct' });
    const raw = await pool.query(`SELECT access_token_enc, refresh_token_enc FROM oauth_connections WHERE provider = 'google'`);
    expect(raw.rows[0].access_token_enc).not.toContain('AT');
    expect(raw.rows[0].refresh_token_enc).not.toContain('RT');
  });

  it('save without refreshToken preserves the stored one (refresh case)', async () => {
    await saveConnection('google', { accessToken: 'AT2', expiresAt: 1893456000000 });
    const conn = await getConnection('google');
    expect(conn?.accessToken).toBe('AT2');
    expect(conn?.refreshToken).toBe('RT');
  });

  it('delete removes the connection', async () => {
    await deleteConnection('google');
    expect(await getConnection('google')).toBeNull();
  });
});
