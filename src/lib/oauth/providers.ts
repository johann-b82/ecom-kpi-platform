import type { AppCredentials, OAuthProvider, ProviderKey } from './types';

// Shared helper: exchange a POST body at a token endpoint and return parsed JSON.
async function postToken(
  provider: string,
  url: string,
  body: Record<string, string>,
  fetchImpl: typeof fetch,
  encoding: 'form' | 'json' = 'json',
): Promise<Record<string, unknown>> {
  const isForm = encoding === 'form';
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: { 'Content-Type': isForm ? 'application/x-www-form-urlencoded' : 'application/json' },
    body: isForm ? new URLSearchParams(body).toString() : JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${provider} token endpoint ${res.status}: ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

function expiryFrom(json: Record<string, unknown>, nowMs: number): number | undefined {
  const secs = Number(json.expires_in);
  return Number.isFinite(secs) ? nowMs + secs * 1000 : undefined;
}

const google: OAuthProvider = {
  key: 'google',
  label: 'Google',
  connectors: ['ga4', 'google'],
  scopes: [
    'https://www.googleapis.com/auth/analytics.readonly',
    'https://www.googleapis.com/auth/adwords',
  ],
  appCredentialSource: { connector: 'google', idField: 'GOOGLE_ADS_CLIENT_ID', secretField: 'GOOGLE_ADS_CLIENT_SECRET' },
  authorizeUrl(redirectUri, state, creds) {
    const p = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      prompt: 'consent',
      scope: this.scopes.join(' '),
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${p.toString()}`;
  },
  async exchangeCode(code, redirectUri, creds, fetchImpl = fetch) {
    const json = await postToken('google', 'https://oauth2.googleapis.com/token', {
      grant_type: 'authorization_code',
      code,
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
      redirect_uri: redirectUri,
    }, fetchImpl, 'form');
    return {
      accessToken: String(json.access_token),
      refreshToken: json.refresh_token ? String(json.refresh_token) : undefined,
      expiresAt: expiryFrom(json, Date.now()),
      scope: json.scope ? String(json.scope) : undefined,
    };
  },
  async refresh(current, creds, fetchImpl = fetch) {
    const json = await postToken('google', 'https://oauth2.googleapis.com/token', {
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken ?? '',
      client_id: creds.clientId,
      client_secret: creds.clientSecret,
    }, fetchImpl, 'form');
    return {
      accessToken: String(json.access_token),
      refreshToken: current.refreshToken, // Google does not re-issue it
      expiresAt: expiryFrom(json, Date.now()),
      scope: json.scope ? String(json.scope) : current.scope,
    };
  },
};

export const PROVIDERS: Partial<Record<ProviderKey, OAuthProvider>> = { google };

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[];

export function getProvider(key: string): OAuthProvider | null {
  return (PROVIDERS as Record<string, OAuthProvider>)[key] ?? null;
}
