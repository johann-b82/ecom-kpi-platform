import { listCompetitors, listCompetitorPrices } from '@/brickpm/repository';
import { deviationAlerts } from '@/brickpm/analytics';
import { BpmMonitoring } from '@/components/BpmMonitoring';

export const dynamic = 'force-dynamic';

export default async function MonitoringPage() {
  const [competitors, points] = await Promise.all([listCompetitors(), listCompetitorPrices()]);
  const alerts = deviationAlerts(competitors, 0.05);
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Wettbewerbs-Monitoring</h2>
      <BpmMonitoring points={points} alerts={alerts} />
    </div>
  );
}
