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

import { BpmStockChart } from '@/components/BpmStockChart';

afterEach(cleanup);

it('rendert Bestand vs. Mindestbestand als Balken-Chart', () => {
  const data = [{ name: 'A', Bestand: 10, Mindestbestand: 5 }, { name: 'B', Bestand: 3, Mindestbestand: 6 }];
  const { container } = render(<BpmStockChart data={data} />);
  expect(screen.getByText(/Bestand vs\. Mindestbestand/)).toBeTruthy();
  expect(container.querySelector('svg')).toBeTruthy();
});
