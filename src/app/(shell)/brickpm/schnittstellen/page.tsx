import { listIntegrations } from '@/brickpm/repository';
import { BpmIntegrations } from '@/components/BpmIntegrations';

export const dynamic = 'force-dynamic';

export default async function SchnittstellenPage() {
  const items = await listIntegrations();
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Schnittstellen</h2>
      <p className="text-sm text-neutral-500">Demo-Modus — „Sync simulieren" aktualisiert den Zeitstempel und schreibt ins Protokoll.</p>
      <BpmIntegrations items={items} />
    </div>
  );
}
