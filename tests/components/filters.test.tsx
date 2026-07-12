import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
});
