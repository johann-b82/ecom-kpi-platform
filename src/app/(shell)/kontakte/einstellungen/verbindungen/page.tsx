import { listConnections } from '@/lib/integrations';
import { ConnectionStubs } from '@/components/ConnectionStubs';
import { simulateConnectAction } from '@/app/(shell)/kontakte/actions';

export const dynamic = 'force-dynamic';

export default async function KontakteVerbindungenPage() {
  const items = await listConnections('kontakte');
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight">Verbindungen</h2>
      <ConnectionStubs items={items} onConnect={simulateConnectAction} />
    </div>
  );
}
