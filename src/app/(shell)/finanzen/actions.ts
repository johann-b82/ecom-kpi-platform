'use server';
import { revalidatePath } from 'next/cache';
import { requireAppAccess } from '@/lib/groups';
import {
  recordPayment, assignPayment, recordUnassignedPayment, createKreditorInvoice, getOpenItem,
} from '@/finanzen/repository';
import type { PaymentInput, KreditorInvoiceInput } from '@/finanzen/types';

// Wenn ein Debitor-OP mit Beleg betroffen ist, hat sich der Faden geändert → Verkauf revalidieren.
async function revalidateAffected(openItemId: string): Promise<void> {
  const item = await getOpenItem(openItemId);
  if (item?.orderId) {
    revalidatePath('/verkauf');
    revalidatePath(`/verkauf/belege/${item.orderId}`);
  }
}

export async function recordPaymentAction(openItemId: string, input: PaymentInput): Promise<void> {
  await requireAppAccess('finanzen', 'edit');
  await recordPayment(openItemId, input);
  revalidatePath('/finanzen');
  revalidatePath(`/finanzen/${openItemId}`);
  await revalidateAffected(openItemId);
}

export async function assignPaymentAction(paymentId: string, openItemId: string): Promise<void> {
  await requireAppAccess('finanzen', 'edit');
  await assignPayment(paymentId, openItemId);
  revalidatePath('/finanzen');
  revalidatePath('/finanzen/warteschlange');
  revalidatePath(`/finanzen/${openItemId}`);
  await revalidateAffected(openItemId);
}

export async function recordUnassignedPaymentAction(input: PaymentInput): Promise<void> {
  await requireAppAccess('finanzen', 'edit');
  await recordUnassignedPayment(input);
  revalidatePath('/finanzen/warteschlange');
}

export async function createKreditorInvoiceAction(input: KreditorInvoiceInput): Promise<string> {
  await requireAppAccess('finanzen', 'edit');
  const id = await createKreditorInvoice(input);
  revalidatePath('/finanzen');
  return id;
}
