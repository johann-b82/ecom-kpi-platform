import type { AdSpend, DateRange } from '@/lib/types';
import type { Kpi, Phase } from './types';
import { inRange, ratio, kpi } from './helpers';

// Kampagne → Ziel-Stage per Namenskonvention. Erste passende Regel gewinnt.
const STAGE_RULES: { stage: Phase; patterns: string[] }[] = [
  { stage: 'see',   patterns: ['prospecting', 'awareness', 'video'] },
  { stage: 'think', patterns: ['consideration', 'traffic'] },
  { stage: 'do',    patterns: ['retargeting', 'conversion', 'sales'] },
  { stage: 'care',  patterns: ['newsletter', 'reactivation', 'loyalty'] },
];

export function campaignStage(name: string): Phase | null {
  const n = name.toLowerCase();
  for (const rule of STAGE_RULES) {
    if (rule.patterns.some((p) => n.includes(p))) return rule.stage;
  }
  return null;
}

export interface CampaignSummary {
  id: string;
  name: string;
  platform: AdSpend['platform'];
  stage: Phase | null;
  spend: number;
  impressions: number;
  clicks: number;
  firstDate: string;
  lastDate: string;
}

const UNASSIGNED = '(unzugeordnet)';

export function listCampaigns(adSpend: AdSpend[], range: DateRange): CampaignSummary[] {
  const byId = new Map<string, CampaignSummary>();
  for (const r of adSpend) {
    if (!inRange(r.date, range)) continue;
    const id = r.campaignId ?? '__account__';
    const name = r.campaignName ?? UNASSIGNED;
    let s = byId.get(id);
    if (!s) {
      s = { id, name, platform: r.platform, stage: campaignStage(name),
        spend: 0, impressions: 0, clicks: 0, firstDate: r.date, lastDate: r.date };
      byId.set(id, s);
    }
    s.spend += r.spend;
    s.impressions += r.impressions;
    s.clicks += r.clicks;
    if (r.date < s.firstDate) s.firstDate = r.date;
    if (r.date > s.lastDate) s.lastDate = r.date;
  }
  return [...byId.values()].sort((a, b) => b.spend - a.spend);
}
