import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/groups', () => ({ requireAppAccess: vi.fn() }));
vi.mock('@/kontakte/repository', () => ({
  createContact: vi.fn(async () => ({ id: 'c1' })),
  updateContact: vi.fn(), upsertAddress: vi.fn(), deleteAddress: vi.fn(),
  upsertPerson: vi.fn(), deletePerson: vi.fn(),
}));
vi.mock('@/lib/vies', () => ({ checkVatId: vi.fn(async () => ({ valid: true, name: 'X' })) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

import { createContactAction, checkVatAction } from '@/app/(shell)/kontakte/actions';
import { requireAppAccess } from '@/lib/groups';
import { createContact } from '@/kontakte/repository';
import { revalidatePath } from 'next/cache';

beforeEach(() => vi.clearAllMocks());

describe('kontakte actions', () => {
  it('createContactAction gates on edit, writes, revalidates', async () => {
    vi.mocked(requireAppAccess).mockResolvedValue(undefined);
    const input = { name: 'Neu', isCustomer: true, isSupplier: false,
      paymentTerms: 14, currency: 'EUR', language: 'de', status: 'aktiv' as const };
    const r = await createContactAction(input);
    expect(requireAppAccess).toHaveBeenCalledWith('kontakte', 'edit');
    expect(createContact).toHaveBeenCalledWith(input);
    expect(revalidatePath).toHaveBeenCalledWith('/kontakte');
    expect(r).toEqual({ id: 'c1' });
  });

  it('checkVatAction gates on view and returns the VIES result', async () => {
    vi.mocked(requireAppAccess).mockResolvedValue(undefined);
    expect(await checkVatAction('DE811907980')).toEqual({ valid: true, name: 'X' });
    expect(requireAppAccess).toHaveBeenCalledWith('kontakte', 'view');
  });
});
