import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/oauth/store', () => ({ getConnection: vi.fn(), saveConnection: vi.fn() }));
vi.mock('@/lib/credentials', () => ({ getCredential: vi.fn() }));
import { getOAuthAccessToken } from '@/lib/oauth/token';
import { getConnection } from '@/lib/oauth/store';

const NOW = 1_000_000_000_000;
beforeEach(() => { vi.mocked(getConnection).mockReset(); });

describe('meta token (no refresh)', () => {
  it('returns the token while valid', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'meta', accessToken: 'LONG', refreshToken: null, expiresAt: NOW + 60_000_000, scope: null, accountLabel: null, updatedAt: '',
    });
    expect(await getOAuthAccessToken('meta', { now: NOW })).toBe('LONG');
  });
  it('throws "neu verbinden" once expired (no refresh available)', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'meta', accessToken: 'LONG', refreshToken: null, expiresAt: NOW - 1000, scope: null, accountLabel: null, updatedAt: '',
    });
    await expect(getOAuthAccessToken('meta', { now: NOW })).rejects.toThrow(/neu verbinden/i);
  });
});
