import { describe, it, expect, afterAll } from 'vitest';
import { pool } from '@/lib/db';
import { createContact, getContact, listContacts, updateContact } from '@/kontakte/repository';

const ids: string[] = [];
afterAll(async () => {
  for (const id of ids) await pool.query('DELETE FROM contacts WHERE id = $1', [id]);
});

describe('kontakte repository', () => {
  it('creates a contact with an auto K-#### number and reads it back camelCased', async () => {
    const c = await createContact({
      name: 'Testkontakt', isCustomer: true, isSupplier: false,
      paymentTerms: 21, currency: 'EUR', language: 'de', status: 'aktiv',
    });
    ids.push(c.id);
    expect(c.number).toMatch(/^K-\d{4}$/);
    expect(c.isCustomer).toBe(true);
    const back = await getContact(c.id);
    expect(back?.name).toBe('Testkontakt');
    expect(back?.addresses).toEqual([]);
  });

  it('updates mutable fields', async () => {
    const c = await createContact({
      name: 'Vorher', isCustomer: false, isSupplier: true,
      paymentTerms: 14, currency: 'EUR', language: 'de', status: 'aktiv',
    });
    ids.push(c.id);
    await updateContact(c.id, {
      name: 'Nachher', isCustomer: false, isSupplier: true,
      paymentTerms: 30, currency: 'EUR', language: 'de', status: 'inaktiv',
    });
    const back = await getContact(c.id);
    expect(back?.name).toBe('Nachher');
    expect(back?.status).toBe('inaktiv');
    expect(back?.paymentTerms).toBe(30);
  });

  it('lists contacts', async () => {
    expect((await listContacts()).length).toBeGreaterThan(0);
  });
});
