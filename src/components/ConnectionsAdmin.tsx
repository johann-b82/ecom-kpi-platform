'use client';
import type { Connection } from '@/lib/integrations';
import { APPS } from '@/lib/apps';
import { ConnectionStubs } from '@/components/ConnectionStubs';
import { simulateConnectAction } from '@/app/setup/actions';

export function ConnectionsAdmin({ connections }: { connections: Connection[] }) {
  const byApp = new Map<string, Connection[]>();
  for (const c of connections) {
    const arr = byApp.get(c.app);
    if (arr) arr.push(c); else byApp.set(c.app, [c]);
  }
  const label = (app: string) => APPS.find((a) => a.key === app)?.label ?? app;
  const apps = [...byApp.keys()].sort((a, b) => label(a).localeCompare(label(b)));

  return (
    <div>
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500">App-Verbindungen</h2>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Demo-Verbindungen je App an einer zentralen Stelle. „Verbinden (Demo)" setzt den Status ohne echten API-Aufruf.
      </p>
      <div className="space-y-6">
        {apps.map((app) => (
          <div key={app}>
            <p className="anno mb-2 text-neutral-500">{label(app)}</p>
            <ConnectionStubs items={byApp.get(app)!} onConnect={simulateConnectAction} />
          </div>
        ))}
        {connections.length === 0 && <p className="text-sm text-neutral-500">Keine Verbindungen.</p>}
      </div>
    </div>
  );
}
