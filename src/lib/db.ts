import { Pool, type PoolConfig } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://postgres:postgres@localhost:5432/postgres';

export function poolSsl(flag: string | undefined): PoolConfig['ssl'] {
  return flag === 'require' ? { rejectUnauthorized: false } : false;
}

export const pool = new Pool({ connectionString, ssl: poolSsl(process.env.DATABASE_SSL) });
