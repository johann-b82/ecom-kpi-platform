import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/brickpm/repository', () => ({ setNotificationStatus: vi.fn(), simulateIntegration: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { changeNotificationStatus, simulateSync } from '@/app/(shell)/brickpm/actions';
import { requireAppAccess } from '@/lib/groups';
import { createClient } from '@/lib/supabase/server';
import { setNotificationStatus, simulateIntegration } from '@/brickpm/repository';
import { revalidatePath } from 'next/cache';

function mockUser(email: string | null) {
  vi.mocked(createClient).mockReturnValue({
    auth: { getUser: async () => ({ data: { user: email ? { email } : null } }) },
  } as never);
}

beforeEach(() => {
  vi.mocked(requireAppAccess).mockReset();
  vi.mocked(setNotificationStatus).mockReset();
  vi.mocked(simulateIntegration).mockReset();
  vi.mocked(revalidatePath).mockReset();
});

describe('changeNotificationStatus', () => {
  it('view-only user: rejects and does not write', async () => {
    vi.mocked(requireAppAccess).mockRejectedValue(new Error('Kein Zugriff auf brickpm.'));
    mockUser('viewer@x.de');
    await expect(changeNotificationStatus('N001', 'in Prüfung')).rejects.toThrow(/Kein Zugriff/);
    expect(setNotificationStatus).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('edit user: writes with actor email and revalidates', async () => {
    vi.mocked(requireAppAccess).mockResolvedValue(undefined);
    mockUser('editor@x.de');
    await changeNotificationStatus('N001', 'in Prüfung');
    expect(requireAppAccess).toHaveBeenCalledWith('brickpm', 'edit');
    expect(setNotificationStatus).toHaveBeenCalledWith('N001', 'in Prüfung', 'editor@x.de');
    expect(revalidatePath).toHaveBeenCalledWith('/brickpm/notifications');
  });
});

describe('simulateSync', () => {
  it('view-only user: rejects and does not write', async () => {
    vi.mocked(requireAppAccess).mockRejectedValue(new Error('Kein Zugriff auf brickpm.'));
    mockUser('viewer@x.de');
    await expect(simulateSync('I001')).rejects.toThrow(/Kein Zugriff/);
    expect(simulateIntegration).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('edit user: writes with actor email and revalidates', async () => {
    vi.mocked(requireAppAccess).mockResolvedValue(undefined);
    mockUser('editor@x.de');
    await simulateSync('I001');
    expect(requireAppAccess).toHaveBeenCalledWith('brickpm', 'edit');
    expect(simulateIntegration).toHaveBeenCalledWith('I001', 'editor@x.de');
    expect(revalidatePath).toHaveBeenCalledWith('/brickpm/schnittstellen');
  });
});
