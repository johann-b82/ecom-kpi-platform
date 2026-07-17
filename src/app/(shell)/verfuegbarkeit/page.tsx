import { categoryRollup, dashboardKpis } from '@/verfuegbarkeit/history';
import { VerfuegbarkeitDashboard } from '@/components/VerfuegbarkeitDashboard';

export const dynamic = 'force-dynamic';

export default async function VerfuegbarkeitUebersichtPage() {
  const [kpis, rollup] = await Promise.all([dashboardKpis(), categoryRollup()]);
  return <VerfuegbarkeitDashboard kpis={kpis} rollup={rollup} />;
}
