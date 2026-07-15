import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/finanzen/repository', () => ({
  recordPayment: vi.fn(),
  assignPayment: vi.fn(),
  recordUnassignedPayment: vi.fn(),
  createKreditorInvoice: vi.fn(async () => 'oi-1'),
  getOpenItem: vi.fn(async () => ({ orderId: null })),
}));

import {
  recordPaymentAction, assignPaymentAction, createKreditorInvoiceAction,
} from '@/app/(shell)/finanzen/actions';
import { requireAppAccess } from '@/lib/groups';
import * as repo from '@/finanzen/repository';

beforeEach(() => { vi.clearAllMocks(); });

describe('finanzen actions', () => {
  it('recordPaymentAction gated auf finanzen/edit und ruft Repo mit den Args', async () => {
    await recordPaymentAction('oi-1', { amount: 10, method: 'ueberweisung' });
    expect(requireAppAccess).toHaveBeenCalledWith('finanzen', 'edit');
    expect(repo.recordPayment).toHaveBeenCalledWith('oi-1', { amount: 10, method: 'ueberweisung' });
  });
  it('createKreditorInvoiceAction gibt die neue OP-Id zurück', async () => {
    const id = await createKreditorInvoiceAction({ supplierId: 's1', amount: 50, dueDate: '2026-09-01', reference: 'R1' });
    expect(id).toBe('oi-1');
    expect(requireAppAccess).toHaveBeenCalledWith('finanzen', 'edit');
  });
  it('assignPaymentAction reicht die Args durch', async () => {
    await assignPaymentAction('pay-1', 'oi-9');
    expect(repo.assignPayment).toHaveBeenCalledWith('pay-1', 'oi-9');
  });
});
