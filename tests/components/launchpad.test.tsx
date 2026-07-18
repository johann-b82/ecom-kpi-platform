import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Launchpad } from '@/components/Launchpad';
import { APPS } from '@/lib/apps';

afterEach(cleanup);

it('renders one tile per accessible app linking to its href', () => {
  render(<Launchpad apps={APPS} />);
  const brickpm = screen.getByRole('link', { name: /BrickPM/i });
  expect(brickpm.getAttribute('href')).toBe('/brickpm');
  expect(screen.getByRole('link', { name: /Verkauf/i }).getAttribute('href')).toBe('/verkauf');
});

it('renders only the apps it is given', () => {
  render(<Launchpad apps={APPS.filter((a) => a.key === 'brickpm')} />);
  expect(screen.queryByRole('link', { name: /Verkauf/i })).toBeNull();
});
