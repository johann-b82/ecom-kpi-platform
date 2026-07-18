// DoD-Seed Finanzen: ein Kreditor-OP (offen) + eine nicht zugeordnete Zahlung
// (Warteschlange). Der offene Debitor-OP kommt aus dem Verkauf-Seed (b2b-rechnung
// bleibt bei rechnung_gestellt). Lieferant per Name (Lookup im Seed-Skript).

export interface SeedOpenItem {
  id: string; direction: 'kreditor'; supplierName: string;
  reference: string; amount: number; dueDate: string;
}
export interface SeedPayment {
  id: string; amount: number; method: 'ueberweisung' | 'lastschrift' | 'kreditkarte' | 'paypal' | 'sonstige';
  externalReference: string; paidAt: string;
}

export const KREDITOR_ITEMS: SeedOpenItem[] = [
  {
    id: '33333333-0000-4000-8000-000000000001',
    direction: 'kreditor', supplierName: 'Guangzhou ToyCraft Ltd.',
    reference: 'ER-2026-4711', amount: 840.00, dueDate: '2026-08-15',
  },
];

export const UNASSIGNED_PAYMENTS: SeedPayment[] = [
  {
    id: '33333333-0000-4000-8000-000000000101',
    amount: 68.50, method: 'ueberweisung', externalReference: 'SEPA-778', paidAt: '2026-07-14',
  },
];
