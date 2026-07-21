import type { CampaignSummary } from '@/kpi/campaigns';
import type { Kpi } from '@/kpi/types';
import { PHASE_META } from '@/kpi/index';
import { formatDeDate } from '@/lib/dates';
import { KpiCard } from './KpiCard';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-300 bg-neutral-100 p-3 dark:border-neutral-700 dark:bg-neutral-800/40">
      <div className="anno text-neutral-500 dark:text-neutral-400">{label}</div>
      <div className="mt-1 text-lg font-semibold text-neutral-900 dark:text-neutral-100">{value}</div>
    </div>
  );
}

export function CampaignDetail({ summary, kpis }: { summary: CampaignSummary; kpis: Kpi[] }) {
  const stageTitle = summary.stage ? PHASE_META[summary.stage].title : 'Unzugeordnet';
  const ctr = summary.impressions ? (summary.clicks / summary.impressions) * 100 : null;
  const [hero, ...rest] = kpis;

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">{summary.name}</h3>
        <span className="anno rounded bg-brand/10 px-2 py-0.5 text-brand">{stageTitle}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Spend" value={`${summary.spend.toLocaleString('de-DE')} €`} />
        <Stat label="Laufzeit" value={`${formatDeDate(summary.firstDate)} – ${formatDeDate(summary.lastDate)}`} />
        <Stat label="Impressions" value={summary.impressions.toLocaleString('de-DE')} />
        <Stat label="Klicks" value={summary.clicks.toLocaleString('de-DE')} />
        <Stat label="CTR" value={ctr === null ? '—' : `${ctr.toFixed(2)} %`} />
      </div>
      <p className="anno mt-4 text-neutral-500 dark:text-neutral-400">{stageTitle} · Ad-Performance dieser Kampagne</p>
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:max-w-md">
        {hero && <KpiCard kpi={hero} hero />}
        {rest.map((k) => <KpiCard key={k.key} kpi={k} />)}
      </div>
      <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-400">
        Hinweis: Umsatz-, Conversion-Rate- und CLV-Kennzahlen sind nicht kampagnen-attribuiert
        und erscheinen nur in der Global-Ansicht.
      </p>
    </div>
  );
}
