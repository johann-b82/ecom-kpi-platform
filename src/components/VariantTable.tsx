'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveVariantAction, removeVariantAction } from '@/app/(shell)/katalog/actions';
import type { Variant } from '@/katalog/types';

const INPUT = 'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';

export function VariantTable({ productId, variants }: { productId: string; variants: Variant[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function save(v: Variant, patch: Partial<Variant>) {
    startTransition(async () => {
      await saveVariantAction({
        id: v.id, productId, sku: v.sku, gtin: v.gtin, attributes: v.attributes,
        purchasePrice: v.purchasePrice, weightG: v.weightG, reorderPoint: v.reorderPoint,
        customsTariffNo: v.customsTariffNo, status: v.status, ...patch,
      } as never);
      router.refresh();
    });
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead><tr className="anno text-left text-neutral-500">
          <th className="py-2">SKU</th><th>EK</th><th>Meldebestand</th><th>Zolltarif</th><th></th>
        </tr></thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v.id} className="border-t border-neutral-200 dark:border-neutral-800">
              <td className="py-1"><input className={INPUT} defaultValue={v.sku} disabled={pending}
                onBlur={(e) => e.target.value !== v.sku && save(v, { sku: e.target.value })} /></td>
              <td><input className={INPUT} defaultValue={v.purchasePrice ?? ''} disabled={pending}
                onBlur={(e) => e.target.value !== (v.purchasePrice ?? '') && save(v, { purchasePrice: e.target.value as never })} /></td>
              <td><input className={INPUT} type="number" defaultValue={v.reorderPoint} disabled={pending}
                onBlur={(e) => Number(e.target.value) !== v.reorderPoint && save(v, { reorderPoint: Number(e.target.value) })} /></td>
              <td><input className={INPUT} defaultValue={v.customsTariffNo ?? ''} disabled={pending}
                onBlur={(e) => e.target.value !== (v.customsTariffNo ?? '') && save(v, { customsTariffNo: e.target.value })} /></td>
              <td><button className="text-sm text-neutral-500 hover:text-brand" disabled={pending}
                onClick={() => startTransition(async () => { await removeVariantAction(v.id, productId); router.refresh(); })}>Entfernen</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
