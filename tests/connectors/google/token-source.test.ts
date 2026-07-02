import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/oauth/store', () => ({ getConnection: vi.fn() }));
vi.mock('@/lib/credentials', () => ({ getCredential: vi.fn() }));

import { isConnected } from '@/lib/oauth/token';
import { getConnection } from '@/lib/oauth/store';

describe('google connector token source selection', () => {
  it('isConnected("google") true when a connection row exists', async () => {
    vi.mocked(getConnection).mockResolvedValue({
      provider: 'google', accessToken: 'AT', refreshToken: 'RT', expiresAt: null, scope: null, accountLabel: null, updatedAt: '',
    });
    expect(await isConnected('google')).toBe(true);
  });
  it('isConnected("google") false when no row', async () => {
    vi.mocked(getConnection).mockResolvedValue(null);
    expect(await isConnected('google')).toBe(false);
  });
});
