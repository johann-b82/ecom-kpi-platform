import { pool } from '../src/lib/db';
import { CONNECTION_SEED } from '../src/lib/verbindungen-seed';

export async function seedVerbindungen(): Promise<void> {
  for (const c of CONNECTION_SEED) {
    await pool.query(
      `INSERT INTO integration_connections (id, app, provider, label, status)
       VALUES ($1,$2,$3,$4,$5)
       ON CONFLICT (id) DO UPDATE SET app=excluded.app, provider=excluded.provider,
         label=excluded.label, status=excluded.status`,
      [c.id, c.app, c.provider, c.label, c.status]);
  }
  console.log('Verbindungen seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-verbindungen.ts')) {
  seedVerbindungen().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
