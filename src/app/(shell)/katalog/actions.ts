'use server';
import { revalidatePath } from 'next/cache';
import { requireAppAccess } from '@/lib/groups';
import { uploadFile } from '@/lib/storage';
import {
  createProduct, updateProduct, setLifecycleStatus, setProductImage,
  upsertVariant, deleteVariant, upsertPrice, deletePrice, addDocument, deleteDocument,
} from '@/katalog/repository';
import type { LifecycleStatus } from '@/katalog/lifecycle';
import type { Price, Product, ProductDocument, ProductInput, VariantInput } from '@/katalog/types';

export async function createProductAction(input: ProductInput): Promise<Product> {
  await requireAppAccess('katalog', 'edit');
  const p = await createProduct(input);
  revalidatePath('/katalog');
  return p;
}

export async function updateProductAction(id: string, input: ProductInput): Promise<void> {
  await requireAppAccess('katalog', 'edit');
  await updateProduct(id, input);
  revalidatePath('/katalog');
  revalidatePath(`/katalog/${id}`);
}

export async function changeLifecycleAction(id: string, status: LifecycleStatus): Promise<void> {
  await requireAppAccess('katalog', 'edit');
  await setLifecycleStatus(id, status);
  revalidatePath(`/katalog/${id}`);
}

export async function saveVariantAction(v: VariantInput & { id?: string }): Promise<void> {
  await requireAppAccess('katalog', 'edit');
  await upsertVariant(v);
  revalidatePath(`/katalog/${v.productId}`);
}
export async function removeVariantAction(id: string, productId: string): Promise<void> {
  await requireAppAccess('katalog', 'edit');
  await deleteVariant(id);
  revalidatePath(`/katalog/${productId}`);
}

export async function savePriceAction(p: Omit<Price, 'id'> & { id?: string }, productId: string): Promise<void> {
  await requireAppAccess('katalog', 'edit');
  await upsertPrice(p);
  revalidatePath(`/katalog/${productId}`);
}
export async function removePriceAction(id: string, productId: string): Promise<void> {
  await requireAppAccess('katalog', 'edit');
  await deletePrice(id);
  revalidatePath(`/katalog/${productId}`);
}

export async function addDocumentAction(d: Omit<ProductDocument, 'id' | 'uploadedAt'>): Promise<void> {
  await requireAppAccess('katalog', 'edit');
  await addDocument(d);
  revalidatePath(`/katalog/${d.productId}`);
}
export async function removeDocumentAction(id: string, productId: string): Promise<void> {
  await requireAppAccess('katalog', 'edit');
  await deleteDocument(id);
  revalidatePath(`/katalog/${productId}`);
}

export async function uploadProductImageAction(id: string, formData: FormData): Promise<{ url: string | null }> {
  await requireAppAccess('katalog', 'edit');
  const file = formData.get('file') as File | null;
  const url = file ? await uploadFile(`products/${id}/${file.name}`, file) : null;
  if (url) { await setProductImage(id, url); revalidatePath(`/katalog/${id}`); }
  return { url };
}

export async function uploadDocumentFileAction(formData: FormData): Promise<{ url: string | null }> {
  await requireAppAccess('katalog', 'edit');
  const productId = String(formData.get('productId') ?? '');
  const type = String(formData.get('type') ?? 'Dokument');
  const expiresAt = (formData.get('expiresAt') as string) || null;
  const file = formData.get('file') as File | null;
  const url = file ? await uploadFile(`documents/${productId}/${file.name}`, file) : null;
  if (url) {
    await addDocument({ productId, type, fileUrl: url, expiresAt });
    revalidatePath(`/katalog/${productId}`);
  }
  return { url };
}
