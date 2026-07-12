import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

afterEach(cleanup);

const rows = [
  { id: 'a', number: 'K-0001', name: 'Spielwaren Müller GmbH', isCustomer: true, isSupplier: false, status: 'aktiv' },
  { id: 'b', number: 'K-0002', name: 'Guangzhou ToyCraft Ltd.', isCustomer: false, isSupplier: true, status: 'aktiv' },
];

describe('KontakteList', () => {
  it('filters to suppliers only', async () => {
    const { KontakteList } = await import('@/components/KontakteList');
    render(<KontakteList contacts={rows as never} />);
    expect(screen.getByText('Spielwaren Müller GmbH')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lieferant' }));
    expect(screen.queryByText('Spielwaren Müller GmbH')).toBeNull();
    expect(screen.getByText('Guangzhou ToyCraft Ltd.')).toBeTruthy();
  });

  it('searches by name', async () => {
    const { KontakteList } = await import('@/components/KontakteList');
    render(<KontakteList contacts={rows as never} />);
    fireEvent.change(screen.getByPlaceholderText('Suchen …'), { target: { value: 'guang' } });
    expect(screen.queryByText('Spielwaren Müller GmbH')).toBeNull();
    expect(screen.getByText('Guangzhou ToyCraft Ltd.')).toBeTruthy();
  });
});
