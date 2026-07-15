import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({ auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } } })) } }),
}));
vi.mock('@/lib/groups', () => ({ getUserAccess: vi.fn() }));
vi.mock('@/lib/integrations', () => ({ simulateConnect: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { simulateConnectAction } from '@/app/setup/actions';
import { getUserAccess } from '@/lib/groups';
import { simulateConnect } from '@/lib/integrations';
import { revalidatePath } from 'next/cache';

beforeEach(() => { vi.clearAllMocks(); });

describe('setup simulateConnectAction (admin)', () => {
  it('verbindet + revalidiert /setup für Admin', async () => {
    vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: true });
    await simulateConnectAction('x1');
    expect(simulateConnect).toHaveBeenCalledWith('x1');
    expect(revalidatePath).toHaveBeenCalledWith('/setup');
  });
  it('wirft für Nicht-Admin und verbindet nicht', async () => {
    vi.mocked(getUserAccess).mockResolvedValue({ apps: {}, isAdmin: false });
    await expect(simulateConnectAction('x1')).rejects.toThrow(/Administrator/i);
    expect(simulateConnect).not.toHaveBeenCalled();
  });
});
