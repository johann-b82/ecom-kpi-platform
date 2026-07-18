import type { EventStage } from './types';

export const FADEN_STAGES: EventStage[] = ['bestellt', 'kommissioniert', 'rechnung_gestellt', 'bezahlt'];

export interface Bead { stage: EventStage; filled: boolean }

/** Die feste Perlenreihe für einen Beleg; retoure erscheint als 5. Perle, sobald vorhanden. */
export function beadsFromStages(stages: EventStage[]): Bead[] {
  const has = new Set(stages);
  const beads: Bead[] = FADEN_STAGES.map((s) => ({ stage: s, filled: has.has(s) }));
  if (has.has('retoure')) beads.push({ stage: 'retoure', filled: true });
  return beads;
}
