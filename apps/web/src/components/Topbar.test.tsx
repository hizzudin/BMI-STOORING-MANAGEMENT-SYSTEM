import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Topbar contract (PRD §7.2 App shell / §7.9 C-03 / REQ-NTF-001): the page
 * header carries the user/role, the notification bell with an unread-count
 * badge, the language toggle and sign-out. The badge only appears when there
 * is an unread count, and the bell always exposes an accessible label.
 */
vi.mock('@/app/actions', () => ({
  setLocaleAction: vi.fn(async () => {}),
  logoutAction: vi.fn(async () => {}),
}));

import { Topbar } from './Topbar';

describe('Topbar — notification bell (§7.9 C-03 / REQ-NTF-001)', () => {
  it('shows the unread-count badge when there are unread notifications', () => {
    render(<Topbar role="Planner" locale="en" unreadCount={3} />);
    const bell = screen.getByRole('link', { name: /Notifications \(3\)/ });
    expect(bell).toBeInTheDocument();
    expect(bell.textContent).toContain('3');
  });

  it('shows the bell without a badge when there are none', () => {
    const { container } = render(<Topbar role="Planner" locale="en" unreadCount={0} />);
    const bell = screen.getByRole('link', { name: 'Notifications' });
    expect(bell).toBeInTheDocument();
    // No numeric badge rendered at zero.
    expect(bell.textContent).not.toMatch(/\d/);
    expect(container).toBeTruthy();
  });
});
