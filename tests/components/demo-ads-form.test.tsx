import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DemoAdsForm } from '@/components/DemoAdsForm';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock('@/app/(shell)/setup/actions', () => ({ toggleDemoAdsAction: vi.fn() }));

describe('DemoAdsForm', () => {
  it('zeigt „aktiv" + Ausschalt-Button, wenn enabled', () => {
    render(<DemoAdsForm enabled={true} />);
    expect(screen.getByText(/aktiv/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /ausschalten/i })).toBeTruthy();
  });
  it('zeigt Einschalt-Button, wenn nicht enabled', () => {
    render(<DemoAdsForm enabled={false} />);
    expect(screen.getByRole('button', { name: /einschalten/i })).toBeTruthy();
  });
});
