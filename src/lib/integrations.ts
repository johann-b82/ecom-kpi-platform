import { pool } from '@/lib/db';

export interface Connection {
  id: string; app: string; provider: string; label: string;
  status: string; lastSyncedAt: string | null;
}

/** Demo stub — mirrors BrickPM simulateSync: no real API call. */
export async function simulateConnect(id: string): Promise<void> {
  await pool.query(
    `UPDATE integration_connections SET status = 'verbunden (Demo)', last_synced_at = now() WHERE id = $1`, [id]);
}

export async function listAllConnections(): Promise<Connection[]> {
  const r = await pool.query(
    `SELECT id, app, provider, label, status, last_synced_at::text AS last_synced_at
       FROM integration_connections ORDER BY app, label`);
  return r.rows.map((x) => ({
    id: x.id, app: x.app, provider: x.provider, label: x.label,
    status: x.status, lastSyncedAt: x.last_synced_at,
  }));
}
