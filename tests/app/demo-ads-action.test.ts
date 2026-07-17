import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) } }),
}));
vi.mock('@/lib/groups', () => ({ getUserAccess: vi.fn() }));
vi.mock('@/lib/demo-ads', () => ({ enableDemoAds: vi.fn(), disableDemoAds: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { toggleDemoAdsAction } from '@/app/setup/actions';
import { getUserAccess } from '@/lib/groups';
import { enableDemoAds, disableDemoAds } from '@/lib/demo-ads';
import { revalidatePath } from 'next/cache';

beforeEach(() => { vi.clearAllMocks(); });

describe('toggleDemoAdsAction (admin)', () => {
  it('Admin: enabled=true ruft enableDemoAds + revalidiert', async () => {
    vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: true });
    await toggleDemoAdsAction(true);
    expect(enableDemoAds).toHaveBeenCalled();
    expect(disableDemoAds).not.toHaveBeenCalled();
    expect(revalidatePath).toHaveBeenCalledWith('/setup');
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf/dashboard');
  });
  it('Admin: enabled=false ruft disableDemoAds', async () => {
    vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: true });
    await toggleDemoAdsAction(false);
    expect(disableDemoAds).toHaveBeenCalled();
    expect(enableDemoAds).not.toHaveBeenCalled();
  });
  it('Nicht-Admin: wirft und ruft nichts', async () => {
    vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: false });
    await expect(toggleDemoAdsAction(true)).rejects.toThrow(/Administrator/i);
    expect(enableDemoAds).not.toHaveBeenCalled();
  });
});
