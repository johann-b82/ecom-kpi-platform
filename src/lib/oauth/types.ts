import type { Connector } from '@/lib/connector-fields';

export type ProviderKey = 'google' | 'meta' | 'tiktok';

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;   // epoch ms; absent → unknown / long-lived
  scope?: string;
  accountLabel?: string;
}

export interface AppCredentials {
  clientId: string;
  clientSecret: string;
}

export interface OAuthProvider {
  key: ProviderKey;
  label: string;
  connectors: Connector[];
  scopes: string[];
  // Where the OAuth app (client id/secret) is stored in the connector_credentials vault.
  appCredentialSource: { connector: Connector; idField: string; secretField: string };
  authorizeUrl(redirectUri: string, state: string, creds: AppCredentials): string;
  exchangeCode(
    code: string,
    redirectUri: string,
    creds: AppCredentials,
    fetchImpl?: typeof fetch,
  ): Promise<TokenSet>;
  refresh?(
    current: TokenSet,
    creds: AppCredentials,
    fetchImpl?: typeof fetch,
  ): Promise<TokenSet>;
}
