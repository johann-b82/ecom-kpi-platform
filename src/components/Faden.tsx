'use client';
import { useState } from 'react';
import type { SalesOrderEvent, EventStage } from '@/verkauf/types';
import { beadsFromStages } from '@/verkauf/faden';

const STAGE_LABEL: Record<EventStage, string> = {
  bestellt: 'bestellt', kommissioniert: 'kommissioniert',
  rechnung_gestellt: 'Rechnung gestellt', bezahlt: 'bezahlt', retoure: 'Retoure',
};

export function Faden({ events }: { events: SalesOrderEvent[] }) {
  const [open, setOpen] = useState<EventStage | null>(null);
  const beads = beadsFromStages(events.map((e) => e.stage));
  const evByStage = new Map(events.map((e) => [e.stage, e] as const));
  const sel = open ? evByStage.get(open) : undefined;

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex items-center">
        {beads.map((b, i) => (
          <div key={b.stage} className="flex items-center">
            <button
              onClick={() => setOpen(open === b.stage ? null : b.stage)}
              disabled={!b.filled}
              title={STAGE_LABEL[b.stage]}
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs ${
                b.stage === 'retoure'
                  ? 'bg-danger text-white'
                  : b.filled ? 'bg-accent text-white' : 'border border-neutral-300 text-neutral-400 dark:border-neutral-700'}
                ${open === b.stage ? 'ring-2 ring-accent ring-offset-2 dark:ring-offset-neutral-900' : ''}`}>
              {i + 1}
            </button>
            {i < beads.length - 1 && (
              <span className={`h-0.5 w-10 ${beads[i + 1].filled ? 'bg-accent' : 'bg-neutral-300 dark:bg-neutral-700'}`} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
        {beads.map((b) => (
          <span key={b.stage} className="anno text-neutral-500" style={{ minWidth: '2rem' }}>{STAGE_LABEL[b.stage]}</span>
        ))}
      </div>
      {sel && (
        <div className="mt-3 rounded-md bg-neutral-100 p-3 text-sm dark:bg-neutral-800">
          <div className="font-medium">{STAGE_LABEL[sel.stage]}</div>
          <div className="text-neutral-500">{sel.occurredAt.replace('T', ' ').slice(0, 16)} · ausgelöst von {sel.sourceApp}</div>
          {sel.automated && <div className="text-neutral-500">automatisch ausgelöst</div>}
          {sel.note && <div className="mt-1">{sel.note}</div>}
        </div>
      )}
    </div>
  );
}
