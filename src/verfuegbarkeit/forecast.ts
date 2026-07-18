// Nachliefer-Prognose: Verbrauchsrate + Reichweite. Bestellung aus Übersee →
// 90-Tage-Fenster und 90-Tage-Wiederbeschaffungshorizont.
export const CONSUMPTION_WINDOW_DAYS = 90;
export const LEAD_TIME_DAYS = 90;

export interface ForecastInput {
  onHand: number; reorderPoint: number; unitsInWindow: number; windowDays: number;
}
export interface Forecast {
  avgDailyConsumption: number;
  reichweiteTage: number | null;
  leerAmDatum: string | null;
  sollBestellen: boolean;
  bestellvorschlag: number;
}

function addDaysIso(today: Date, days: number): string {
  const d = new Date(today.getTime());
  d.setUTCDate(d.getUTCDate() + Math.floor(days));
  return d.toISOString().slice(0, 10);
}

export function computeForecast(input: ForecastInput, today: Date): Forecast {
  const { onHand, unitsInWindow, windowDays } = input;
  const avg = unitsInWindow > 0 && windowDays > 0 ? unitsInWindow / windowDays : 0;
  const reichweiteTage = avg > 0 ? onHand / avg : null;
  const leerAmDatum = reichweiteTage !== null ? addDaysIso(today, reichweiteTage) : null;
  const sollBestellen = reichweiteTage !== null && reichweiteTage < LEAD_TIME_DAYS;
  const bestellvorschlag = sollBestellen
    ? Math.max(0, Math.ceil(avg * LEAD_TIME_DAYS) - onHand)
    : 0;
  return { avgDailyConsumption: avg, reichweiteTage, leerAmDatum, sollBestellen, bestellvorschlag };
}
