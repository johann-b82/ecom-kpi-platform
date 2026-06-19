import { Pool } from 'pg';

const connectionString = process.env.DATABASE_URL ?? 'postgres://kpi:kpi@localhost:5432/kpi';

export const pool = new Pool({ connectionString });
