'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { requireAppAccess } from '@/lib/groups';
import { setNotificationStatus, simulateIntegration } from '@/brickpm/repository';

async function actor(): Promise<string | null> {
  const { data: { user } } = await createClient().auth.getUser();
  return user?.email ?? null;
}

export async function changeNotificationStatus(id: string, status: string): Promise<void> {
  await requireAppAccess('brickpm', 'edit');
  await setNotificationStatus(id, status, await actor());
  revalidatePath('/brickpm/notifications');
}

export async function simulateSync(id: string): Promise<void> {
  await requireAppAccess('brickpm', 'edit');
  await simulateIntegration(id, await actor());
  revalidatePath('/brickpm/schnittstellen');
}
