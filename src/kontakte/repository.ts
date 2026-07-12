import { pool } from '@/lib/db';
import { nextContactNumber } from './number';
import type { Contact, ContactAddress, ContactDetail, ContactInput, ContactPerson } from './types';

const CONTACT_COLS = `id, tenant_id, number, name, legal_form, is_customer, is_supplier,
  vat_id, tax_country, payment_terms, price_list_id, currency, language, status, notes,
  created_at::text AS created_at`;

function mapContact(x: any): Contact {
  return {
    id: x.id, tenantId: x.tenant_id, number: x.number, name: x.name,
    legalForm: x.legal_form, isCustomer: x.is_customer, isSupplier: x.is_supplier,
    vatId: x.vat_id, taxCountry: x.tax_country, paymentTerms: x.payment_terms,
    priceListId: x.price_list_id, currency: x.currency, language: x.language,
    status: x.status, notes: x.notes, createdAt: x.created_at,
  };
}
function mapAddress(x: any): ContactAddress {
  return {
    id: x.id, contactId: x.contact_id, type: x.type, street: x.street,
    zip: x.zip, city: x.city, country: x.country, isDefault: x.is_default,
  };
}
function mapPerson(x: any): ContactPerson {
  return { id: x.id, contactId: x.contact_id, name: x.name, email: x.email, phone: x.phone, role: x.role };
}

export async function listContacts(): Promise<Contact[]> {
  const r = await pool.query(`SELECT ${CONTACT_COLS} FROM contacts ORDER BY number`);
  return r.rows.map(mapContact);
}

export async function getContact(id: string): Promise<ContactDetail | null> {
  const r = await pool.query(`SELECT ${CONTACT_COLS} FROM contacts WHERE id = $1`, [id]);
  if (r.rows.length === 0) return null;
  const contact = mapContact(r.rows[0]);
  const addr = await pool.query(
    `SELECT id, contact_id, type, street, zip, city, country, is_default
       FROM contact_addresses WHERE contact_id = $1 ORDER BY type`, [id]);
  const pers = await pool.query(
    `SELECT id, contact_id, name, email, phone, role
       FROM contact_persons WHERE contact_id = $1 ORDER BY name`, [id]);
  return { ...contact, addresses: addr.rows.map(mapAddress), persons: pers.rows.map(mapPerson) };
}

export async function createContact(input: ContactInput): Promise<Contact> {
  const existing = await pool.query<{ number: string }>('SELECT number FROM contacts');
  const number = nextContactNumber(existing.rows.map((x) => x.number));
  const r = await pool.query(
    `INSERT INTO contacts (number, name, legal_form, is_customer, is_supplier, vat_id, tax_country,
       payment_terms, price_list_id, currency, language, status, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     RETURNING ${CONTACT_COLS}`,
    [number, input.name, input.legalForm ?? null, input.isCustomer, input.isSupplier,
     input.vatId ?? null, input.taxCountry ?? null, input.paymentTerms, input.priceListId ?? null,
     input.currency, input.language, input.status, input.notes ?? null],
  );
  return mapContact(r.rows[0]);
}

export async function updateContact(id: string, input: ContactInput): Promise<void> {
  await pool.query(
    `UPDATE contacts SET name=$2, legal_form=$3, is_customer=$4, is_supplier=$5, vat_id=$6,
       tax_country=$7, payment_terms=$8, price_list_id=$9, currency=$10, language=$11,
       status=$12, notes=$13 WHERE id=$1`,
    [id, input.name, input.legalForm ?? null, input.isCustomer, input.isSupplier,
     input.vatId ?? null, input.taxCountry ?? null, input.paymentTerms, input.priceListId ?? null,
     input.currency, input.language, input.status, input.notes ?? null],
  );
}

export async function upsertAddress(a: Omit<ContactAddress, 'id'> & { id?: string }): Promise<void> {
  if (a.id) {
    await pool.query(
      `UPDATE contact_addresses SET type=$2, street=$3, zip=$4, city=$5, country=$6, is_default=$7 WHERE id=$1`,
      [a.id, a.type, a.street, a.zip, a.city, a.country, a.isDefault]);
  } else {
    await pool.query(
      `INSERT INTO contact_addresses (contact_id, type, street, zip, city, country, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [a.contactId, a.type, a.street, a.zip, a.city, a.country, a.isDefault]);
  }
}
export async function deleteAddress(id: string): Promise<void> {
  await pool.query('DELETE FROM contact_addresses WHERE id = $1', [id]);
}

export async function upsertPerson(p: Omit<ContactPerson, 'id'> & { id?: string }): Promise<void> {
  if (p.id) {
    await pool.query(
      `UPDATE contact_persons SET name=$2, email=$3, phone=$4, role=$5 WHERE id=$1`,
      [p.id, p.name, p.email, p.phone, p.role]);
  } else {
    await pool.query(
      `INSERT INTO contact_persons (contact_id, name, email, phone, role) VALUES ($1,$2,$3,$4,$5)`,
      [p.contactId, p.name, p.email, p.phone, p.role]);
  }
}
export async function deletePerson(id: string): Promise<void> {
  await pool.query('DELETE FROM contact_persons WHERE id = $1', [id]);
}
