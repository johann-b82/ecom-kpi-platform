'use server';
import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { getUserAccess } from '@/lib/groups';
import { enableDemoAds, disableDemoAds } from '@/lib/demo-ads';

export async function toggleDemoAdsAction(enabled: boolean): Promise<void> {
  const { data: { user } } = await createClient().auth.getUser();
  const access = user ? await getUserAccess(user.id) : { apps: {}, isAdmin: false };
  if (!access.isAdmin) throw new Error('Nur für Administratoren.');
  if (enabled) await enableDemoAds(); else await disableDemoAds();
  revalidatePath('/setup');
  revalidatePath('/verkauf/dashboard');
}
