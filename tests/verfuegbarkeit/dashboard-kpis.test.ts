import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '../../src/lib/db';
import { dashboardKpis, categoryRollup } from '../../src/verfuegbarkeit/history';

afterAll(async () => { await pool.end(); });

describe('dashboardKpis', () => {
  it('summiert die Rollup-Zeilen konsistent', async () => {
    const [kpis, rollup] = await Promise.all([dashboardKpis(), categoryRollup()]);
    const sum = rollup.reduce((a, r) => ({
      bestand: a.bestand + r.gesamtbestand,
      unter: a.unter + r.anzahlUnterMeldebestand,
      kritisch: a.kritisch + r.anzahlKritisch,
    }), { bestand: 0, unter: 0, kritisch: 0 });
    expect(kpis.gesamtbestand).toBe(sum.bestand);
    expect(kpis.unterMeldebestand).toBe(sum.unter);
    expect(kpis.kritisch).toBe(sum.kritisch);
  });
});
