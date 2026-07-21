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

export function campaignKpis(rows: AdSpend[], stage: Phase | null): Kpi[] {
  const spend = rows.reduce((s, a) => s + a.spend, 0);
  const impressions = rows.reduce((s, a) => s + a.impressions, 0);
  const clicks = rows.reduce((s, a) => s + a.clicks, 0);
  const conversions = rows.reduce((s, a) => s + a.conversions, 0);
  const convValue = rows.reduce((s, a) => s + a.convValue, 0);
  const cpm = ratio(spend, impressions);

  const impr = kpi('impressions', 'Impressions', 'see', impressions, 'number');
  const cpmK = kpi('cpm', 'CPM', 'see', cpm === null ? null : cpm * 1000, 'currency');
  const clk  = kpi('clicks', 'Klicks', 'see', clicks, 'number');
  const ctr  = kpi('ctr', 'CTR', 'see', ratio(clicks, impressions), 'percent');
  const cpc  = kpi('cpc', 'CPC', 'think', ratio(spend, clicks), 'currency');
  const conv = kpi('conversions', 'Conversions', 'do', conversions, 'number');
  const roas = kpi('roas', 'ROAS', 'do', ratio(convValue, spend), 'ratio');
  const cac  = kpi('cac_ads', 'CAC (Ad-Conversions)', 'do', ratio(spend, conversions), 'currency');
  const cv   = kpi('conv_value', 'Conversion-Wert', 'do', convValue, 'currency');

  switch (stage) {
    case 'see':   return [impr, cpmK, clk, ctr];
    case 'think': return [clk, ctr, cpc];
    case 'do':    return [conv, roas, cac, cv];
    case 'care':  return [conv, cv];
    default:      return [impr, clk, conv, cv]; // unzugeordnet: Roh-Ad-Kennzahlen
  }
}
