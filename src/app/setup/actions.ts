'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/groups';
import { simulateConnect } from '@/lib/integrations';

export async function simulateConnectAction(id: string): Promise<void> {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
  if (!access.isAdmin) throw new Error('Nur für Administratoren.');
  await simulateConnect(id);
  revalidatePath('/setup');
}
