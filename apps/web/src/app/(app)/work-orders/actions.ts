'use server';

import { redirect } from 'next/navigation';
import { idValue } from '@bmi/shared';
import { ApiError } from '@/lib/api';
import { createWorkOrder } from '@/lib/resources';

/**
 * Create-WO composer submit (REQ-WO-001/016). The Planner may edit the
 * `description` freely; the originator's `findingNote` is passed through
 * UNCHANGED (it is rendered read-only in the composer and never bound to the
 * description field — REQ-WO-016). On success we navigate to the new WO detail.
 */
export interface CreateWoState {
  readonly error?: string;
}

export async function createWorkOrderAction(
  _prev: CreateWoState,
  formData: FormData,
): Promise<CreateWoState> {
  const vehicleId = Number.parseInt(String(formData.get('vehicleId') ?? ''), 10);
  const title = String(formData.get('title') ?? '').trim();
  const category = String(formData.get('category') ?? 'Corrective');
  const priority = String(formData.get('priority') ?? 'Normal');
  const description = String(formData.get('description') ?? '').trim();
  const requiresDowntime = formData.get('requiresDowntime') === 'on';
  // Read-only passthrough: the finding note is carried as a hidden field so the
  // draft's originator note is preserved verbatim, not merged into description.
  const findingNoteRaw = formData.get('findingNote');
  const findingNote =
    typeof findingNoteRaw === 'string' && findingNoteRaw.length > 0 ? findingNoteRaw : undefined;

  if (!Number.isInteger(vehicleId) || vehicleId <= 0 || !title || !description) {
    return { error: 'error.generic' };
  }

  let newId: number;
  try {
    const wo = await createWorkOrder({
      vehicleId,
      title,
      category,
      priority,
      description,
      requiresDowntime,
      ...(findingNote === undefined ? {} : { findingNote }),
      source: 'Manual_Planner',
    });
    newId = idValue(wo.id);
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.message };
    }
    return { error: 'error.generic' };
  }

  redirect(`/work-orders/${newId}`);
}
