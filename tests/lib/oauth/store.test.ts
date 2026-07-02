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
    // Distinctive plaintexts so the "not stored in cleartext" assertions below can't
    // coincidentally substring-match random base64 ciphertext.
    const access = 'ACCESS_TOKEN_PLAINTEXT';
    const refresh = 'REFRESH_TOKEN_PLAINTEXT';
    await saveConnection('google', { accessToken: access, refreshToken: refresh, expiresAt: exp, scope: 'sc', accountLabel: 'acct' });
    const conn = await getConnection('google');
    expect(conn).toMatchObject({ provider: 'google', accessToken: access, refreshToken: refresh, expiresAt: exp, scope: 'sc', accountLabel: 'acct' });
    const raw = await pool.query(`SELECT access_token_enc, refresh_token_enc FROM oauth_connections WHERE provider = 'google'`);
    expect(raw.rows[0].access_token_enc).not.toContain(access);
    expect(raw.rows[0].refresh_token_enc).not.toContain(refresh);
  });

  it('save without refreshToken preserves the stored one (refresh case)', async () => {
    await saveConnection('google', { accessToken: 'ACCESS_TOKEN_2', expiresAt: 1893456000000 });
    const conn = await getConnection('google');
    expect(conn?.accessToken).toBe('ACCESS_TOKEN_2');
    expect(conn?.refreshToken).toBe('REFRESH_TOKEN_PLAINTEXT');
  });

  it('delete removes the connection', async () => {
    await deleteConnection('google');
    expect(await getConnection('google')).toBeNull();
  });
});
