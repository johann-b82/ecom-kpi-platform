import { salesTotals, channelSummary, statusFunnel } from '@/verkauf/repository';
import { addDays } from '@/lib/dates';
import { Filters } from '@/components/Filters';
import { ChartCard } from '@/components/charts/ChartCard';
import { KanalVergleich } from '@/components/KanalVergleich';
import { StatusFunnel } from '@/components/StatusFunnel';
import { eur } from '@/verkauf/format';

export const dynamic = 'force-dynamic';

function StatTile({ label, value, anno }: { label: string; value: string; anno?: string }) {
  return (
    <ChartCard>
      <p className="text-sm text-neutral-600 dark:text-neutral-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-neutral-900 dark:text-neutral-100">{value}</p>
      {anno && <p className="anno mt-1 text-neutral-500">{anno}</p>}
    </ChartCard>
  );
}

export default async function VerkaufUebersichtPage({ searchParams }: { searchParams: { days?: string } }) {
  const days = [7, 30, 90].includes(Number(searchParams.days)) ? Number(searchParams.days) : 30;
  const end = new Date().toISOString().slice(0, 10);
  const range = { start: addDays(end, -(days - 1)), end };
  const [totals, channels, funnel] = await Promise.all([
    salesTotals(range), channelSummary(range), statusFunnel(range),
  ]);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold tracking-tight">Verkauf · Übersicht</h2>
        <Filters range={range} basePath="/verkauf" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Umsatz" value={eur(totals.revenueNet)} anno="NETTO · OHNE MWST" />
        <StatTile label="Belege" value={String(totals.orders)} />
        <StatTile label="Ø Belegwert" value={eur(totals.avgOrderValueNet)} anno="NETTO · OHNE MWST" />
        <StatTile label="Offene Angebote" value={String(totals.openOffers)} />
      </div>
      <KanalVergleich channels={channels} />
      <StatusFunnel funnel={funnel} />
    </div>
  );
}
