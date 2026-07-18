'use client';
import { ChartCard } from '@/components/charts/ChartCard';
import { num } from '@/components/charts/chart-style';
import type { Forecast } from '@/verfuegbarkeit/forecast';

export function ForecastTile({ forecast }: { forecast: Forecast | null }) {
  if (!forecast) {
    return <ChartCard title="Nachliefer-Prognose">
      <p className="mt-3 text-sm text-neutral-500">Keine Prognose verfügbar.</p></ChartCard>;
  }
  const { avgDailyConsumption, reichweiteTage, leerAmDatum, sollBestellen, bestellvorschlag } = forecast;
  const reichweiteLabel = reichweiteTage === null ? 'kein Verbrauch'
    : `${num(Math.round(reichweiteTage))} Tage`;
  return (
    <ChartCard title="Nachliefer-Prognose">
      <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div><dt className="anno text-neutral-500">Ø Verbrauch/Tag</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{num(Math.round(avgDailyConsumption * 10) / 10)}</dd></div>
        <div><dt className="anno text-neutral-500">Reichweite</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{reichweiteLabel}</dd></div>
        <div><dt className="anno text-neutral-500">Voraussichtlich leer</dt>
          <dd className="text-neutral-900 dark:text-neutral-100">{leerAmDatum ?? '—'}</dd></div>
        <div><dt className="anno text-neutral-500">Bestellvorschlag</dt>
          <dd className={sollBestellen ? 'font-semibold text-brand' : 'text-neutral-900 dark:text-neutral-100'}>
            {sollBestellen ? `${num(bestellvorschlag)} Stück bestellen` : '—'}</dd></div>
      </dl>
      {sollBestellen && (
        <p className="mt-3 text-xs text-neutral-500">
          Reichweite unter 90 Tagen — bei Übersee-Lieferzeit jetzt nachbestellen.
        </p>
      )}
    </ChartCard>
  );
}
