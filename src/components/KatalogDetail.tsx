'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { VariantTable } from '@/components/VariantTable';
import type { ProductDetail } from '@/katalog/types';
import { lifecycle, LIFECYCLE_STATUSES, type LifecycleStatus } from '@/katalog/lifecycle';
import {
  updateProductAction, changeLifecycleAction, saveVariantAction,
  savePriceAction, removePriceAction, addDocumentAction, removeDocumentAction,
  uploadProductImageAction, uploadDocumentFileAction,
} from '@/app/(shell)/katalog/actions';

const INPUT =
  'rounded border border-neutral-300 bg-neutral-100 px-2 py-1 text-sm text-neutral-900 dark:border-transparent dark:bg-neutral-800 dark:text-neutral-100';
const SECTION = 'rounded-lg border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900';
const ANNO = 'anno text-neutral-500';

function effectLine(status: LifecycleStatus): string {
  const f = lifecycle(status);
  const parts = [f.verkaufbar && 'verkaufbar', f.bestellbar && 'bestellbar', f.shopSichtbar && 'im Shop sichtbar']
    .filter(Boolean) as string[];
  return parts.length ? parts.join(', ') : 'keine Freigaben';
}

export function KatalogDetail({
  product,
  priceLists,
  suppliers,
}: {
  product: ProductDetail;
  priceLists: { id: string; name: string; currency: string }[];
  suppliers: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<LifecycleStatus>(product.lifecycleStatus);

  const [form, setForm] = useState({
    name: product.name,
    description: product.description ?? '',
    category: product.category ?? '',
    brand: product.brand ?? '',
    defaultSupplierId: product.defaultSupplierId ?? '',
    imageUrl: product.imageUrl ?? '',
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const productInput = () => ({
    name: form.name, description: form.description || null, lifecycleStatus: status,
    category: form.category || null, brand: form.brand || null,
    defaultSupplierId: form.defaultSupplierId || null, imageUrl: form.imageUrl || null,
  });

  const saveProduct = () => start(async () => { await updateProductAction(product.id, productInput()); router.refresh(); });

  const cycleStatus = () => {
    const i = LIFECYCLE_STATUSES.indexOf(status);
    const next = LIFECYCLE_STATUSES[(i + 1) % LIFECYCLE_STATUSES.length];
    setStatus(next);
    start(async () => { await changeLifecycleAction(product.id, next); router.refresh(); });
  };

  const [imgFallback, setImgFallback] = useState(!product.imageUrl);
  const onPickImage = (fd: FormData) => start(async () => {
    const { url } = await uploadProductImageAction(product.id, fd);
    if (!url) setImgFallback(true); else router.refresh();
  });

  // Variant add-row
  const [newSku, setNewSku] = useState('');
  const [newReorder, setNewReorder] = useState(0);
  const addVariant = () => {
    if (!newSku) return;
    start(async () => {
      await saveVariantAction({ productId: product.id, sku: newSku, reorderPoint: newReorder, status: 'aktiv' });
      setNewSku(''); setNewReorder(0); router.refresh();
    });
  };

  const skuOf = (variantId: string) => product.variants.find((v) => v.id === variantId)?.sku ?? variantId.slice(0, 8);
  const plName = (id: string) => priceLists.find((p) => p.id === id)?.name ?? id.slice(0, 8);

  // Price add-row
  const [np, setNp] = useState({ variantId: '', priceListId: '', minQty: 1, amount: '' });
  const addPrice = () => {
    if (!np.variantId || !np.priceListId) return;
    start(async () => {
      await savePriceAction(
        { variantId: np.variantId, priceListId: np.priceListId, minQty: np.minQty,
          amount: (np.amount || null) as never, validFrom: null },
        product.id);
      setNp({ variantId: '', priceListId: '', minQty: 1, amount: '' });
      router.refresh();
    });
  };

  // Document add-row (URL-paste; file upload degrades if Storage absent)
  const [nd, setNd] = useState({ type: '', fileUrl: '', expiresAt: '' });
  const addDoc = () => {
    if (!nd.type) return;
    start(async () => {
      await addDocumentAction({ productId: product.id, type: nd.type, fileUrl: nd.fileUrl || null, expiresAt: nd.expiresAt || null });
      setNd({ type: '', fileUrl: '', expiresAt: '' });
      router.refresh();
    });
  };
  const onPickDoc = (fd: FormData) => start(async () => { await uploadDocumentFileAction(fd); router.refresh(); });

  return (
    <div className="space-y-5">
      {/* Kopf */}
      <div className={SECTION}>
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            {form.imageUrl
              ? <img src={form.imageUrl} alt="" className="h-20 w-20 rounded object-cover" />
              : <div className="flex h-20 w-20 items-center justify-center rounded bg-neutral-100 text-neutral-400 dark:bg-neutral-800">—</div>}
            <input type="file" className="mt-2 block w-40 text-xs" disabled={pending}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.set('file', f); onPickImage(fd); } }} />
            {imgFallback && (
              <input className={`${INPUT} mt-2 w-40`} placeholder="Bild-URL" defaultValue={form.imageUrl}
                onBlur={(e) => { set('imageUrl', e.target.value); saveProduct(); }} />
            )}
          </div>
          <div className="flex-1 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <input className={`${INPUT} text-base font-semibold`} value={form.name}
                onChange={(e) => set('name', e.target.value)} />
              <button onClick={saveProduct} disabled={pending}
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">Speichern</button>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={cycleStatus} disabled={pending}
                className="rounded-full bg-accent px-3 py-1 text-sm font-medium text-white disabled:opacity-60">{status}</button>
              <span className="text-sm text-neutral-500">→ {effectLine(status)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Block 1: Stammdaten */}
      <div className={SECTION}>
        <p className={`${ANNO} mb-2`}>Stammdaten</p>
        <div className="space-y-2">
          <textarea className={`${INPUT} w-full`} rows={2} placeholder="Beschreibung" value={form.description}
            onChange={(e) => set('description', e.target.value)} />
          <div className="flex flex-wrap items-center gap-2">
            <input className={INPUT} placeholder="Kategorie" value={form.category}
              onChange={(e) => set('category', e.target.value)} />
            <input className={INPUT} placeholder="Marke" value={form.brand}
              onChange={(e) => set('brand', e.target.value)} />
            <label className="flex items-center gap-2 text-sm">
              Lieferant
              <select className={INPUT} value={form.defaultSupplierId}
                onChange={(e) => set('defaultSupplierId', e.target.value)}>
                <option value="">— keiner —</option>
                {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </label>
          </div>
        </div>
      </div>

      {/* Block 2: Varianten */}
      <div className={SECTION}>
        <p className={`${ANNO} mb-2`}>Varianten</p>
        <VariantTable productId={product.id} variants={product.variants} />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={INPUT} placeholder="Neue SKU" value={newSku} onChange={(e) => setNewSku(e.target.value)} />
          <input className={`${INPUT} w-28`} type="number" placeholder="Meldebestand" value={newReorder}
            onChange={(e) => setNewReorder(Number(e.target.value))} />
          <button className="text-sm text-brand hover:text-brand-dark" disabled={pending} onClick={addVariant}>
            + Variante hinzufügen
          </button>
        </div>
      </div>

      {/* Block 3: Preise */}
      <div className={SECTION}>
        <p className={`${ANNO} mb-2`}>Preise</p>
        <table className="w-full text-sm">
          <thead><tr className="anno text-left text-neutral-500">
            <th className="py-1">Variante</th><th>Preisliste</th><th>ab Menge</th><th>Betrag</th><th></th>
          </tr></thead>
          <tbody>
            {product.prices.map((pr) => (
              <tr key={pr.id} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-1">{skuOf(pr.variantId)}</td>
                <td>{plName(pr.priceListId)}</td>
                <td>{pr.minQty}</td>
                <td>
                  <input className={`${INPUT} w-24`} defaultValue={pr.amount ?? ''} disabled={pending}
                    onBlur={(e) => e.target.value !== (pr.amount ?? '') && start(async () => {
                      await savePriceAction(
                        { variantId: pr.variantId, priceListId: pr.priceListId, minQty: pr.minQty,
                          amount: (e.target.value || null) as never, validFrom: pr.validFrom },
                        product.id);
                      router.refresh();
                    })} />
                </td>
                <td>
                  <button className="text-sm text-neutral-500 hover:text-brand" disabled={pending}
                    onClick={() => start(async () => { await removePriceAction(pr.id, product.id); router.refresh(); })}>Entfernen</button>
                </td>
              </tr>
            ))}
            {product.prices.length === 0 && <tr><td colSpan={5} className="py-1 text-neutral-500">Keine Preise.</td></tr>}
          </tbody>
        </table>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <select className={INPUT} value={np.variantId} onChange={(e) => setNp((s) => ({ ...s, variantId: e.target.value }))}>
            <option value="">Variante …</option>
            {product.variants.map((v) => <option key={v.id} value={v.id}>{v.sku}</option>)}
          </select>
          <select className={INPUT} value={np.priceListId} onChange={(e) => setNp((s) => ({ ...s, priceListId: e.target.value }))}>
            <option value="">Preisliste …</option>
            {priceLists.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className={`${INPUT} w-20`} type="number" placeholder="ab" value={np.minQty}
            onChange={(e) => setNp((s) => ({ ...s, minQty: Number(e.target.value) }))} />
          <input className={`${INPUT} w-24`} placeholder="Betrag" value={np.amount}
            onChange={(e) => setNp((s) => ({ ...s, amount: e.target.value }))} />
          <button className="text-sm text-brand hover:text-brand-dark" disabled={pending} onClick={addPrice}>+ Preis</button>
        </div>
      </div>

      {/* Block 4: Bundle */}
      {product.bundle.length > 0 && (
        <div className={SECTION}>
          <p className={`${ANNO} mb-2`}>Bundle-Komponenten</p>
          <ul className="space-y-1 text-sm">
            {product.bundle.map((b) => (
              <li key={b.id}>{b.quantity}× {skuOf(b.componentVariantId)}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Compliance */}
      <div className={SECTION}>
        <p className={`${ANNO} mb-2`}>Compliance / Dokumente</p>
        <ul className="space-y-1 text-sm">
          {product.documents.map((d) => (
            <li key={d.id} className="flex items-center gap-3">
              <span className="font-medium">{d.type}</span>
              {d.fileUrl && <a href={d.fileUrl} className="text-brand hover:text-brand-dark">Datei</a>}
              {d.expiresAt && <span className="text-neutral-500">gültig bis {d.expiresAt}</span>}
              <button className="text-neutral-500 hover:text-brand" disabled={pending}
                onClick={() => start(async () => { await removeDocumentAction(d.id, product.id); router.refresh(); })}>Entfernen</button>
            </li>
          ))}
          {product.documents.length === 0 && <li className="text-neutral-500">Keine Dokumente.</li>}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input className={INPUT} placeholder="Typ (z. B. CE)" value={nd.type}
            onChange={(e) => setNd((s) => ({ ...s, type: e.target.value }))} />
          <input className={INPUT} placeholder="Datei-URL" value={nd.fileUrl}
            onChange={(e) => setNd((s) => ({ ...s, fileUrl: e.target.value }))} />
          <input className={INPUT} type="date" value={nd.expiresAt}
            onChange={(e) => setNd((s) => ({ ...s, expiresAt: e.target.value }))} />
          <button className="text-sm text-brand hover:text-brand-dark" disabled={pending} onClick={addDoc}>+ Dokument</button>
          <input type="file" className="text-xs" disabled={pending}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) { const fd = new FormData(); fd.set('file', f); fd.set('productId', product.id); fd.set('type', nd.type || 'Dokument'); fd.set('expiresAt', nd.expiresAt); onPickDoc(fd); } }} />
        </div>
      </div>
    </div>
  );
}
