import type { AdSpend } from '@/lib/types';

export interface PlatformEfficiency {
  platform: string; spend: number; convValue: number; roas: number | null;
}

// Erwartet bereits zeitraum-gefilterte adSpend-Zeilen.
export function adPlatformEfficiency(adSpend: AdSpend[]): PlatformEfficiency[] {
  const by = new Map<string, { spend: number; convValue: number }>();
  for (const a of adSpend) {
    const cur = by.get(a.platform) ?? { spend: 0, convValue: 0 };
    cur.spend += a.spend; cur.convValue += a.convValue;
    by.set(a.platform, cur);
  }
  return [...by.entries()]
    .map(([platform, v]) => ({
      platform, spend: v.spend, convValue: v.convValue,
      roas: v.spend > 0 ? v.convValue / v.spend : null,
    }))
    .sort((a, b) => b.spend - a.spend);
}
