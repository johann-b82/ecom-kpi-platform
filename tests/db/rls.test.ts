import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';

afterAll(async () => { await pool.end(); });

describe('RLS on KPI tables', () => {
  it('authenticated can SELECT daily_metrics', async () => {
    const c = await pool.connect();
    try {
      await c.query('SET ROLE authenticated');
      await expect(c.query('SELECT count(*) FROM daily_metrics')).resolves.toBeTruthy();
    } finally {
      await c.query('RESET ROLE');
      c.release();
    }
  });
  it('anon is denied on daily_metrics', async () => {
    const c = await pool.connect();
    try {
      await c.query('SET ROLE anon');
      await expect(c.query('SELECT count(*) FROM daily_metrics')).rejects.toThrow(/permission denied/i);
    } finally {
      await c.query('RESET ROLE');
      c.release();
    }
  });
  it('authenticated (and thus the public PostgREST surface) is denied on connector_credentials', async () => {
    const c = await pool.connect();
    try {
      await c.query('SET ROLE authenticated');
      await expect(c.query('SELECT count(*) FROM connector_credentials')).rejects.toThrow(/permission denied/i);
    } finally {
      await c.query('RESET ROLE');
      c.release();
    }
  });
  it('authenticated is denied on oauth_connections', async () => {
    const c = await pool.connect();
    try {
      await c.query('SET ROLE authenticated');
      await expect(c.query('SELECT count(*) FROM oauth_connections')).rejects.toThrow(/permission denied/i);
    } finally {
      await c.query('RESET ROLE');
      c.release();
    }
  });

  for (const t of ['groups', 'group_members', 'group_app_access']) {
    it(`authenticated is denied on ${t}`, async () => {
      const c = await pool.connect();
      try {
        await c.query('SET ROLE authenticated');
        await expect(c.query(`SELECT count(*) FROM ${t}`)).rejects.toThrow(/permission denied/i);
      } finally {
        await c.query('RESET ROLE');
        c.release();
      }
    });
  }

  for (const t of ['bpm_products','bpm_promotions','bpm_goodies','bpm_competitors','bpm_notifications','bpm_integrations','bpm_audit_log']) {
    it(`authenticated is denied on ${t}`, async () => {
      const c = await pool.connect();
      try {
        await c.query('SET ROLE authenticated');
        await expect(c.query(`SELECT count(*) FROM ${t}`)).rejects.toThrow(/permission denied/i);
      } finally {
        await c.query('RESET ROLE');
        c.release();
      }
    });
  }
});
