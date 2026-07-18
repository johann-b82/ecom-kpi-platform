import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => '/kontakte',
  useSearchParams: () => new URLSearchParams('segment=geschaeft'),
}));

afterEach(() => { cleanup(); push.mockClear(); });

const rows = [
  { id: 'a', number: 'K-0001', name: 'Spielwaren Müller GmbH', isCustomer: true, isSupplier: false, segment: 'geschaeft', city: 'Köln', status: 'aktiv' },
  { id: 'b', number: 'K-0002', name: 'Guangzhou ToyCraft Ltd.', isCustomer: false, isSupplier: true, segment: 'geschaeft', city: 'Guangzhou', status: 'aktiv' },
];

async function renderList() {
  const { KontakteList } = await import('@/components/KontakteList');
  render(<KontakteList rows={rows as never} total={2} page={1} pageSize={50}
    search="" role="" segment="geschaeft" />);
}

describe('KontakteList (server-seitig)', () => {
  it('zeigt Zeilen mit Segment und Ort', async () => {
    await renderList();
    expect(screen.getByText('Spielwaren Müller GmbH')).toBeTruthy();
    expect(screen.getByText('Köln')).toBeTruthy();
    expect(screen.getAllByText('Geschäft').length).toBeGreaterThan(0);
  });

  it('Rolle-Filter ist als URL-Link verdrahtet (server-seitig)', async () => {
    await renderList();
    expect(screen.getByRole('link', { name: 'Lieferant' }).getAttribute('href')).toContain('role=lieferant');
  });

  it('Privat-Segment ist als Filter verlinkt', async () => {
    await renderList();
    expect(screen.getByRole('link', { name: 'Privat' }).getAttribute('href')).toContain('segment=privat');
  });

  it('Suche pusht die Query', async () => {
    await renderList();
    fireEvent.change(screen.getByPlaceholderText('Name oder Nummer …'), { target: { value: 'guang' } });
    fireEvent.keyDown(screen.getByPlaceholderText('Name oder Nummer …'), { key: 'Enter' });
    expect(push).toHaveBeenCalledWith(expect.stringContaining('q=guang'));
  });
});
