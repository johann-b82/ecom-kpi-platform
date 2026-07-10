import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Launchpad } from '@/components/Launchpad';
import { APPS } from '@/lib/apps';

afterEach(cleanup);

it('renders one tile per accessible app linking to its href', () => {
  render(<Launchpad apps={APPS} />);
  const dash = screen.getByRole('link', { name: /Dashboard/i });
  expect(dash.getAttribute('href')).toBe('/dashboard');
  expect(screen.getByRole('link', { name: /BrickPM/i }).getAttribute('href')).toBe('/brickpm');
});

it('renders only the apps it is given', () => {
  render(<Launchpad apps={APPS.filter((a) => a.key === 'dashboard')} />);
  expect(screen.queryByRole('link', { name: /BrickPM/i })).toBeNull();
});
