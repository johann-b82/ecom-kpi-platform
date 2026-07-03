import { describe, it, expect } from 'vitest';
import { appUrl, redirectUriFor, resolveOrigin } from '@/lib/oauth/redirect';

// A request as the Next handler sees it BEHIND a reverse proxy: request.url is the
// internal address (localhost:3000), while the real external host arrives via forwarded headers.
function proxied(path = '/api/oauth/google/callback') {
  return new Request(`http://localhost:3000${path}`, {
    headers: { 'x-forwarded-host': 'budp.lumeapps.de', 'x-forwarded-proto': 'https' },
  });
}

describe('appUrl', () => {
  it('builds an absolute URL on the EXTERNAL origin, not request.url', () => {
    // request.url is http://localhost:3000/... but the redirect must target budp.lumeapps.de
    expect(appUrl(proxied(), '/setup?oauth=google&connected=1')).toBe(
      'https://budp.lumeapps.de/setup?oauth=google&connected=1',
    );
  });

  it('falls back to the host header when no forwarded headers are present', () => {
    const req = new Request('http://localhost:3000/api/oauth/google/callback', {
      headers: { host: 'localhost:3000' },
    });
    expect(appUrl(req, '/setup?x=1')).toBe('http://localhost:3000/setup?x=1');
  });
});

describe('resolveOrigin / redirectUriFor (regression)', () => {
  it('redirectUriFor also uses the external origin', () => {
    expect(redirectUriFor(proxied(), 'google')).toBe('https://budp.lumeapps.de/api/oauth/google/callback');
  });
  it('resolveOrigin reads forwarded headers', () => {
    expect(resolveOrigin(proxied())).toEqual({ host: 'budp.lumeapps.de', proto: 'https' });
  });
});
