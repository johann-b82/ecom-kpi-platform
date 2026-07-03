export const STATE_COOKIE = 'oauth_state';

/** Resolves the externally-visible host/proto from forwarded headers so it matches
 *  the value registered in the provider console (works behind Caddy and on localhost). */
export function resolveOrigin(request: Request): { host: string; proto: string } {
  const h = request.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return { host, proto };
}

/** Absolute callback URL, derived from forwarded headers so it matches the value
 *  registered in the provider console (works behind Caddy and on localhost). */
export function redirectUriFor(request: Request, provider: string): string {
  const { host, proto } = resolveOrigin(request);
  return `${proto}://${host}/api/oauth/${provider}/callback`;
}

/** Absolute app URL on the externally-visible origin. Use this for user-facing
 *  redirects instead of `new URL(path, request.url)` — behind a reverse proxy
 *  `request.url` is the internal address (localhost:3000), which would send the
 *  browser somewhere it can't reach. */
export function appUrl(request: Request, path: string): string {
  const { host, proto } = resolveOrigin(request);
  return `${proto}://${host}${path}`;
}
