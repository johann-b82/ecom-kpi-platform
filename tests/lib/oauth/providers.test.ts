import { describe, it, expect, vi } from 'vitest';
import { getProvider, PROVIDERS } from '@/lib/oauth/providers';

function res(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body) } as Response;
}
const creds = { clientId: 'CID', clientSecret: 'SEC' };
const REDIRECT = 'https://budp.lumeapps.de/api/oauth/google/callback';

describe('google provider', () => {
  it('builds an authorize URL with offline access, consent prompt and both scopes', () => {
    const g = PROVIDERS.google;
    const url = new URL(g.authorizeUrl(REDIRECT, 'STATE123', creds));
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe('CID');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
    expect(url.searchParams.get('state')).toBe('STATE123');
    expect(url.searchParams.get('scope')).toBe(
      'https://www.googleapis.com/auth/analytics.readonly https://www.googleapis.com/auth/adwords',
    );
  });

  it('exchangeCode posts an authorization_code grant and normalizes the token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600, scope: 'x' }));
    const token = await PROVIDERS.google.exchangeCode('CODE', REDIRECT, creds, fetchMock as unknown as typeof fetch);
    expect(token).toMatchObject({ accessToken: 'AT', refreshToken: 'RT', scope: 'x' });
    expect(typeof token.expiresAt).toBe('number');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://oauth2.googleapis.com/token');
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/x-www-form-urlencoded' });
    const body = Object.fromEntries(new URLSearchParams((init as RequestInit).body as string));
    expect(body).toMatchObject({ grant_type: 'authorization_code', code: 'CODE', client_id: 'CID', client_secret: 'SEC', redirect_uri: REDIRECT });
  });

  it('refresh posts a refresh_token grant and preserves the refresh token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ access_token: 'AT2', expires_in: 3600 }));
    const token = await PROVIDERS.google.refresh!(
      { accessToken: 'old', refreshToken: 'RT' }, creds, fetchMock as unknown as typeof fetch,
    );
    expect(token).toMatchObject({ accessToken: 'AT2', refreshToken: 'RT' });
    const body = Object.fromEntries(new URLSearchParams((fetchMock.mock.calls[0][1] as RequestInit).body as string));
    expect(body).toMatchObject({ grant_type: 'refresh_token', refresh_token: 'RT', client_id: 'CID', client_secret: 'SEC' });
  });

  it('exchangeCode throws on HTTP error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ error: 'invalid_grant' }, 400));
    await expect(PROVIDERS.google.exchangeCode('C', REDIRECT, creds, fetchMock as unknown as typeof fetch))
      .rejects.toThrow(/google.*token.*400/i);
  });

  it('getProvider returns null for unknown keys', () => {
    expect(getProvider('nope')).toBeNull();
    expect(getProvider('google')?.key).toBe('google');
  });
});

describe('meta provider', () => {
  const REDIRECT = 'https://budp.lumeapps.de/api/oauth/meta/callback';
  it('authorize URL targets the FB dialog with ads_read', () => {
    const url = new URL(PROVIDERS.meta!.authorizeUrl(REDIRECT, 'S', creds));
    expect(url.origin + url.pathname).toBe('https://www.facebook.com/v21.0/dialog/oauth');
    expect(url.searchParams.get('scope')).toBe('ads_read');
    expect(url.searchParams.get('state')).toBe('S');
  });
  it('exchangeCode exchanges code then long-lived token, no refresh token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(res({ access_token: 'SHORT', expires_in: 3600 }))
      .mockResolvedValueOnce(res({ access_token: 'LONG', expires_in: 5184000 }));
    const token = await PROVIDERS.meta!.exchangeCode('C', REDIRECT, creds, fetchMock as unknown as typeof fetch);
    expect(token.accessToken).toBe('LONG');
    expect(token.refreshToken).toBeUndefined();
    expect(token.expiresAt).toBeGreaterThan(Date.now());

    // Step 1: code → short-lived token at the FB token endpoint.
    const step1 = new URL(fetchMock.mock.calls[0][0] as string);
    expect(step1.origin + step1.pathname).toBe('https://graph.facebook.com/v21.0/oauth/access_token');
    expect(step1.searchParams.get('code')).toBe('C');
    expect(step1.searchParams.get('redirect_uri')).toBe(REDIRECT);
    // Step 2: short-lived → long-lived, threading step 1's token into fb_exchange_token.
    const step2 = new URL(fetchMock.mock.calls[1][0] as string);
    expect(step2.searchParams.get('grant_type')).toBe('fb_exchange_token');
    expect(step2.searchParams.get('fb_exchange_token')).toBe('SHORT');
  });
  it('has no refresh method', () => { expect(PROVIDERS.meta!.refresh).toBeUndefined(); });
});

describe('tiktok provider', () => {
  const REDIRECT = 'https://budp.lumeapps.de/api/oauth/tiktok/callback';
  it('authorize URL carries app_id, redirect and state', () => {
    const url = new URL(PROVIDERS.tiktok!.authorizeUrl(REDIRECT, 'S', creds));
    expect(url.searchParams.get('app_id')).toBe('CID');
    expect(url.searchParams.get('redirect_uri')).toBe(REDIRECT);
    expect(url.searchParams.get('state')).toBe('S');
  });
  it('exchangeCode reads token from data envelope and posts a JSON auth_code grant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ code: 0, data: { access_token: 'AT', refresh_token: 'RT', access_token_expire_in: 86400 } }));
    const token = await PROVIDERS.tiktok!.exchangeCode('C', REDIRECT, creds, fetchMock as unknown as typeof fetch);
    expect(token).toMatchObject({ accessToken: 'AT', refreshToken: 'RT' });
    expect(token.expiresAt).toBeGreaterThan(Date.now());
    // Verify the outgoing request: correct endpoint, JSON (not form) body with the expected fields.
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/');
    expect((init as RequestInit).headers).toMatchObject({ 'Content-Type': 'application/json' });
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      app_id: 'CID', secret: 'SEC', auth_code: 'C', grant_type: 'authorization_code',
    });
  });
  it('exchangeCode throws on a non-zero envelope code without leaking secrets', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ code: 40001, message: 'bad auth_code' }));
    const promise = PROVIDERS.tiktok!.exchangeCode('C', REDIRECT, creds, fetchMock as unknown as typeof fetch);
    await expect(promise).rejects.toThrow(/tiktok.*40001/i);
    await expect(promise).rejects.not.toThrow(/SEC/);
  });
  it('refresh uses refresh_token grant and returns a rotated refresh token', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ code: 0, data: { access_token: 'AT2', refresh_token: 'RT2', access_token_expire_in: 86400 } }));
    const token = await PROVIDERS.tiktok!.refresh!({ accessToken: 'old', refreshToken: 'RT' }, creds, fetchMock as unknown as typeof fetch);
    expect(token).toMatchObject({ accessToken: 'AT2', refreshToken: 'RT2' });
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({
      grant_type: 'refresh_token', refresh_token: 'RT',
    });
  });
  it('refresh preserves the stored refresh token when the response omits one', async () => {
    const fetchMock = vi.fn().mockResolvedValue(res({ code: 0, data: { access_token: 'AT2', access_token_expire_in: 86400 } }));
    const token = await PROVIDERS.tiktok!.refresh!({ accessToken: 'old', refreshToken: 'RT' }, creds, fetchMock as unknown as typeof fetch);
    expect(token).toMatchObject({ accessToken: 'AT2', refreshToken: 'RT' });
  });
});
