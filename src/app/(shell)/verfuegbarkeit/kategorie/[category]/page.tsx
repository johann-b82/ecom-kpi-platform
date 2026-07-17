import { stockSeriesByCategory, salesSeriesByCategory, listCategoryVariants } from '@/verfuegbarkeit/history';
import { KategorieDetail } from '@/components/KategorieDetail';

export const dynamic = 'force-dynamic';

export default async function KategoriePage({ params }: { params: { category: string } }) {
  const category = decodeURIComponent(params.category);
  const [stock, sales, variants] = await Promise.all([
    stockSeriesByCategory(category, 365),
    salesSeriesByCategory(category, 365),
    listCategoryVariants(category),
  ]);
  return <KategorieDetail category={category} stock={stock} sales={sales} variants={variants} />;
}
