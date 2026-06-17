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

  it('adSpend BIGINT-Felder werden als number zurückgegeben (nicht als string)', async () => {
    const data = await loadDataset();
    expect(data.adSpend.length).toBeGreaterThan(0);
    const row = data.adSpend[0];
    // node-pg returns BIGINT as string by default — repository must coerce to number
    expect(typeof row.impressions).toBe('number');
    expect(typeof row.clicks).toBe('number');
    expect(typeof row.conversions).toBe('number');
    expect(Number.isFinite(row.impressions)).toBe(true);
    expect(Number.isFinite(row.clicks)).toBe(true);
    expect(Number.isFinite(row.conversions)).toBe(true);
  });

  it('SEE impressions KPI ist available wenn adSpend-Daten vorhanden sind', async () => {
    const data = await loadDataset();
    expect(data.adSpend.length).toBeGreaterThan(0);
    const phases = computeKpis(data, { start: '2026-01-01', end: '2026-12-31' });
    const seePhase = phases.find((p) => p.phase === 'see')!;
    const impressionsKpi = seePhase.kpis.find((k) => k.key === 'impressions')!;
    expect(impressionsKpi.available).toBe(true);
    expect(typeof impressionsKpi.value).toBe('number');
    expect(Number.isFinite(impressionsKpi.value as number)).toBe(true);
  });
});
