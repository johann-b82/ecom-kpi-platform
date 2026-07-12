import { pool } from '../src/lib/db';
import { PRICE_LISTS, CONTACTS, CONNECTIONS } from '../src/kontakte/seed-data';

export async function seedKontakte(): Promise<void> {
  for (const pl of PRICE_LISTS) {
    await pool.query(
      `INSERT INTO price_lists (id, name, currency, is_default) VALUES ($1,$2,$3,$4)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name, currency=excluded.currency, is_default=excluded.is_default`,
      [pl.id, pl.name, pl.currency, pl.isDefault]);
  }
  for (const c of CONTACTS) {
    await pool.query(
      `INSERT INTO contacts (id, number, name, legal_form, is_customer, is_supplier, vat_id, tax_country,
         payment_terms, price_list_id, currency, language, status, notes)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO UPDATE SET name=excluded.name, is_customer=excluded.is_customer,
         is_supplier=excluded.is_supplier, payment_terms=excluded.payment_terms`,
      [c.id, c.number, c.name, c.legalForm, c.isCustomer, c.isSupplier, c.vatId, c.taxCountry,
       c.paymentTerms, c.priceListId, c.currency, c.language, c.status, c.notes]);
  }
  for (const cn of CONNECTIONS) {
    await pool.query(
      `INSERT INTO integration_connections (id, app, provider, label, status, last_synced_at)
       VALUES ($1,$2,$3,$4,$5,$6::timestamptz)
       ON CONFLICT (id) DO UPDATE SET status=excluded.status, last_synced_at=excluded.last_synced_at, label=excluded.label`,
      [cn.id, cn.app, cn.provider, cn.label, cn.status, cn.lastSyncedAt]);
  }
  console.log('Kontakte seed applied.');
}

if (process.argv[1] && process.argv[1].endsWith('seed-kontakte.ts')) {
  seedKontakte().then(() => pool.end()).catch((err) => { console.error(err); process.exit(1); });
}
