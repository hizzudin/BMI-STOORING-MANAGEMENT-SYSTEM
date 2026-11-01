import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type * as ReactDomModule from 'react-dom';

/**
 * REQ-WO-016 proof: the Create-WO composer shows the draft's `finding_note` to
 * the Planner as READ-ONLY context, and that note is PRESERVED unchanged even
 * when the Planner edits the `description`.
 *
 * The Server Action is mocked (it reaches the API server-side); this test
 * asserts the client form's state model, which is where the requirement lives:
 * the finding note is rendered read-only and is not bound to the description
 * state, and it is carried verbatim in a hidden field.
 */
vi.mock('../actions', () => ({
  createWorkOrderAction: vi.fn(async () => ({})),
}));

// The React-DOM form hooks are a runtime (client Action) concern, not what this
// test covers; stub them so the component's own state model is exercised in
// jsdom. `useFormState` returns the initial state + a no-op action.
vi.mock('react-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof ReactDomModule>();
  return {
    ...actual,
    useFormState: (_action: unknown, initial: unknown) => [initial, () => {}],
    useFormStatus: () => ({ pending: false }),
  };
});

import { CreateWorkOrderForm } from './CreateWorkOrderForm';

const labels = {
  vehicle: 'Vehicle',
  category: 'Category',
  priority: 'Urgency',
  description: 'Description',
  findingNote: 'Finding note',
  findingNoteHelp: 'Read only; unchanged when you edit the description.',
  requiresDowntime: 'Requires downtime',
  submit: 'Create Work Order',
  cancel: 'Cancel',
  generic: 'Something went wrong.',
  titleField: 'Description',
};

function renderForm(findingNote: string | null) {
  return render(
    <CreateWorkOrderForm
      vehicles={[{ id: 1, plate: 'B 1234 ABC' }]}
      findingNote={findingNote}
      seedDescription="Initial field report text"
      seedVehicleId={1}
      labels={labels}
    />,
  );
}

describe('CreateWorkOrderForm — finding note (REQ-WO-016)', () => {
  it('renders the finding note as a read-only field', () => {
    renderForm('Rem belakang bunyi, axle 2.');
    const display = screen.getByLabelText('Finding note') as HTMLTextAreaElement;
    expect(display.value).toBe('Rem belakang bunyi, axle 2.');
    expect(display).toHaveAttribute('readonly');
  });

  it('carries the finding note verbatim in a hidden field', () => {
    const { container } = renderForm('Rem belakang bunyi, axle 2.');
    const hidden = container.querySelector('input[type="hidden"][name="findingNote"]') as HTMLInputElement;
    expect(hidden).not.toBeNull();
    expect(hidden.value).toBe('Rem belakang bunyi, axle 2.');
  });

  it('keeps the finding note unchanged when the Planner edits the description', () => {
    const { container } = renderForm('Rem belakang bunyi, axle 2.');
    const description = screen.getByLabelText('Description', { selector: 'textarea' }) as HTMLTextAreaElement;

    fireEvent.change(description, { target: { value: 'Planner-edited scope: full brake overhaul.' } });

    // Description changed…
    expect(description.value).toBe('Planner-edited scope: full brake overhaul.');
    // …but the read-only finding note and its hidden carrier did NOT.
    const display = screen.getByLabelText('Finding note') as HTMLTextAreaElement;
    expect(display.value).toBe('Rem belakang bunyi, axle 2.');
    const hidden = container.querySelector('input[type="hidden"][name="findingNote"]') as HTMLInputElement;
    expect(hidden.value).toBe('Rem belakang bunyi, axle 2.');
  });

  it('shows no finding-note field when the draft has none', () => {
    renderForm(null);
    expect(screen.queryByLabelText('Finding note')).toBeNull();
  });
});
