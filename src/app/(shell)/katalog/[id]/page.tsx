import { notFound } from 'next/navigation';
import { getProduct, listPriceLists } from '@/katalog/repository';
import { listContacts } from '@/kontakte/repository';
import { KatalogDetail } from '@/components/KatalogDetail';

export const dynamic = 'force-dynamic';

export default async function ProduktDetailPage({ params }: { params: { id: string } }) {
  const product = await getProduct(params.id);
  if (!product) notFound();
  const [priceLists, contacts] = await Promise.all([listPriceLists(), listContacts()]);
  const suppliers = contacts.filter((c) => c.isSupplier).map((c) => ({ id: c.id, name: c.name }));
  return <KatalogDetail product={product} priceLists={priceLists} suppliers={suppliers} />;
}
