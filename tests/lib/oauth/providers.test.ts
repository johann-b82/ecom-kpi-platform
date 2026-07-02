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
