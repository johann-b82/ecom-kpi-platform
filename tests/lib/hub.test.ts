import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { pool } from '@/lib/db';
import { setCredential } from '@/lib/credentials';
import { getHubCredentials, createHubConnectSession, probeHubConnection } from '@/lib/hub';

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}

describe('hub client (integration, benötigt DB)', () => {
  beforeAll(async () => {
    process.env.CREDENTIALS_KEY = Buffer.alloc(32, 7).toString('base64');
    await setCredential('hub', 'HUB_URL', 'https://hub.test');
    await setCredential('hub', 'HUB_API_KEY', 'key-123');
  });

  afterAll(async () => {
    await pool.query(`DELETE FROM connector_credentials WHERE connector = 'hub'`);
    await pool.end();
  });

  it('fetches credentials with the bearer key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ accessToken: 'at', expiresAt: null, accountConfig: { profileId: '111' }, clientId: 'lwa-id' }));
    const creds = await getHubCredentials('amazon_ads', fetchMock as unknown as typeof fetch);
    expect(creds.accessToken).toBe('at');
    expect(creds.accountConfig.profileId).toBe('111');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://hub.test/api/v1/credentials/amazon_ads');
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer key-123' });
  });

  it('maps hub error responses to German errors', async () => {
    const f404 = vi.fn().mockResolvedValue(res({ error: 'not_connected' }, 404));
    await expect(getHubCredentials('amazon_ads', f404 as unknown as typeof fetch)).rejects.toThrow(/nicht verbunden/);
    const f424 = vi.fn().mockResolvedValue(res({ error: 'reconnect_required' }, 424));
    await expect(getHubCredentials('amazon_ads', f424 as unknown as typeof fetch)).rejects.toThrow(/neu verbinden/i);
  });

  it('creates a connect session and returns the consent url', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ url: 'https://hub.test/connect/tok' }, 201));
    const url = await createHubConnectSession('amazon_sp', 'https://budp.test/setup', fetchMock as unknown as typeof fetch);
    expect(url).toBe('https://hub.test/connect/tok');
    const [reqUrl, init] = fetchMock.mock.calls[0];
    expect(reqUrl).toBe('https://hub.test/api/v1/connect-sessions');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ provider: 'amazon_sp', returnUrl: 'https://budp.test/setup' });
  });

  it('probes connection state without throwing', async () => {
    const ok = vi.fn().mockResolvedValue(res({ accessToken: 'at', expiresAt: null, accountConfig: {} }));
    expect(await probeHubConnection('amazon_ads', ok as unknown as typeof fetch)).toBe('verbunden');
    const notConn = vi.fn().mockResolvedValue(res({ error: 'not_connected' }, 404));
    expect(await probeHubConnection('amazon_ads', notConn as unknown as typeof fetch)).toBe('nicht verbunden');
    const recon = vi.fn().mockResolvedValue(res({ error: 'reconnect_required' }, 424));
    expect(await probeHubConnection('amazon_ads', recon as unknown as typeof fetch)).toBe('neu verbinden');
    const boom = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    expect(await probeHubConnection('amazon_ads', boom as unknown as typeof fetch)).toBe('fehler');
  });
});
