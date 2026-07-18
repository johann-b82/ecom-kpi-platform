'use server';
import { revalidatePath } from 'next/cache';
import { requireAppAccess } from '@/lib/groups';
import {
  adjustStock, createDraftPurchaseOrder, markPurchaseOrderOrdered, receiveGoods, cancelPurchaseOrder,
} from '@/verfuegbarkeit/repository';
import type { AdjustmentReason, PurchaseOrderInput, GoodsReceipt } from '@/verfuegbarkeit/types';

export async function adjustStockAction(
  variantId: string, warehouseId: string, delta: number, reason: AdjustmentReason, note?: string,
): Promise<void> {
  await requireAppAccess('verfuegbarkeit', 'edit');
  await adjustStock(variantId, warehouseId, delta, reason, note ?? null);
  revalidatePath('/verfuegbarkeit');
  revalidatePath(`/verfuegbarkeit/${variantId}`);
  revalidatePath('/verfuegbarkeit/meldebestand'); // Korrektur kann Meldebestand-Schwelle überschreiten
}

export async function createDraftPurchaseOrderAction(input: PurchaseOrderInput): Promise<string> {
  await requireAppAccess('verfuegbarkeit', 'edit');
  const id = await createDraftPurchaseOrder(input);
  revalidatePath('/verfuegbarkeit/wareneingang');
  revalidatePath('/verfuegbarkeit/meldebestand');
  return id;
}

export async function markPurchaseOrderOrderedAction(poId: string): Promise<void> {
  await requireAppAccess('verfuegbarkeit', 'edit');
  await markPurchaseOrderOrdered(poId);
  revalidatePath('/verfuegbarkeit/wareneingang');
  revalidatePath(`/verfuegbarkeit/wareneingang/${poId}`);
}

export async function receiveGoodsAction(poId: string, receipts: GoodsReceipt[]): Promise<void> {
  await requireAppAccess('verfuegbarkeit', 'edit');
  await receiveGoods(poId, receipts);
  revalidatePath('/verfuegbarkeit');
  revalidatePath('/verfuegbarkeit/wareneingang');
  revalidatePath(`/verfuegbarkeit/wareneingang/${poId}`);
}

export async function cancelPurchaseOrderAction(poId: string): Promise<void> {
  await requireAppAccess('verfuegbarkeit', 'edit');
  await cancelPurchaseOrder(poId);
  revalidatePath('/verfuegbarkeit/wareneingang');
  revalidatePath(`/verfuegbarkeit/wareneingang/${poId}`);
}
