import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

let path = '/verkauf';
vi.mock('next/navigation', () => ({ usePathname: () => path }));

const toggle = vi.fn();
vi.mock('@/components/ShellNav', () => ({ useShellNav: () => ({ open: false, toggle, close: vi.fn() }) }));

import { ModuleBar } from '@/components/ModuleBar';

afterEach(() => { cleanup(); toggle.mockClear(); });

describe('ModuleBar', () => {
  it('zeigt den aktiven Modulnamen und toggelt bei Klick', () => {
    path = '/verkauf/belege/1';
    render(<ModuleBar />);
    const btn = screen.getByRole('button', { name: /Verkauf/i });
    expect(btn.className).toContain('lg:hidden'); // nur unter lg als Trigger
    fireEvent.click(btn);
    expect(toggle).toHaveBeenCalledOnce();
  });

  it('rendert nichts auf dem Launchpad', () => {
    path = '/';
    const { container } = render(<ModuleBar />);
    expect(container.firstChild).toBeNull();
  });
});
