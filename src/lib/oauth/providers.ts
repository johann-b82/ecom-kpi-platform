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

const META_VERSION = 'v21.0';

const meta: OAuthProvider = {
  key: 'meta',
  label: 'Meta',
  connectors: ['meta'],
  scopes: ['ads_read'],
  appCredentialSource: { connector: 'meta', idField: 'META_OAUTH_APP_ID', secretField: 'META_OAUTH_APP_SECRET' },
  authorizeUrl(redirectUri, state, creds) {
    const p = new URLSearchParams({
      client_id: creds.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.scopes.join(','),
      state,
    });
    return `https://www.facebook.com/${META_VERSION}/dialog/oauth?${p.toString()}`;
  },
  async exchangeCode(code, redirectUri, creds, fetchImpl = fetch) {
    // 1) code → short-lived token (GET with query params)
    const shortUrl = new URL(`https://graph.facebook.com/${META_VERSION}/oauth/access_token`);
    shortUrl.search = new URLSearchParams({
      client_id: creds.clientId, client_secret: creds.clientSecret, redirect_uri: redirectUri, code,
    }).toString();
    const shortRes = await fetchImpl(shortUrl.toString());
    if (!shortRes.ok) throw new Error(`meta token endpoint ${shortRes.status}: ${await shortRes.text()}`);
    const shortJson = (await shortRes.json()) as Record<string, unknown>;

    // 2) short-lived → long-lived (~60 days)
    const longUrl = new URL(`https://graph.facebook.com/${META_VERSION}/oauth/access_token`);
    longUrl.search = new URLSearchParams({
      grant_type: 'fb_exchange_token', client_id: creds.clientId, client_secret: creds.clientSecret,
      fb_exchange_token: String(shortJson.access_token),
    }).toString();
    const longRes = await fetchImpl(longUrl.toString());
    if (!longRes.ok) throw new Error(`meta token exchange ${longRes.status}: ${await longRes.text()}`);
    const longJson = (await longRes.json()) as Record<string, unknown>;
    return {
      accessToken: String(longJson.access_token),
      expiresAt: expiryFrom(longJson, Date.now()),
    };
  },
  // no refresh — user must reconnect on expiry
};

const TIKTOK_BASE = 'https://business-api.tiktok.com';

function tiktokEnvelope(json: Record<string, unknown>, provider = 'tiktok'): Record<string, unknown> {
  if (Number(json.code) !== 0) throw new Error(`${provider} token error code ${json.code}: ${json.message ?? ''}`);
  return (json.data ?? {}) as Record<string, unknown>;
}
function tiktokExpiry(data: Record<string, unknown>, nowMs: number): number | undefined {
  const secs = Number(data.access_token_expire_in);
  return Number.isFinite(secs) ? nowMs + secs * 1000 : undefined;
}

const tiktok: OAuthProvider = {
  key: 'tiktok',
  label: 'TikTok',
  connectors: ['tiktok'],
  scopes: [],
  appCredentialSource: { connector: 'tiktok', idField: 'TIKTOK_OAUTH_APP_ID', secretField: 'TIKTOK_OAUTH_APP_SECRET' },
  authorizeUrl(redirectUri, state, creds) {
    const p = new URLSearchParams({ app_id: creds.clientId, redirect_uri: redirectUri, state });
    return `${TIKTOK_BASE}/portal/auth?${p.toString()}`;
  },
  async exchangeCode(code, _redirectUri, creds, fetchImpl = fetch) {
    const data = tiktokEnvelope(await postToken(
      'tiktok', `${TIKTOK_BASE}/open_api/v1.3/oauth2/access_token/`,
      { app_id: creds.clientId, secret: creds.clientSecret, auth_code: code, grant_type: 'authorization_code' },
      fetchImpl,
    ));
    return {
      accessToken: String(data.access_token),
      refreshToken: data.refresh_token ? String(data.refresh_token) : undefined,
      expiresAt: tiktokExpiry(data, Date.now()),
    };
  },
  async refresh(current, creds, fetchImpl = fetch) {
    const data = tiktokEnvelope(await postToken(
      'tiktok', `${TIKTOK_BASE}/open_api/v1.3/oauth2/refresh_token/`,
      { app_id: creds.clientId, secret: creds.clientSecret, refresh_token: current.refreshToken ?? '', grant_type: 'refresh_token' },
      fetchImpl,
    ));
    return {
      accessToken: String(data.access_token),
      refreshToken: data.refresh_token ? String(data.refresh_token) : current.refreshToken,
      expiresAt: tiktokExpiry(data, Date.now()),
    };
  },
};

export const PROVIDERS: Partial<Record<ProviderKey, OAuthProvider>> = { google, meta, tiktok };

export const PROVIDER_KEYS = Object.keys(PROVIDERS) as ProviderKey[];

export function getProvider(key: string): OAuthProvider | null {
  return (PROVIDERS as Record<string, OAuthProvider>)[key] ?? null;
}
