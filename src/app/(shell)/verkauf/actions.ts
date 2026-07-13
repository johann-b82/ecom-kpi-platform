'use server';
import { revalidatePath } from 'next/cache';
import { requireAppAccess } from '@/lib/groups';
import { createOrder, transitionOrderStatus, createReturn } from '@/verkauf/repository';
import type { SalesOrderDetail, SalesOrderInput, OrderStatus } from '@/verkauf/types';

export async function createOrderAction(input: SalesOrderInput): Promise<SalesOrderDetail> {
  await requireAppAccess('verkauf', 'edit');
  const o = await createOrder(input);
  revalidatePath('/verkauf');
  return o;
}

export async function transitionOrderStatusAction(id: string, target: OrderStatus): Promise<SalesOrderDetail> {
  await requireAppAccess('verkauf', 'edit');
  const o = await transitionOrderStatus(id, target);
  revalidatePath('/verkauf');
  revalidatePath(`/verkauf/${id}`);
  return o;
}

export async function createReturnAction(originalOrderId: string): Promise<SalesOrderDetail> {
  await requireAppAccess('verkauf', 'edit');
  const credit = await createReturn(originalOrderId);
  revalidatePath('/verkauf');
  revalidatePath(`/verkauf/${originalOrderId}`);
  return credit;
}
