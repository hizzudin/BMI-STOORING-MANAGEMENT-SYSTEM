import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

/**
 * Sidebar contract (PRD §7.2 App shell / §7.9 C-02 / DEC-82):
 *  - renders the role-appropriate nav items with their icon + label;
 *  - carries a Collapse-menu toggle at the foot that submits the opposite
 *    collapsed state (so the per-user preference flips);
 *  - in the collapsed rail the labels are visually hidden but still available
 *    to screen readers, and the toggle offers "Expand menu".
 */
vi.mock('@/app/actions', () => ({
  toggleSidebarAction: vi.fn(async () => {}),
}));
vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
}));

import { Sidebar } from './Sidebar';

describe('Sidebar — collapsible rail (DEC-82 / §7.9 C-02)', () => {
  it('shows the collapse toggle and posts the collapsed state when expanded', () => {
    const { container } = render(<Sidebar role="SystemAdmin" locale="en" collapsed={false} />);
    expect(screen.getByRole('button', { name: 'Collapse menu' })).toBeInTheDocument();
    const hidden = container.querySelector('input[type="hidden"][name="collapsed"]') as HTMLInputElement;
    // Expanded now → the toggle submits "1" (collapse next).
    expect(hidden.value).toBe('1');
    expect(container.querySelector('nav')?.getAttribute('data-collapsed')).toBe('false');
  });

  it('offers Expand and keeps labels for screen readers when collapsed', () => {
    const { container } = render(<Sidebar role="SystemAdmin" locale="en" collapsed />);
    expect(screen.getByRole('button', { name: 'Expand menu' })).toBeInTheDocument();
    const hidden = container.querySelector('input[type="hidden"][name="collapsed"]') as HTMLInputElement;
    // Collapsed now → the toggle submits "0" (expand next).
    expect(hidden.value).toBe('0');
    expect(container.querySelector('nav')?.getAttribute('data-collapsed')).toBe('true');
    // The active item (Dashboard) is marked current and its label is present.
    const active = container.querySelector('[aria-current="page"]');
    expect(active?.getAttribute('title')).toBe('Dashboard');
  });
});
