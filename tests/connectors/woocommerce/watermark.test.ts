import { describe, it, expect, afterAll, beforeEach } from 'vitest';
import { getWatermarks, setWatermarks, shouldFullResync } from '@/connectors/woocommerce/watermark';
import { pool } from '@/lib/db';

describe('WooCommerce watermarks (integration, benötigt laufende DB)', () => {
  beforeEach(async () => {
    await pool.query("DELETE FROM app_settings WHERE key IN ('woocommerce_orders_synced_at','woocommerce_orders_full_synced_at')");
  });
  afterAll(async () => { await pool.end(); });

  it('gibt null zurück, wenn nichts gesetzt ist', async () => {
    expect(await getWatermarks()).toEqual({ syncedAt: null, fullSyncedAt: null });
  });

  it('setzt bei full=true beide Watermarks', async () => {
    const t = new Date('2026-07-03T12:00:00.000Z');
    await setWatermarks(t, { full: true });
    const w = await getWatermarks();
    expect(w.syncedAt?.toISOString()).toBe(t.toISOString());
    expect(w.fullSyncedAt?.toISOString()).toBe(t.toISOString());
  });

  it('setzt bei full=false nur synced_at, lässt full_synced_at unberührt', async () => {
    const t1 = new Date('2026-07-03T12:00:00.000Z');
    await setWatermarks(t1, { full: true });
    const t2 = new Date('2026-07-03T13:00:00.000Z');
    await setWatermarks(t2, { full: false });
    const w = await getWatermarks();
    expect(w.syncedAt?.toISOString()).toBe(t2.toISOString());
    expect(w.fullSyncedAt?.toISOString()).toBe(t1.toISOString());
  });
});

describe('shouldFullResync (pure)', () => {
  const now = new Date('2026-07-03T12:00:00.000Z');
  it('true, wenn syncedAt null ist (erster Lauf)', () => {
    expect(shouldFullResync(null, null, now)).toBe(true);
  });
  it('true, wenn fullSyncedAt älter als 20h ist', () => {
    const old = new Date(now.getTime() - 72_000_001);
    expect(shouldFullResync(new Date(now.getTime() - 1000), old, now)).toBe(true);
  });
  it('false, wenn beide gesetzt und der letzte Full-Lauf < 20h her ist', () => {
    const recent = new Date(now.getTime() - 3_600_000);
    expect(shouldFullResync(recent, recent, now)).toBe(false);
  });
});
