import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StartOverview } from '@/components/StartOverview';

afterEach(cleanup);

describe('StartOverview', () => {
  it('zeigt Umsatz aktueller Monat statt offener Angebote', () => {
    render(<StartOverview signals={{ monthRevenue: 12345.6 }} />);
    expect(screen.getByText('Umsatz akt. Monat')).toBeTruthy();
    expect(screen.getByText(/12\.345,60/)).toBeTruthy();
    expect(screen.queryByText('Offene Angebote')).toBeNull();
    // verlinkt in den Verkauf
    expect(screen.getByRole('link', { name: /Umsatz akt\. Monat/ }).getAttribute('href')).toBe('/verkauf');
  });
});
