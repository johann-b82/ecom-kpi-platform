import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StartOverview } from '@/components/StartOverview';

afterEach(cleanup);

describe('StartOverview', () => {
  it('zeigt Umsatzwachstum (mit Vorzeichen) statt Umsatz akt. Monat und verlinkt in den Verkauf', () => {
    render(<StartOverview signals={{ revenueGrowthPct: 13.6 }} />);
    expect(screen.getByText('Umsatzwachstum')).toBeTruthy();
    expect(screen.getByText('+13,6 %')).toBeTruthy();
    expect(screen.queryByText('Umsatz akt. Monat')).toBeNull();
    expect(screen.getByRole('link', { name: /Umsatzwachstum/ }).getAttribute('href')).toBe('/verkauf');
  });

  it('zeigt bei Vorperiode 0 einen Gedankenstrich', () => {
    render(<StartOverview signals={{ revenueGrowthPct: null }} />);
    expect(screen.getByText('–')).toBeTruthy();
  });

  it('zeigt operativen Cashflow (Einzahlungen) statt Offene Posten und verlinkt in Finanzen', () => {
    render(<StartOverview signals={{ cashflowIn: 4200 }} />);
    expect(screen.getByText('Operativer Cashflow')).toBeTruthy();
    expect(screen.getByText(/4\.200,00/)).toBeTruthy();
    expect(screen.queryByText('Offene Posten')).toBeNull();
    expect(screen.getByRole('link', { name: /Operativer Cashflow/ }).getAttribute('href')).toBe('/finanzen');
  });
});
