import type { Connector } from '@/lib/connector-fields';
import type { ProviderKey } from './types';
import { PROVIDERS, PROVIDER_KEYS } from './providers';
import { listConnections } from './store';
import { loadAppCredentials } from './token';

export interface OAuthProviderStatus {
  key: ProviderKey;
  label: string;
  connectors: Connector[];
  connected: boolean;
  hasAppCreds: boolean;
  accountLabel: string | null;
  scope: string | null;
  expiresAt: number | null;
}

export async function listOAuthStatus(): Promise<OAuthProviderStatus[]> {
  const connections = await listConnections();
  const byProvider = new Map(connections.map((c) => [c.provider, c]));
  const out: OAuthProviderStatus[] = [];
  for (const key of PROVIDER_KEYS) {
    const p = PROVIDERS[key]!;
    const conn = byProvider.get(key) ?? null;
    const creds = await loadAppCredentials(key);
    out.push({
      key,
      label: p.label,
      connectors: p.connectors,
      connected: conn !== null,
      hasAppCreds: creds !== null,
      accountLabel: conn?.accountLabel ?? null,
      scope: conn?.scope ?? null,
      expiresAt: conn?.expiresAt ?? null,
    });
  }
  return out;
}
