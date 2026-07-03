import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { KpiCard } from '@/components/KpiCard';
import type { Kpi } from '@/kpi/types';

afterEach(cleanup);

const base: Kpi = { key: 'sessions', label: 'Sitzungen', phase: 'see', value: 100, unit: 'number', available: true, deltaPct: null };

describe('KpiCard delta', () => {
  it('zeigt Pfeil + Betrag + „ggü. Vorperiode“ bei vorhandenem delta', () => {
    const { container } = render(<KpiCard kpi={{ ...base, deltaPct: 2 }} />);
    expect(screen.getByText(/ggü\. Vorperiode/)).toBeTruthy();
    expect(screen.getByText('2,0 %')).toBeTruthy();
    expect(container.querySelector('svg')).toBeTruthy(); // TrendArrow
  });
  it('zeigt keine Delta-Zeile, wenn deltaPct null ist', () => {
    render(<KpiCard kpi={base} />);
    expect(screen.queryByText(/ggü\. Vorperiode/)).toBeNull();
  });
});
