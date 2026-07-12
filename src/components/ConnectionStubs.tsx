'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Connection } from '@/lib/integrations';

export function ConnectionStubs({
  items, onConnect,
}: {
  items: Connection[];
  onConnect: (id: string) => Promise<void>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map((c) => {
        const connected = c.status.startsWith('verbunden');
        return (
          <div key={c.id} className="rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <p className="font-medium text-neutral-900 dark:text-neutral-100">{c.label}</p>
              <span className={`rounded-full px-2 py-0.5 text-xs ${connected
                ? 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-400'
                : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800'}`}>{c.status}</span>
            </div>
            <p className="anno mt-1 text-neutral-500">{c.provider}</p>
            {c.lastSyncedAt && <p className="mt-1 text-xs text-neutral-500">Zuletzt: {c.lastSyncedAt}</p>}
            <button disabled={pending}
              onClick={() => start(async () => { await onConnect(c.id); router.refresh(); })}
              className="mt-3 rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
              Verbinden (Demo)
            </button>
          </div>
        );
      })}
      {items.length === 0 && <p className="text-sm text-neutral-500">Keine Verbindungen.</p>}
    </div>
  );
}
