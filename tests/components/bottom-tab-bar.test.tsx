// tests/components/bottom-tab-bar.test.tsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

let path = '/kontakte';
vi.mock('next/navigation', () => ({ usePathname: () => path }));

import { BottomTabBar } from '@/components/BottomTabBar';
import { APPS } from '@/lib/apps';

afterEach(cleanup);

describe('BottomTabBar', () => {
  it('zeigt erste 4 Apps + „Mehr" und markiert die aktive App amber', () => {
    path = '/kontakte'; // kontakte ist nicht unter den ersten 4 → ersetzt Slot 4
    render(<BottomTabBar apps={APPS} />);
    expect(screen.getByRole('link', { name: /Verfügbarkeit/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Kontakte/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /Mehr/i })).toBeTruthy();
    // Katalog (ursprünglicher Slot 4) ist verdrängt
    expect(screen.queryByRole('link', { name: /Katalog/i })).toBeNull();
    const active = screen.getByRole('link', { name: /Kontakte/i });
    expect(active.getAttribute('aria-current')).toBe('page');
    expect(active.className).toContain('text-accent');
  });

  it('markiert „Mehr" auf dem Launchpad', () => {
    path = '/';
    render(<BottomTabBar apps={APPS} />);
    const more = screen.getByRole('link', { name: /Mehr/i });
    expect(more.getAttribute('aria-current')).toBe('page');
  });
});
