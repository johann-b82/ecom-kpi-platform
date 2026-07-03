import { describe, it, expect, afterAll } from 'vitest';
import { getSyncInterval, setSyncInterval } from '@/lib/settings';
import { pool } from '@/lib/db';

afterAll(async () => {
  await pool.query("DELETE FROM app_settings WHERE key = 'sync_interval'");
  await pool.end();
});

describe('sync interval setting (integration, benötigt DB)', () => {
  it('defaults to off when unset', async () => {
    await pool.query("DELETE FROM app_settings WHERE key = 'sync_interval'");
    expect(await getSyncInterval()).toBe('off');
  });

  it('round-trips a set value', async () => {
    await setSyncInterval('6h');
    expect(await getSyncInterval()).toBe('6h');
    await setSyncInterval('daily');
    expect(await getSyncInterval()).toBe('daily');
  });
});
