import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/oauth/store', () => ({ listConnections: vi.fn() }));
vi.mock('@/lib/oauth/token', () => ({ loadAppCredentials: vi.fn() }));

import { listOAuthStatus } from '@/lib/oauth/status';
import { listConnections } from '@/lib/oauth/store';
import { loadAppCredentials } from '@/lib/oauth/token';

beforeEach(() => {
  vi.mocked(listConnections).mockReset();
  vi.mocked(loadAppCredentials).mockReset();
});

describe('listOAuthStatus', () => {
  it('reports connected + app-cred presence per provider', async () => {
    vi.mocked(listConnections).mockResolvedValue([
      { provider: 'google', accessToken: 'AT', refreshToken: 'RT', expiresAt: 123, scope: 'sc', accountLabel: 'acct', updatedAt: '' },
    ]);
    vi.mocked(loadAppCredentials).mockResolvedValue({ clientId: 'CID', clientSecret: 'SEC' });
    const status = await listOAuthStatus();
    const google = status.find((s) => s.key === 'google')!;
    expect(google).toMatchObject({ connected: true, hasAppCreds: true, accountLabel: 'acct', expiresAt: 123 });
  });
});
