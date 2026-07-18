import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('@/katalog/repository', () => ({
  createProduct: vi.fn(async () => ({ id: 'p1' })), updateProduct: vi.fn(),
  setLifecycleStatus: vi.fn(), setProductImage: vi.fn(),
  upsertVariant: vi.fn(), deleteVariant: vi.fn(), upsertPrice: vi.fn(), deletePrice: vi.fn(),
  addDocument: vi.fn(), deleteDocument: vi.fn(),
}));
vi.mock('@/lib/storage', () => ({ uploadFile: vi.fn(async () => 'https://s/x.png') }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { changeLifecycleAction } from '@/app/(shell)/katalog/actions';
import { requireAppAccess } from '@/lib/groups';
import { setLifecycleStatus } from '@/katalog/repository';
import { revalidatePath } from 'next/cache';

beforeEach(() => { vi.clearAllMocks(); });

describe('katalog actions', () => {
  it('changeLifecycleAction gates, writes, revalidates detail', async () => {
    vi.mocked(requireAppAccess).mockResolvedValue(undefined);
    await changeLifecycleAction('p1', 'aktiv');
    expect(requireAppAccess).toHaveBeenCalledWith('katalog', 'edit');
    expect(setLifecycleStatus).toHaveBeenCalledWith('p1', 'aktiv');
    expect(revalidatePath).toHaveBeenCalledWith('/katalog/p1');
  });
});
