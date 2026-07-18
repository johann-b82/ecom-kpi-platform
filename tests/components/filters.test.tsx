import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

afterEach(cleanup);

const push = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams(''),
}));

describe('Filters', () => {
  it('navigates to the dashboard with the selected range, not the launchpad', async () => {
    const { Filters } = await import('@/components/Filters');
    render(<Filters />);
    fireEvent.click(screen.getByRole('button', { name: '7 Tage' }));
    expect(push).toHaveBeenCalledWith('/dashboard?days=7');
  });
  it('bietet Jahr und Komplett an', async () => {
    const { Filters } = await import('@/components/Filters');
    render(<Filters />);
    expect(screen.getByRole('button', { name: 'Jahr' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Komplett' }));
    expect(push).toHaveBeenCalledWith('/dashboard?days=all');
  });
});
