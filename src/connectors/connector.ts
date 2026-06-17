import type { CanonicalDataset, DateRange } from '@/lib/types';

export interface Connector {
  source: string;
  fetch(range: DateRange): Promise<unknown>;
  normalize(raw: unknown): CanonicalDataset;
}
