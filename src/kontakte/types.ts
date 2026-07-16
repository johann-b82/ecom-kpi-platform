import type { Sort } from '@/lib/sort';

export type ContactSegment = 'geschaeft' | 'privat';

// Sortierbare Spalten der Kontakte-Liste (client- und server-seitig geteilt).
export const CONTACT_SORT = {
  allowed: ['number', 'name', 'segment', 'city', 'status'] as const,
  fallback: { col: 'name', dir: 'asc' } as Sort,
};

export interface Contact {
  id: string; tenantId: string | null; number: string; name: string;
  legalForm: string | null; isCustomer: boolean; isSupplier: boolean;
  segment: ContactSegment;
  vatId: string | null; taxCountry: string | null; paymentTerms: number;
  priceListId: string | null; currency: string; language: string;
  status: 'aktiv' | 'inaktiv'; notes: string | null; createdAt: string;
}

// server-seitige Kontakt-Zeile inkl. Ort (für Liste mit Suche/Filter/Sort)
export interface ContactRow {
  id: string; number: string; name: string;
  isCustomer: boolean; isSupplier: boolean; segment: ContactSegment;
  city: string | null; status: 'aktiv' | 'inaktiv';
}
export interface ContactAddress {
  id: string; contactId: string; type: 'rechnung' | 'lieferung';
  street: string | null; zip: string | null; city: string | null;
  country: string | null; isDefault: boolean;
}
export interface ContactPerson {
  id: string; contactId: string; name: string;
  email: string | null; phone: string | null; role: string | null;
}
export interface ContactDetail extends Contact {
  addresses: ContactAddress[]; persons: ContactPerson[];
}
export interface ContactInput {
  name: string; legalForm?: string | null; isCustomer: boolean; isSupplier: boolean;
  vatId?: string | null; taxCountry?: string | null; paymentTerms: number;
  priceListId?: string | null; currency: string; language: string;
  status: 'aktiv' | 'inaktiv'; notes?: string | null;
}
