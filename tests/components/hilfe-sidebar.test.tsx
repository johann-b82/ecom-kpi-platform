import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/hilfe' }));

import { HilfeSidebar } from '@/components/help/HilfeSidebar';

afterEach(cleanup);

describe('HilfeSidebar', () => {
  it('shows user pages but hides the admin group for non-admins', () => {
    render(<HilfeSidebar isAdmin={false} />);
    expect(screen.getByText('Kontakte')).toBeTruthy();
    expect(screen.queryByText('Datenmodell')).toBeNull();
    expect(screen.queryByText('Administration')).toBeNull();
  });

  it('shows the admin group for admins, marked as admin-only', () => {
    render(<HilfeSidebar isAdmin={true} />);
    expect(screen.getByText('Administration')).toBeTruthy();
    expect(screen.getByText('Datenmodell')).toBeTruthy();
    expect(screen.getByText('Nur Admin')).toBeTruthy();
  });
});
