import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Pill } from './Pill';

/**
 * The Pill always renders its label text (status is never colour alone —
 * NFR-A11Y). An optional screen-reader prefix names what the status describes.
 */
describe('Pill', () => {
  it('always renders the status label text', () => {
    render(<Pill spec={{ variant: 'danger', label: 'Urgent' }} />);
    expect(screen.getByText('Urgent')).toBeInTheDocument();
  });

  it('includes the screen-reader prefix when provided', () => {
    render(<Pill spec={{ variant: 'warning', label: 'Pending Approval' }} srPrefix="Status" />);
    expect(screen.getByText(/Status:/)).toBeInTheDocument();
    expect(screen.getByText('Pending Approval')).toBeInTheDocument();
  });

  it('tags the variant for styling but keeps the word as the carrier', () => {
    const { container } = render(<Pill spec={{ variant: 'info', label: 'Normal' }} />);
    const el = container.querySelector('[data-variant="info"]');
    expect(el).not.toBeNull();
    expect(el?.textContent).toContain('Normal');
  });
});
