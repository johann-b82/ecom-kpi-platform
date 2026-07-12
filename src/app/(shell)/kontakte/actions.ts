'use server';
import { revalidatePath } from 'next/cache';
import { requireAppAccess } from '@/lib/groups';
import { checkVatId, type ViesResult } from '@/lib/vies';
import {
  createContact, updateContact, upsertAddress, deleteAddress, upsertPerson, deletePerson,
} from '@/kontakte/repository';
import type { Contact, ContactAddress, ContactInput, ContactPerson } from '@/kontakte/types';

export async function createContactAction(input: ContactInput): Promise<Contact> {
  await requireAppAccess('kontakte', 'edit');
  const c = await createContact(input);
  revalidatePath('/kontakte');
  return c;
}

export async function updateContactAction(id: string, input: ContactInput): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await updateContact(id, input);
  revalidatePath('/kontakte');
  revalidatePath(`/kontakte/${id}`);
}

export async function saveAddressAction(a: Omit<ContactAddress, 'id'> & { id?: string }): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await upsertAddress(a);
  revalidatePath(`/kontakte/${a.contactId}`);
}
export async function removeAddressAction(id: string, contactId: string): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await deleteAddress(id);
  revalidatePath(`/kontakte/${contactId}`);
}

export async function savePersonAction(p: Omit<ContactPerson, 'id'> & { id?: string }): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await upsertPerson(p);
  revalidatePath(`/kontakte/${p.contactId}`);
}
export async function removePersonAction(id: string, contactId: string): Promise<void> {
  await requireAppAccess('kontakte', 'edit');
  await deletePerson(id);
  revalidatePath(`/kontakte/${contactId}`);
}

export async function checkVatAction(vatId: string): Promise<ViesResult> {
  await requireAppAccess('kontakte', 'view');
  return checkVatId(vatId);
}
