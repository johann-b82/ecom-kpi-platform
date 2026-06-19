import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
const replace = vi.fn();
const refresh = vi.fn();

vi.mock('@/lib/supabase/client', () => ({ createClient: () => ({ auth: { signInWithPassword } }) }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh }),
  useSearchParams: () => new URLSearchParams(''),
}));

describe('LoginForm', () => {
  it('signs in with entered email + password and redirects', async () => {
    const { LoginForm } = await import('@/components/LoginForm');
    render(<LoginForm />);
    fireEvent.change(screen.getByLabelText('E-Mail'), { target: { value: 'a@b.de' } });
    fireEvent.change(screen.getByLabelText('Passwort'), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: 'Anmelden' }));
    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({ email: 'a@b.de', password: 'pw' });
      expect(replace).toHaveBeenCalledWith('/');
    });
  });
});
