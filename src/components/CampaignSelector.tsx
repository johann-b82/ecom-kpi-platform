'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CampaignSummary } from '@/kpi/campaigns';
import { PHASE_META } from '@/kpi/index';
import type { Phase } from '@/kpi/types';
import { formatCurrency } from '@/lib/format';

const STAGES: Phase[] = ['see', 'think', 'do', 'care'];

export function CampaignSelector(
  { campaigns, active, basePath }:
  { campaigns: CampaignSummary[]; active?: string; basePath: string },
) {
  const router = useRouter();
  const params = useSearchParams();

  const go = (campaign: string) => {
    const q = new URLSearchParams(params.toString());
    if (campaign === '') q.delete('campaign');
    else q.set('campaign', campaign);
    router.push(`${basePath}?${q.toString()}`);
  };

  const byStage = (s: Phase | null) => campaigns.filter((c) => c.stage === s);

  return (
    <select
      aria-label="Ansicht: Global oder Kampagne"
      value={active ?? ''}
      onChange={(e) => go(e.target.value)}
      className="rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100"
    >
      <option value="">Global (alle Kampagnen)</option>
      {STAGES.map((s) => {
        const items = byStage(s);
        if (!items.length) return null;
        return (
          <optgroup key={s} label={PHASE_META[s].title}>
            {items.map((c) => (
              <option key={c.id} value={c.id}>{`${c.name} · ${formatCurrency(c.spend)}`}</option>
            ))}
          </optgroup>
        );
      })}
      {byStage(null).length > 0 && (
        <optgroup label="Unzugeordnet">
          {byStage(null).map((c) => (
            <option key={c.id} value={c.id}>{`${c.name} · ${formatCurrency(c.spend)}`}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}
