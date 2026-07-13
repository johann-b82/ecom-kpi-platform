import type { EventStage } from '@/verkauf/types';
import { beadsFromStages } from '@/verkauf/faden';

export function Spur({ stages }: { stages: EventStage[] }) {
  const beads = beadsFromStages(stages);
  return (
    <span className="inline-flex items-center gap-1" aria-label="Fortschritt">
      {beads.map((b, i) => (
        <span key={i}
          title={b.stage}
          className={`inline-block h-2 w-2 rounded-full ${
            b.stage === 'retoure'
              ? 'bg-danger'
              : b.filled ? 'bg-accent' : 'bg-neutral-300 dark:bg-neutral-700'}`}
        />
      ))}
    </span>
  );
}
