// Demo-Connectoren (Stubs) für die neuen Module. Kontakte/Katalog seeden ihre
// eigenen Verbindungen weiterhin selbst. Stabile UUIDs 44444444-…
export interface SeedConnection {
  id: string; app: string; provider: string; label: string; status: string;
}

export const CONNECTION_SEED: SeedConnection[] = [
  { id: '44444444-0000-4000-8000-000000000001', app: 'verkauf', provider: 'shopware', label: 'Shopware', status: 'verbunden (Demo)' },
  { id: '44444444-0000-4000-8000-000000000002', app: 'verkauf', provider: 'amazon', label: 'Amazon Marketplace', status: 'nicht verbunden' },
  { id: '44444444-0000-4000-8000-000000000003', app: 'verfuegbarkeit', provider: 'dhl', label: 'DHL Versand', status: 'nicht verbunden' },
  { id: '44444444-0000-4000-8000-000000000004', app: 'verfuegbarkeit', provider: 'edi', label: 'Lieferanten-EDI', status: 'nicht verbunden' },
  { id: '44444444-0000-4000-8000-000000000005', app: 'finanzen', provider: 'datev', label: 'DATEV', status: 'verbunden (Demo)' },
  { id: '44444444-0000-4000-8000-000000000006', app: 'finanzen', provider: 'fints', label: 'Bank (FinTS)', status: 'nicht verbunden' },
];
