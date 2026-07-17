import { stockSeriesByCategory, salesSeriesByCategory, listCategoryVariants } from '@/verfuegbarkeit/history';
import { KategorieDetail } from '@/components/KategorieDetail';

export const dynamic = 'force-dynamic';

export default async function KategoriePage({ params }: { params: { category: string } }) {
  // Next reicht den Routen-Param hier URL-kodiert durch (verifiziert im Browser:
  // ohne Dekodierung erscheint z.B. "Ohne%20Kategorie"); dekodieren, passend zum
  // encodeURIComponent der Verlinkung im Dashboard/Kategorie-Rollup.
  const category = decodeURIComponent(params.category);
  const [stock, sales, variants] = await Promise.all([
    stockSeriesByCategory(category, 365),
    salesSeriesByCategory(category, 365),
    listCategoryVariants(category),
  ]);
  return <KategorieDetail category={category} stock={stock} sales={sales} variants={variants} />;
}
