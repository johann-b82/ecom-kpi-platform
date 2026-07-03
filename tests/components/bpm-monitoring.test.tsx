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

import { BpmMonitoring } from '@/components/BpmMonitoring';

afterEach(cleanup);

it('rendert Preisverlauf eigener vs. Wettbewerb', () => {
  const points = [
    { productId: 'p1', competitor: 'X', date: '2026-05-01', ownPrice: 10, compPrice: 12 },
    { productId: 'p1', competitor: 'X', date: '2026-05-02', ownPrice: 11, compPrice: 12 },
  ];
  const { container } = render(<BpmMonitoring points={points as any} alerts={[]} />);
  expect(screen.getByText(/Preisverlauf: eigener vs\. Wettbewerb/)).toBeTruthy();
  expect(container.querySelector('svg')).toBeTruthy();
});
