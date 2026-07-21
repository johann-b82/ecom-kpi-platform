import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { VerkaufDetail } from '@/components/VerkaufDetail';
import type { OrderView } from '@/verkauf/types';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock('@/app/(shell)/verkauf/actions', () => ({
  transitionOrderStatusAction: vi.fn(), createReturnAction: vi.fn(),
}));

afterEach(cleanup);

const baseOrder: OrderView = {
  id: 'o1', tenantId: null, number: 'A-2026-0001', contactId: 'c1',
  channel: 'shop', status: 'auftrag', priceListId: null, relatedOrderId: null,
  currency: 'EUR', placedAt: null, createdAt: '2026-01-01T00:00:00.000Z',
  totalNet: null, contactName: 'Spielwaren Müller GmbH',
  lines: [
    { id: 'l1', variantId: 'v1', sku: 'SJ-BLAU', productName: 'Sternenjäger', quantity: 2, unitPrice: 10 },
    { id: 'l2', variantId: 'v2', sku: 'BK-CLASSIC', productName: 'Bauklötze Classic', quantity: 1, unitPrice: 5 },
  ],
  events: [], costs: [], ekUnvollstaendig: false,
};

describe('VerkaufDetail — Gesamtsumme', () => {
  it('rechnet ohne gespeicherte Belegsumme aus den Positionen', () => {
    render(<VerkaufDetail order={baseOrder} />);
    expect(screen.getByText('25,00 €')).toBeTruthy();
  });

  it('zeigt die gespeicherte Netto-Belegsumme statt der Positionssumme', () => {
    render(<VerkaufDetail order={{ ...baseOrder, totalNet: 100 }} />);
    expect(screen.getByText('100,00 €')).toBeTruthy();
    expect(screen.queryByText('25,00 €')).toBeFalsy();
  });
});
