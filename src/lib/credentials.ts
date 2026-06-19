import { pool } from './db';
import { encrypt, decrypt } from './crypto';
import { CONNECTOR_FIELDS, CONNECTORS, type Connector } from './connector-fields';

export async function setCredential(connector: Connector, field: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO connector_credentials(connector, field, ciphertext, updated_at)
     VALUES($1, $2, $3, now())
     ON CONFLICT (connector, field) DO UPDATE SET ciphertext = excluded.ciphertext, updated_at = now()`,
    [connector, field, encrypt(value)],
  );
}

export async function deleteCredential(connector: Connector, field: string): Promise<void> {
  await pool.query('DELETE FROM connector_credentials WHERE connector = $1 AND field = $2', [connector, field]);
}

export async function getCredential(connector: Connector, field: string): Promise<string | null> {
  const res = await pool.query('SELECT ciphertext FROM connector_credentials WHERE connector = $1 AND field = $2', [connector, field]);
  return res.rows[0] ? decrypt(res.rows[0].ciphertext) : null;
}

export async function getCredentials(connector: Connector): Promise<Record<string, string>> {
  const res = await pool.query('SELECT field, ciphertext FROM connector_credentials WHERE connector = $1', [connector]);
  const out: Record<string, string> = {};
  for (const row of res.rows) out[row.field] = decrypt(row.ciphertext);
  return out;
}

export interface CredentialStatus {
  connector: Connector;
  field: string;
  isSet: boolean;
  updatedAt: string | null;
}

export async function listStatus(): Promise<CredentialStatus[]> {
  const res = await pool.query('SELECT connector, field, updated_at::text AS "updatedAt" FROM connector_credentials');
  const setMap = new Map<string, string>(res.rows.map((r) => [`${r.connector}:${r.field}`, r.updatedAt]));
  const out: CredentialStatus[] = [];
  for (const connector of CONNECTORS) {
    for (const f of CONNECTOR_FIELDS[connector]) {
      const updatedAt = setMap.get(`${connector}:${f.field}`) ?? null;
      out.push({ connector, field: f.field, isSet: updatedAt !== null, updatedAt });
    }
  }
  return out;
}
