import { readFileSync } from 'node:fs';
import { pool } from '../src/lib/db';

async function main() {
  const sql = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');
  await pool.query(sql);
  console.log('Schema applied.');
  await pool.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
