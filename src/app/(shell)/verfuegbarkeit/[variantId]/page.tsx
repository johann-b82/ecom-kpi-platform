import { notFound } from 'next/navigation';
import { getVariantStock, listWarehouses } from '@/verfuegbarkeit/repository';
import { stockSeries, salesSeries, getVariantForecastInput } from '@/verfuegbarkeit/history';
import { computeForecast, type Forecast } from '@/verfuegbarkeit/forecast';
import { BestandDetail } from '@/components/BestandDetail';

export const dynamic = 'force-dynamic';

export default async function VariantStockPage({ params }: { params: { variantId: string } }) {
  const detail = await getVariantStock(params.variantId);
  if (!detail) notFound();
  const [warehouses, stock, sales, fi] = await Promise.all([
    listWarehouses(),
    stockSeries(params.variantId, 365),
    salesSeries(params.variantId, 365),
    getVariantForecastInput(params.variantId),
  ]);
  const forecast: Forecast | null = fi
    ? computeForecast({ onHand: fi.onHand, reorderPoint: fi.reorderPoint, unitsInWindow: fi.unitsInWindow, windowDays: 90 }, new Date())
    : null;
  return <BestandDetail detail={detail} warehouses={warehouses} stock={stock} sales={sales} forecast={forecast} />;
}
