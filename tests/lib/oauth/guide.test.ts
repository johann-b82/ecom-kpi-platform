import { describe, it, expect } from 'vitest';
import { guideSteps } from '@/lib/oauth/guide';
import type { OAuthProviderStatus } from '@/lib/oauth/status';

function status(over: Partial<OAuthProviderStatus>): OAuthProviderStatus {
  return {
    key: 'google', label: 'Google', connectors: ['ga4', 'google'],
    connected: false, hasAppCreds: false, accountLabel: null, scope: null, expiresAt: null,
    ...over,
  };
}

describe('guideSteps', () => {
  it('returns five steps with the first one current when nothing is configured', () => {
    const steps = guideSteps(status({}));
    expect(steps.map((s) => s.state)).toEqual(['current', 'todo', 'todo', 'todo', 'todo']);
  });

  it('marks steps 1–3 done and the connect step current once app credentials are set', () => {
    const steps = guideSteps(status({ hasAppCreds: true }));
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'current', 'todo']);
  });

  it('marks every step done once connected', () => {
    const steps = guideSteps(status({ hasAppCreds: true, connected: true }));
    expect(steps.map((s) => s.state)).toEqual(['done', 'done', 'done', 'done', 'done']);
  });

  it('mentions both provider-specific callback URLs in the redirect step', () => {
    const steps = guideSteps(status({ key: 'tiktok', label: 'TikTok', connectors: ['tiktok'] }));
    const redirect = steps[1];
    expect(redirect.body).toContain('http://localhost:3000/api/oauth/tiktok/callback');
    expect(redirect.body).toContain('https://budp.lumeapps.de/api/oauth/tiktok/callback');
  });
});
