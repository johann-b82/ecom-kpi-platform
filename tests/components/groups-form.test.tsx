import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { GroupsForm } from '@/components/GroupsForm';
import type { Group } from '@/lib/groups';
import type { AppUser } from '@/lib/users';

afterEach(cleanup);

const users: AppUser[] = [{ id: 'u1', email: 'a@b.de', createdAt: '', lastSignInAt: null }];
const groups: Group[] = [
  { id: 'g1', name: 'Produktmanagement', isAdmin: false, memberIds: ['u1'], access: [{ app: 'kontakte', permission: 'edit' }] },
];

describe('GroupsForm', () => {
  it('renders each group with its name and a per-app access control', () => {
    render(<GroupsForm groups={groups} users={users} />);
    expect(screen.getByDisplayValue('Produktmanagement')).toBeTruthy();
    // one access <select> per app → at least 2
    expect(screen.getAllByRole('combobox').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Neue Gruppe')).toBeTruthy();
  });
});
