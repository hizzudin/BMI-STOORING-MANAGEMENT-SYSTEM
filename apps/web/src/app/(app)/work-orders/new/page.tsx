import Link from 'next/link';
import { idValue } from '@bmi/shared';
import { currentLocale } from '@/lib/session';
import { translator } from '@/lib/i18n';
import { listVehicles, getWorkOrder } from '@/lib/resources';
import { PageHeader } from '@/components/ui';
import { CreateWorkOrderForm } from './CreateWorkOrderForm';

/**
 * Create WO composer (REQ-WO-001/016). When opened from a field request draft
 * (`?draft=<id>`), the draft's `finding_note` is loaded and shown to the
 * Planner as READ-ONLY context; the Planner edits `description` freely and the
 * finding note is preserved verbatim (REQ-WO-016). The urgency pill in the
 * composer carries its text label (the form's priority select names each).
 */
export default async function NewWorkOrderPage({
  searchParams,
}: {
  searchParams: { draft?: string };
}): Promise<JSX.Element> {
  const locale = currentLocale();
  const tr = translator(locale);
  const vehicles = await listVehicles();

  // Optional seed from a field request draft so the finding note carries over.
  let findingNote: string | null = null;
  let seedDescription = '';
  let seedVehicleId: number | null = null;
  const draftId = searchParams.draft ? Number.parseInt(searchParams.draft, 10) : NaN;
  if (Number.isInteger(draftId) && draftId > 0) {
    try {
      const draft = await getWorkOrder(draftId);
      findingNote = draft.workOrder.findingNote;
      seedDescription = draft.workOrder.description;
      seedVehicleId = idValue(draft.workOrder.vehicleId);
    } catch {
      // A missing/forbidden draft just means we compose from scratch.
    }
  }

  return (
    <>
      <PageHeader
        title={tr('wo.createTitle')}
        action={
          <Link href="/work-orders" className="btn btn-secondary">
            {tr('common.back')}
          </Link>
        }
      />
      <CreateWorkOrderForm
        vehicles={vehicles.map((v) => ({ id: idValue(v.id), plate: v.plate }))}
        findingNote={findingNote}
        seedDescription={seedDescription}
        seedVehicleId={seedVehicleId}
        labels={{
          vehicle: tr('common.vehicle'),
          category: tr('wo.category'),
          priority: tr('common.priority'),
          description: tr('wo.description'),
          findingNote: tr('wo.findingNote'),
          findingNoteHelp: tr('wo.findingNoteHelp'),
          requiresDowntime: tr('wo.requiresDowntime'),
          submit: tr('wo.create'),
          cancel: tr('common.cancel'),
          generic: tr('error.generic'),
          titleField: tr('wo.description'),
        }}
      />
    </>
  );
}
