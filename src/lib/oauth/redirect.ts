export const STATE_COOKIE = 'oauth_state';

/** Absolute callback URL, derived from forwarded headers so it matches the value
 *  registered in the provider console (works behind Caddy and on localhost). */
export function redirectUriFor(request: Request, provider: string): string {
  const h = request.headers;
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3000';
  const proto = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}/api/oauth/${provider}/callback`;
}
