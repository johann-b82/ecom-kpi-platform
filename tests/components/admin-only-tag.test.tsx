import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { AdminOnlyTag, LockIcon } from '@/components/AdminOnlyTag';

afterEach(cleanup);

describe('AdminOnlyTag', () => {
  it('renders the lock icon and the "Nur Admin" label', () => {
    render(<AdminOnlyTag />);
    expect(screen.getByText('Nur Admin')).toBeTruthy();
    expect(screen.getByLabelText('Nur für Admins')).toBeTruthy();
  });
});

describe('LockIcon', () => {
  it('exposes an accessible label so an icon-only marker is understandable', () => {
    render(<LockIcon />);
    expect(screen.getByLabelText('Nur für Admins')).toBeTruthy();
  });
});
