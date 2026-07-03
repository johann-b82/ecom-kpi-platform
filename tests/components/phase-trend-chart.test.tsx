import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

// Recharts' ResponsiveContainer measures its parent (0×0 in jsdom → nothing draws).
// Replace it with one that injects a fixed size into the chart so it renders.
vi.mock('recharts', async (orig) => {
  const React = await import('react');
  const m = await orig<typeof import('recharts')>();
  return {
    ...m,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 800, height: 400 }),
  };
});

import { PhaseTrendChart } from '@/components/PhaseTrendChart';

afterEach(cleanup);

describe('PhaseTrendChart', () => {
  it('rendert Titel + eine SVG-Fläche ohne Fehler', () => {
    const series = [{ date: '2026-05-01', value: 10 }, { date: '2026-05-02', value: 12 }];
    const { container } = render(<PhaseTrendChart series={series} metric="Sitzungen" />);
    expect(screen.getByText(/Verlauf: Sitzungen \(30 Tage\)/)).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy();
  });
});
