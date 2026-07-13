import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/verkauf/repository', () => ({
  createOrder: vi.fn(async () => ({ id: 'o1' })),
  transitionOrderStatus: vi.fn(async () => ({ id: 'o1', status: 'versendet' })),
  createReturn: vi.fn(async () => ({ id: 'c1' })),
}));

import { requireAppAccess } from '@/lib/groups';
import { revalidatePath } from 'next/cache';
import { createOrder, transitionOrderStatus } from '@/verkauf/repository';
import { createOrderAction, transitionOrderStatusAction } from '@/app/(shell)/verkauf/actions';

beforeEach(() => vi.clearAllMocks());

describe('verkauf actions', () => {
  it('createOrderAction gated auf verkauf/edit, delegiert, revalidiert', async () => {
    await createOrderAction({ contactId: 'k1', channel: 'manuell', lines: [] });
    expect(requireAppAccess).toHaveBeenCalledWith('verkauf', 'edit');
    expect(createOrder).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf');
  });

  it('transitionOrderStatusAction revalidiert Liste und Detail', async () => {
    await transitionOrderStatusAction('o1', 'versendet');
    expect(requireAppAccess).toHaveBeenCalledWith('verkauf', 'edit');
    expect(transitionOrderStatus).toHaveBeenCalledWith('o1', 'versendet');
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf/o1');
  });
});
