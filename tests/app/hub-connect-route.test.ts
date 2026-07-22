import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/hub', () => ({
  createHubConnectSession: vi.fn(),
  HubNotConfiguredError: class HubNotConfiguredError extends Error {},
}));

import { GET } from '@/app/api/hub/[provider]/connect/route';
import { createHubConnectSession, HubNotConfiguredError } from '@/lib/hub';

const req = (url: string) => new Request(url, { headers: { host: 'budp.test', 'x-forwarded-proto': 'https' } });

describe('GET /api/hub/[provider]/connect', () => {
  beforeEach(() => { vi.mocked(createHubConnectSession).mockReset(); });

  it('redirects to the hub consent url with a /setup return url', async () => {
    vi.mocked(createHubConnectSession).mockResolvedValue('https://hub.test/connect/tok');
    const res = await GET(req('https://budp.test/api/hub/amazon_ads/connect'), { params: { provider: 'amazon_ads' } });
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toBe('https://hub.test/connect/tok');
    expect(vi.mocked(createHubConnectSession).mock.calls[0]).toEqual(['amazon_ads', 'https://budp.test/setup']);
  });

  it('rejects unknown providers with 404', async () => {
    const res = await GET(req('https://budp.test/api/hub/google/connect'), { params: { provider: 'google' } });
    expect(res.status).toBe(404);
  });

  it('maps a missing hub config to 400 with a German message', async () => {
    vi.mocked(createHubConnectSession).mockImplementation(() => Promise.reject(new (HubNotConfiguredError as unknown as { new (): Error })()));
    const res = await GET(req('https://budp.test/api/hub/amazon_ads/connect'), { params: { provider: 'amazon_ads' } });
    expect(res.status).toBe(400);
  });
});
