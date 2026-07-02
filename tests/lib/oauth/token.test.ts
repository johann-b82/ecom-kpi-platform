import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/oauth/store', () => ({ getConnection: vi.fn(), saveConnection: vi.fn() }));
vi.mock('@/lib/credentials', () => ({ getCredential: vi.fn() }));

import { getOAuthAccessToken, isConnected, loadAppCredentials } from '@/lib/oauth/token';
import { getConnection, saveConnection } from '@/lib/oauth/store';
import { getCredential } from '@/lib/credentials';

const NOW = 1_000_000_000_000;

beforeEach(() => {
  vi.mocked(getConnection).mockReset();
  vi.mocked(saveConnection).mockReset();
  vi.mocked(getCredential).mockReset();
  // Google app creds present by default.
  vi.mocked(getCredential).mockImplementation(async (_c, field) =>
    field === 'GOOGLE_ADS_CLIENT_ID' ? 'CID' : field === 'GOOGLE_ADS_CLIENT_SECRET' ? 'SEC' : null);
});

describe('getOAuthAccessToken', () => {
  it('returns the stored access token when still valid', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'google', accessToken: 'VALID', refreshToken: 'RT',
      expiresAt: NOW + 10 * 60_000, scope: null, accountLabel: null, updatedAt: '',
    });
    const token = await getOAuthAccessToken('google', { now: NOW });
    expect(token).toBe('VALID');
  });

  it('refreshes when the access token is expired', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'google', accessToken: 'OLD', refreshToken: 'RT',
      expiresAt: NOW - 1000, scope: null, accountLabel: null, updatedAt: '',
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200, json: async () => ({ access_token: 'FRESH', expires_in: 3600 }), text: async () => '',
    } as Response);
    const token = await getOAuthAccessToken('google', { now: NOW, fetchImpl: fetchMock as unknown as typeof fetch });
    expect(token).toBe('FRESH');
    expect(saveConnection).toHaveBeenCalledWith('google', expect.objectContaining({ accessToken: 'FRESH' }));
  });

  it('throws a clear error when not connected', async () => {
    vi.mocked(getConnection).mockResolvedValue(null);
    await expect(getOAuthAccessToken('google', { now: NOW })).rejects.toThrow(/nicht verbunden|not connected/i);
  });

  it('throws when app credentials are missing', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'google', accessToken: 'OLD', refreshToken: 'RT',
      expiresAt: NOW - 1000, scope: null, accountLabel: null, updatedAt: '',
    });
    vi.mocked(getCredential).mockResolvedValue(null);
    await expect(getOAuthAccessToken('google', { now: NOW })).rejects.toThrow(/client|credential/i);
  });
});

describe('isConnected / loadAppCredentials', () => {
  it('isConnected reflects store presence', async () => {
    vi.mocked(getConnection).mockResolvedValue(null);
    expect(await isConnected('google')).toBe(false);
  });
  it('loadAppCredentials returns null when secret unset', async () => {
    vi.mocked(getCredential).mockImplementation(async (_c, field) => field === 'GOOGLE_ADS_CLIENT_ID' ? 'CID' : null);
    expect(await loadAppCredentials('google')).toBeNull();
  });
});
