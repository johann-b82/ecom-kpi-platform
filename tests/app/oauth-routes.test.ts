import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/oauth/store', () => ({ saveConnection: vi.fn(), deleteConnection: vi.fn() }));
vi.mock('@/lib/oauth/token', () => ({ loadAppCredentials: vi.fn() }));

import { GET as start } from '@/app/api/oauth/[provider]/start/route';
import { GET as callback } from '@/app/api/oauth/[provider]/callback/route';
import { loadAppCredentials } from '@/lib/oauth/token';
import { saveConnection } from '@/lib/oauth/store';

function req(url: string, cookie?: string): Request {
  return new Request(url, { headers: cookie ? { cookie } : {} });
}

beforeEach(() => {
  vi.mocked(loadAppCredentials).mockReset();
  vi.mocked(saveConnection).mockReset();
  vi.mocked(loadAppCredentials).mockResolvedValue({ clientId: 'CID', clientSecret: 'SEC' });
});

describe('GET /api/oauth/[provider]/start', () => {
  it('redirects to the consent screen and sets a state cookie', async () => {
    const res = await start(req('https://budp.lumeapps.de/api/oauth/google/start'), { params: { provider: 'google' } });
    expect(res.status).toBe(307);
    const location = res.headers.get('location')!;
    expect(location).toContain('accounts.google.com/o/oauth2/v2/auth');
    const setCookie = res.headers.get('set-cookie')!;
    expect(setCookie).toMatch(/oauth_state=/);
    const state = new URL(location).searchParams.get('state')!;
    expect(setCookie).toContain(`oauth_state=${state}`);
  });

  it('400 when app credentials are missing', async () => {
    vi.mocked(loadAppCredentials).mockResolvedValue(null);
    const res = await start(req('https://budp.lumeapps.de/api/oauth/google/start'), { params: { provider: 'google' } });
    expect(res.status).toBe(400);
  });

  it('404 for an unknown provider', async () => {
    const res = await start(req('https://budp.lumeapps.de/api/oauth/nope/start'), { params: { provider: 'nope' } });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/oauth/[provider]/callback', () => {
  it('rejects a mismatched state (no token stored)', async () => {
    const res = await callback(
      req('https://budp.lumeapps.de/api/oauth/google/callback?code=C&state=EVIL', 'oauth_state=GOOD'),
      { params: { provider: 'google' } },
    );
    expect(res.status).toBe(400);
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('redirects back to /setup with error when provider returns error', async () => {
    const res = await callback(
      req('https://budp.lumeapps.de/api/oauth/google/callback?error=access_denied', 'oauth_state=GOOD'),
      { params: { provider: 'google' } },
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/setup\?oauth=google&error=/);
    expect(saveConnection).not.toHaveBeenCalled();
  });

  it('exchanges the code and stores the token on the happy path', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ access_token: 'AT', refresh_token: 'RT', expires_in: 3600 }), text: async () => '',
    } as Response);
    vi.stubGlobal('fetch', fetchMock);
    const res = await callback(
      req('https://budp.lumeapps.de/api/oauth/google/callback?code=CODE&state=GOOD', 'oauth_state=GOOD'),
      { params: { provider: 'google' } },
    );
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toMatch(/\/setup\?oauth=google&connected=1/);
    expect(saveConnection).toHaveBeenCalledWith('google', expect.objectContaining({ accessToken: 'AT', refreshToken: 'RT' }));
    vi.unstubAllGlobals();
  });
});
