import { pool } from '@/lib/db';

const SYNCED = 'woocommerce_erp_orders_synced_at';
const FULL = 'woocommerce_erp_orders_full_synced_at';
const FULL_MAX_AGE_MS = 72_000_000; // 20h — forces a ~nightly full reconcile

async function get(key: string): Promise<Date | null> {
  const res = await pool.query('SELECT value FROM app_settings WHERE key = $1', [key]);
  const v = res.rows[0]?.value as string | undefined;
  return v ? new Date(v) : null;
}

async function set(key: string, value: string): Promise<void> {
  await pool.query(
    `INSERT INTO app_settings(key, value, updated_at) VALUES($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = now()`,
    [key, value],
  );
}

export async function getErpWatermarks(): Promise<{ syncedAt: Date | null; fullSyncedAt: Date | null }> {
  const [syncedAt, fullSyncedAt] = await Promise.all([get(SYNCED), get(FULL)]);
  return { syncedAt, fullSyncedAt };
}

export async function setErpWatermarks(startedAt: Date, opts: { full: boolean }): Promise<void> {
  await set(SYNCED, startedAt.toISOString());
  if (opts.full) await set(FULL, startedAt.toISOString());
}

export function shouldErpFullResync(syncedAt: Date | null, fullSyncedAt: Date | null, now: Date): boolean {
  if (!syncedAt || !fullSyncedAt) return true;
  return now.getTime() - fullSyncedAt.getTime() >= FULL_MAX_AGE_MS;
}
