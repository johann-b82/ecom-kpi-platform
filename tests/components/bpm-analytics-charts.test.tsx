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

import { BpmAnalyticsCharts } from '@/components/BpmAnalyticsCharts';

afterEach(cleanup);

it('rendert 3 Balken-Charts + 1 Donut', () => {
  const nv = [{ name: 'A', value: 10 }, { name: 'B', value: 20 }];
  const { container } = render(<BpmAnalyticsCharts revenue={nv} marge={nv} sell={nv} status={nv} />);
  expect(screen.getByText(/Produkt-Status/)).toBeTruthy();
  expect(screen.getByText(/Aktions-Zielumsatz nach Kategorie/)).toBeTruthy();
  expect(container.querySelectorAll('svg').length).toBe(4);
});
