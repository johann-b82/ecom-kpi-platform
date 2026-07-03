import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('recharts', async (orig) => {
  const React = await import('react');
  const m = await orig<typeof import('recharts')>();
  return {
    ...m,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 800, height: 400 }),
  };
});

import { BpmPriceHistory } from '@/components/BpmPriceHistory';

afterEach(cleanup);

it('rendert Preis/Kosten- und Marge-Charts', () => {
  const products = [{ id: 'p1', name: 'Prod 1' } as any];
  const history = [
    { productId: 'p1', date: '2026-05-01', price: 100, cost: 60 },
    { productId: 'p1', date: '2026-05-02', price: 110, cost: 60 },
  ];
  const { container } = render(<BpmPriceHistory products={products} history={history as any} />);
  expect(screen.getByText(/Preis & Kosten/)).toBeTruthy();
  expect(screen.getByText(/Marge-Verlauf/)).toBeTruthy();
  expect(container.querySelectorAll('svg').length).toBeGreaterThanOrEqual(2);
});
