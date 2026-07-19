import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/verkauf' }));

import { ShellNavProvider, useShellNav } from '@/components/ShellNav';

afterEach(cleanup);

function Probe() {
  const { open, toggle, close } = useShellNav();
  return (
    <div>
      <span data-testid="state">{open ? 'open' : 'closed'}</span>
      <button onClick={toggle}>toggle</button>
      <button onClick={close}>close</button>
    </div>
  );
}

describe('ShellNav', () => {
  it('startet geschlossen und toggelt', () => {
    render(<ShellNavProvider><Probe /></ShellNavProvider>);
    expect(screen.getByTestId('state').textContent).toBe('closed');
    fireEvent.click(screen.getByText('toggle'));
    expect(screen.getByTestId('state').textContent).toBe('open');
    fireEvent.click(screen.getByText('close'));
    expect(screen.getByTestId('state').textContent).toBe('closed');
  });

  it('useShellNav wirft außerhalb des Providers', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/ShellNavProvider/);
    spy.mockRestore();
  });
});
