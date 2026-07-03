'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { BpmIntegration } from '@/brickpm/types';
import { BpmChip } from './BpmChip';
import { simulateSync } from '@/app/brickpm/actions';

export function BpmIntegrations({ items }: { items: BpmIntegration[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function sync(id: string) {
    startTransition(async () => {
      await simulateSync(id);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((i) => (
        <div key={i.id} className="flex flex-col rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="font-semibold text-neutral-900 dark:text-neutral-100">{i.system}</span>
            <BpmChip label={i.status} />
          </div>
          <div className="text-xs text-neutral-500">{i.type} · {i.dir}</div>
          <p className="mt-2 flex-1 text-sm text-neutral-600 dark:text-neutral-400">{i.purpose}</p>
          <div className="mt-2 space-y-0.5 text-xs text-neutral-500">
            <div>Objekte: {i.objects.join(', ')}</div>
            <div>Endpunkt: <span className="font-mono">{i.ep}</span></div>
            <div>Letzter Sync: {i.lastSync}</div>
          </div>
          <button
            type="button"
            onClick={() => sync(i.id)}
            disabled={pending}
            className="mt-3 self-start rounded-md border border-brand px-3 py-1 text-sm text-brand transition-colors hover:bg-brand hover:text-white disabled:opacity-50"
          >
            Sync simulieren
          </button>
        </div>
      ))}
    </div>
  );
}
