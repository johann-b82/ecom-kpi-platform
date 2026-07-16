import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KanalVergleich } from '@/components/KanalVergleich';
import type { ChannelSummary } from '@/verkauf/types';

const row = (channel: ChannelSummary['channel'], o: Partial<ChannelSummary>): ChannelSummary => ({
  channel, revenueNet: 0, orders: 0, avgOrderValueNet: 0,
  wareneinsatz: 0, gebuehren: 0, werbung: 0, db: 0, dbProzent: null, ...o,
});

describe('KanalVergleich', () => {
  it('zeigt DB% je Kanal und die Kostenspalten', () => {
    render(<KanalVergleich channels={[
      row('shop', { revenueNet: 24300, wareneinsatz: 10900, gebuehren: 700, werbung: 1100, db: 11600, dbProzent: 11600 / 24300 }),
    ]} />);
    expect(screen.getByText('Werbung')).toBeTruthy();
    expect(screen.getByText('47,7 %')).toBeTruthy();  // 11600/24300
    expect(screen.getByText('Shop').closest('a')?.getAttribute('href')).toBe('/verkauf/kanal/shop');
  });
});
