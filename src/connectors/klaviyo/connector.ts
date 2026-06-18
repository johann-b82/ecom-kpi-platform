import type { CanonicalDataset, Subscriber } from '@/lib/types';
import type { KlaviyoAggregateAttributes } from './types';

function toMap(agg: KlaviyoAggregateAttributes): Map<string, number> {
  const counts = agg.data[0]?.measurements?.count ?? [];
  const map = new Map<string, number>();
  agg.dates.forEach((iso, i) => {
    map.set(iso.slice(0, 10), Number(counts[i] ?? 0));
  });
  return map;
}

export function normalizeAggregates(
  signups: KlaviyoAggregateAttributes,
  unsubs: KlaviyoAggregateAttributes,
): CanonicalDataset {
  const sMap = toMap(signups);
  const uMap = toMap(unsubs);
  const dates = [...new Set([...sMap.keys(), ...uMap.keys()])].sort();

  const subscribers: Subscriber[] = dates.map((date) => ({
    date,
    source: 'klaviyo',
    signups: sMap.get(date) ?? 0,
    unsubscribes: uMap.get(date) ?? 0,
    npsScore: null,
  }));

  return { dailyMetrics: [], orders: [], customers: [], adSpend: [], subscribers };
}
