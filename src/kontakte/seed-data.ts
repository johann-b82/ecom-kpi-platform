// DoD seed for Kontakte: price lists Handel/Endkunde/Key Account and a contact
// set covering Kunden, a nur-Lieferant (Guangzhou, USD, no vat_id) and ≥1
// Kunde+Lieferant. Stable UUIDs so the Katalog seed can reference price lists.

export interface SeedPriceList {
  id: string; name: string; currency: string; isDefault: boolean;
}
export interface SeedContact {
  id: string; number: string; name: string; legalForm: string | null;
  isCustomer: boolean; isSupplier: boolean; vatId: string | null; taxCountry: string | null;
  paymentTerms: number; priceListId: string | null; currency: string; language: string;
  status: 'aktiv' | 'inaktiv'; notes: string | null;
}

const PL_HANDEL = 'a1a1a1a1-0000-4000-8000-000000000001';
const PL_ENDKUNDE = 'a1a1a1a1-0000-4000-8000-000000000002';
const PL_KEY_ACCOUNT = 'a1a1a1a1-0000-4000-8000-000000000003';

export const PRICE_LISTS: SeedPriceList[] = [
  { id: PL_HANDEL, name: 'Handel', currency: 'EUR', isDefault: true },
  { id: PL_ENDKUNDE, name: 'Endkunde', currency: 'EUR', isDefault: false },
  { id: PL_KEY_ACCOUNT, name: 'Key Account', currency: 'EUR', isDefault: false },
];

export const CONTACTS: SeedContact[] = [
  {
    id: 'c1c1c1c1-0000-4000-8000-000000000001', number: 'K-0001',
    name: 'Spielwaren Müller GmbH', legalForm: 'GmbH',
    isCustomer: true, isSupplier: false, vatId: 'DE811907980', taxCountry: 'DE',
    paymentTerms: 21, priceListId: PL_HANDEL, currency: 'EUR', language: 'de',
    status: 'aktiv', notes: null,
  },
  {
    id: 'c1c1c1c1-0000-4000-8000-000000000002', number: 'K-0002',
    name: 'ToyWorld GmbH', legalForm: 'GmbH',
    isCustomer: true, isSupplier: false, vatId: 'DE129273398', taxCountry: 'DE',
    paymentTerms: 14, priceListId: PL_ENDKUNDE, currency: 'EUR', language: 'de',
    status: 'aktiv', notes: null,
  },
  {
    id: 'c1c1c1c1-0000-4000-8000-000000000003', number: 'K-0003',
    name: 'Kinderparadies eG', legalForm: 'eG',
    isCustomer: true, isSupplier: false, vatId: null, taxCountry: 'DE',
    paymentTerms: 30, priceListId: PL_HANDEL, currency: 'EUR', language: 'de',
    status: 'aktiv', notes: null,
  },
  {
    id: 'c1c1c1c1-0000-4000-8000-000000000004', number: 'K-0004',
    name: 'Spielzeugmarkt Nord', legalForm: 'e.K.',
    isCustomer: true, isSupplier: false, vatId: null, taxCountry: 'DE',
    paymentTerms: 14, priceListId: PL_KEY_ACCOUNT, currency: 'EUR', language: 'de',
    status: 'aktiv', notes: null,
  },
  {
    id: 'c1c1c1c1-0000-4000-8000-000000000005', number: 'K-0005',
    name: 'Guangzhou ToyCraft Ltd.', legalForm: 'Ltd.',
    isCustomer: false, isSupplier: true, vatId: null, taxCountry: 'CN',
    paymentTerms: 30, priceListId: null, currency: 'USD', language: 'en',
    status: 'aktiv', notes: 'Fernost-Lieferant, Zahlung per T/T.',
  },
  {
    id: 'c1c1c1c1-0000-4000-8000-000000000006', number: 'K-0006',
    name: 'Nordheim Spiel & Vertrieb GmbH', legalForm: 'GmbH',
    isCustomer: true, isSupplier: true, vatId: 'DE245618927', taxCountry: 'DE',
    paymentTerms: 14, priceListId: PL_HANDEL, currency: 'EUR', language: 'de',
    status: 'aktiv', notes: 'Kunde und Lieferant (Streckengeschäft).',
  },
];
