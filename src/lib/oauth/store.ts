import { pool } from '@/lib/db';
import { encrypt, decrypt } from '@/lib/crypto';
import type { ProviderKey, TokenSet } from './types';

export interface OAuthConnection {
  provider: ProviderKey;
  refreshToken: string | null;
  accessToken: string | null;
  expiresAt: number | null; // epoch ms
  scope: string | null;
  accountLabel: string | null;
  updatedAt: string;
}

interface Row {
  provider: string;
  refresh_token_enc: string | null;
  access_token_enc: string | null;
  expires_at: string | null;
  scope: string | null;
  account_label: string | null;
  updated_at: string;
}

function toConnection(row: Row): OAuthConnection {
  return {
    provider: row.provider as ProviderKey,
    refreshToken: row.refresh_token_enc ? decrypt(row.refresh_token_enc) : null,
    accessToken: row.access_token_enc ? decrypt(row.access_token_enc) : null,
    expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    scope: row.scope,
    accountLabel: row.account_label,
    updatedAt: row.updated_at,
  };
}

export async function getConnection(provider: ProviderKey): Promise<OAuthConnection | null> {
  const res = await pool.query<Row>('SELECT * FROM oauth_connections WHERE provider = $1', [provider]);
  return res.rows[0] ? toConnection(res.rows[0]) : null;
}

export async function listConnections(): Promise<OAuthConnection[]> {
  const res = await pool.query<Row>('SELECT * FROM oauth_connections ORDER BY provider');
  return res.rows.map(toConnection);
}

export async function saveConnection(provider: ProviderKey, token: TokenSet): Promise<void> {
  // A refresh flow often omits refresh_token; COALESCE keeps the stored one.
  const refreshEnc = token.refreshToken ? encrypt(token.refreshToken) : null;
  const accessEnc = encrypt(token.accessToken);
  const expiresAt = token.expiresAt ? new Date(token.expiresAt).toISOString() : null;
  await pool.query(
    `INSERT INTO oauth_connections (provider, refresh_token_enc, access_token_enc, expires_at, scope, account_label, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, now())
     ON CONFLICT (provider) DO UPDATE SET
       refresh_token_enc = COALESCE(excluded.refresh_token_enc, oauth_connections.refresh_token_enc),
       access_token_enc  = excluded.access_token_enc,
       expires_at        = excluded.expires_at,
       scope             = COALESCE(excluded.scope, oauth_connections.scope),
       account_label     = COALESCE(excluded.account_label, oauth_connections.account_label),
       updated_at        = now()`,
    [provider, refreshEnc, accessEnc, expiresAt, token.scope ?? null, token.accountLabel ?? null],
  );
}

export async function deleteConnection(provider: ProviderKey): Promise<void> {
  await pool.query('DELETE FROM oauth_connections WHERE provider = $1', [provider]);
}
