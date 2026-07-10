import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));

import { AppRail } from '@/components/AppRail';
import { APPS } from '@/lib/apps';

afterEach(cleanup);

it('renders one icon per app with the current app marked active', () => {
  render(<AppRail apps={APPS} logo={null} title="Muster GmbH" />);
  expect(screen.getByText('DB')).toBeTruthy();
  expect(screen.getByText('BP')).toBeTruthy();
  const active = screen.getByRole('link', { name: /Dashboard/i });
  expect(active.getAttribute('aria-current')).toBe('page');
});

it('shows the powered-by lumeapps mark', () => {
  render(<AppRail apps={APPS} logo={null} title="Muster GmbH" />);
  expect(screen.getByText(/lumeapps/i)).toBeTruthy();
});
