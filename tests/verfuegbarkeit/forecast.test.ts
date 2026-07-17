import { describe, it, expect } from 'vitest';
import { computeForecast } from '../../src/verfuegbarkeit/forecast';

const TODAY = new Date('2026-07-17T00:00:00Z');

describe('computeForecast', () => {
  it('rechnet Ø-Verbrauch, Reichweite und Leerdatum', () => {
    // 180 Stück in 90 Tagen = 2/Tag; 100 auf Lager → 50 Tage Reichweite.
    const f = computeForecast({ onHand: 100, reorderPoint: 40, unitsInWindow: 180, windowDays: 90 }, TODAY);
    expect(f.avgDailyConsumption).toBeCloseTo(2, 6);
    expect(f.reichweiteTage).toBeCloseTo(50, 6);
    expect(f.leerAmDatum).toBe('2026-09-05'); // 17.07. + 50 Tage
  });

  it('empfiehlt Bestellung, wenn Reichweite < LEAD_TIME_DAYS (90)', () => {
    // 2/Tag, 100 auf Lager → 50 Tage < 90 → bestellen; Ziel 90 Tage Deckung = 180, minus 100 = 80.
    const f = computeForecast({ onHand: 100, reorderPoint: 40, unitsInWindow: 180, windowDays: 90 }, TODAY);
    expect(f.sollBestellen).toBe(true);
    expect(f.bestellvorschlag).toBe(80);
  });

  it('empfiehlt nichts bei ausreichender Reichweite', () => {
    // 2/Tag, 400 auf Lager → 200 Tage > 90.
    const f = computeForecast({ onHand: 400, reorderPoint: 40, unitsInWindow: 180, windowDays: 90 }, TODAY);
    expect(f.sollBestellen).toBe(false);
    expect(f.bestellvorschlag).toBe(0);
    expect(f.reichweiteTage).toBeCloseTo(200, 6);
  });

  it('behandelt Null-Verbrauch: keine endliche Reichweite, kein Leerdatum', () => {
    const f = computeForecast({ onHand: 100, reorderPoint: 40, unitsInWindow: 0, windowDays: 90 }, TODAY);
    expect(f.avgDailyConsumption).toBe(0);
    expect(f.reichweiteTage).toBeNull();
    expect(f.leerAmDatum).toBeNull();
    expect(f.sollBestellen).toBe(false);
    expect(f.bestellvorschlag).toBe(0);
  });
});
