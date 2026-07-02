import { getConnection, saveConnection } from './store';
import { getProvider } from './providers';
import { getCredential } from '@/lib/credentials';
import type { AppCredentials, ProviderKey } from './types';

const EXPIRY_BUFFER_MS = 60_000; // refresh a minute early

export async function loadAppCredentials(provider: ProviderKey): Promise<AppCredentials | null> {
  const p = getProvider(provider);
  if (!p) return null;
  const { connector, idField, secretField } = p.appCredentialSource;
  const clientId = await getCredential(connector, idField);
  const clientSecret = await getCredential(connector, secretField);
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export async function isConnected(provider: ProviderKey): Promise<boolean> {
  return (await getConnection(provider)) !== null;
}

export async function getOAuthAccessToken(
  provider: ProviderKey,
  opts: { now?: number; fetchImpl?: typeof fetch } = {},
): Promise<string> {
  const now = opts.now ?? Date.now();
  const p = getProvider(provider);
  if (!p) throw new Error(`Unbekannter OAuth-Provider: ${provider}`);

  const conn = await getConnection(provider);
  if (!conn || !conn.accessToken) {
    throw new Error(`${p.label} ist nicht verbunden — bitte in den Einstellungen verbinden.`);
  }

  const valid = conn.expiresAt === null || conn.expiresAt - EXPIRY_BUFFER_MS > now;
  if (valid) return conn.accessToken;

  // Expired. Refresh if the provider supports it and we have a refresh token.
  if (!p.refresh || !conn.refreshToken) {
    throw new Error(`${p.label}-Token abgelaufen — bitte neu verbinden.`);
  }
  const creds = await loadAppCredentials(provider);
  if (!creds) throw new Error(`${p.label} OAuth client id/secret fehlen — bitte in den Einstellungen hinterlegen.`);

  const refreshed = await p.refresh(
    { accessToken: conn.accessToken, refreshToken: conn.refreshToken, scope: conn.scope ?? undefined },
    creds,
    opts.fetchImpl,
  );
  await saveConnection(provider, refreshed);
  return refreshed.accessToken;
}
