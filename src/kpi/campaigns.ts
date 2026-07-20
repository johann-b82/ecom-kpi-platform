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
