import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pool } from '@/lib/db';
import { getSyncInterval, SYNC_INTERVAL_MS } from '@/lib/settings';

const run = promisify(execFile);

/** Connectors the scheduler knows about; `key` matches the `npm run sync:<key>` scripts. */
export const SYNC_CONNECTORS: { key: string; label: string }[] = [
  { key: 'ga4', label: 'Google Analytics (GA4)' },
  { key: 'google', label: 'Google Ads' },
  { key: 'meta', label: 'Meta Ads' },
  { key: 'tiktok', label: 'TikTok Ads' },
  { key: 'shopware', label: 'Shopware' },
  { key: 'klaviyo', label: 'Klaviyo' },
];

export interface SyncStateRow {
  connector: string;
  label: string;
  configured: boolean;
  lastRunAt: string | null;
  status: string | null;
  detail: string | null;
}

/** A connector is runnable once it has at least one credential field configured. */
async function configuredConnectors(): Promise<Set<string>> {
  const r = await pool.query<{ connector: string }>('SELECT DISTINCT connector FROM connector_credentials');
  return new Set(r.rows.map((x) => x.connector));
}

export async function listSyncState(): Promise<SyncStateRow[]> {
  try {
    const [stateRes, configured] = await Promise.all([
      pool.query<{ connector: string; last_run_at: string | null; status: string | null; detail: string | null }>(
        'SELECT connector, last_run_at::text AS last_run_at, status, detail FROM sync_state',
      ),
      configuredConnectors(),
    ]);
    const byKey = new Map(stateRes.rows.map((x) => [x.connector, x]));
    return SYNC_CONNECTORS.map((c) => {
      const row = byKey.get(c.key);
      return {
        connector: c.key,
        label: c.label,
        configured: configured.has(c.key),
        lastRunAt: row?.last_run_at ?? null,
        status: row?.status ?? null,
        detail: row?.detail ?? null,
      };
    });
  } catch {
    // Degrade gracefully so the whole Einstellungen page never 500s on a DB hiccup.
    return SYNC_CONNECTORS.map((c) => ({
      connector: c.key, label: c.label, configured: false, lastRunAt: null, status: null, detail: null,
    }));
  }
}

/** Pick a human-readable line from a script's output — the error message, not a stack frame. */
function summarize(raw: string): string {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  return (
    lines.find((l) => /error/i.test(l) && !l.startsWith('at ')) ??
    lines.find((l) => !l.startsWith('at ') && !l.startsWith('^')) ??
    lines[0] ?? 'Fehler'
  );
}

async function record(connector: string, status: string, detail: string): Promise<void> {
  await pool.query(
    `INSERT INTO sync_state (connector, last_run_at, status, detail) VALUES ($1, now(), $2, $3)
     ON CONFLICT (connector) DO UPDATE SET last_run_at = now(), status = excluded.status, detail = excluded.detail`,
    [connector, status, detail.slice(0, 500)],
  );
}

/** Runs one connector's sync script and records the outcome in sync_state.
 *  A per-connector Postgres advisory lock serializes concurrent runs of the SAME
 *  connector (e.g. the "Jetzt" button overlapping the hourly cron), so their
 *  delete-then-insert writes to daily_metrics can't race into a duplicate-key. */
export async function runConnector(key: string): Promise<{ ok: boolean; detail: string }> {
  const lock = await pool.connect();
  try {
    await lock.query('SELECT pg_advisory_lock(hashtext($1))', [`sync:${key}`]);
    try {
      const { stdout } = await run('npm', ['run', `sync:${key}`], { cwd: process.cwd(), timeout: 150_000 });
      const detail = stdout.trim().split('\n').filter(Boolean).pop() ?? 'OK';
      await record(key, 'ok', detail);
      return { ok: true, detail };
    } catch (e) {
      const err = e as { stderr?: string; stdout?: string; message?: string };
      const detail = summarize(err.stderr || err.stdout || err.message || 'Fehler');
      await record(key, 'fehler', detail);
      return { ok: false, detail };
    }
  } finally {
    await lock.query('SELECT pg_advisory_unlock(hashtext($1))', [`sync:${key}`]).catch(() => {});
    lock.release();
  }
}

/** Runs every configured connector now (used by the "Jetzt synchronisieren" button). */
export async function runAll(): Promise<void> {
  const configured = await configuredConnectors();
  const keys = SYNC_CONNECTORS.filter((c) => configured.has(c.key)).map((c) => c.key);
  await Promise.all(keys.map((k) => runConnector(k)));
}

/** Configured connectors whose last run is older than `intervalMs` (or never run). Pure. */
export function dueConnectors(state: SyncStateRow[], intervalMs: number, now: number): string[] {
  return state
    .filter((s) => s.configured && (!s.lastRunAt || now - Date.parse(s.lastRunAt) >= intervalMs))
    .map((s) => s.connector);
}

/** Runs configured connectors whose last run is older than the configured interval (used by the cron). */
export async function runDue(): Promise<void> {
  const interval = await getSyncInterval();
  if (interval === 'off') {
    console.log('Sync interval is off — nothing to do.');
    return;
  }
  const state = await listSyncState();
  const due = dueConnectors(state, SYNC_INTERVAL_MS[interval], Date.now());
  if (due.length === 0) {
    console.log('No connectors due.');
    return;
  }
  console.log(`Running due connectors: ${due.join(', ')}`);
  await Promise.all(due.map((k) => runConnector(k)));
}
