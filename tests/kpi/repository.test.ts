import { describe, it, expect, afterAll } from 'vitest';
import { loadDataset } from '@/kpi/repository';
import { computeKpis } from '@/kpi/index';
import { pool } from '@/lib/db';

describe('repository (integration, benötigt geseedete DB)', () => {
  afterAll(async () => { await pool.end(); });

  it('lädt einen nichtleeren Datensatz und berechnet Phasen', async () => {
    const data = await loadDataset();
    expect(data.orders.length).toBeGreaterThan(0);
    const phases = computeKpis(data, { start: '2026-01-01', end: '2026-12-31' });
    expect(phases).toHaveLength(4);
    expect(phases[2].kpis.find((k) => k.key === 'revenue')!.available).toBe(true);
  });
});
