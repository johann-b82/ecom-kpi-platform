import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }) }));
vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signOut: vi.fn() } }) }));

import { UserMenu } from '@/components/UserMenu';

afterEach(cleanup);

function openMenu() {
  fireEvent.click(screen.getByLabelText('Benutzermenü'));
}

describe('UserMenu', () => {
  it('hides the Einstellungen link for non-admins', () => {
    render(<UserMenu email="user@example.com" isAdmin={false} />);
    openMenu();
    expect(screen.queryByText('Einstellungen')).toBeNull();
  });

  it('shows Einstellungen with an admin-only lock for admins', () => {
    render(<UserMenu email="admin@example.com" isAdmin={true} />);
    openMenu();
    expect(screen.getByText('Einstellungen')).toBeTruthy();
    expect(screen.getByLabelText('Nur für Admins')).toBeTruthy();
  });
});
