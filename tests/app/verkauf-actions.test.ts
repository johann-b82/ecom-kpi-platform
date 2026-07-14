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
import { createOrder, transitionOrderStatus, createReturn } from '@/verkauf/repository';
import { createOrderAction, transitionOrderStatusAction, createReturnAction } from '@/app/(shell)/verkauf/actions';

beforeEach(() => { vi.clearAllMocks(); });

describe('verkauf actions', () => {
  it('createOrderAction gated auf verkauf/edit, delegiert, revalidiert', async () => {
    const input = { contactId: 'k1', channel: 'manuell' as const, lines: [] };
    await createOrderAction(input);
    expect(requireAppAccess).toHaveBeenCalledWith('verkauf', 'edit');
    expect(createOrder).toHaveBeenCalledWith(input);
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf');
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf/belege');
  });

  it('transitionOrderStatusAction revalidiert Liste und Detail', async () => {
    await transitionOrderStatusAction('o1', 'versendet');
    expect(requireAppAccess).toHaveBeenCalledWith('verkauf', 'edit');
    expect(transitionOrderStatus).toHaveBeenCalledWith('o1', 'versendet');
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf');
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf/belege');
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf/belege/o1');
  });

  it('createReturnAction gated auf verkauf/edit, delegiert, revalidiert', async () => {
    await createReturnAction('o1');
    expect(requireAppAccess).toHaveBeenCalledWith('verkauf', 'edit');
    expect(createReturn).toHaveBeenCalledWith('o1');
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf');
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf/belege');
    expect(revalidatePath).toHaveBeenCalledWith('/verkauf/belege/o1');
  });
});
