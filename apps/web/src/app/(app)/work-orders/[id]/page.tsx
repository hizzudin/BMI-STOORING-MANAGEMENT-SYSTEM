import Link from 'next/link';
import { notFound } from 'next/navigation';
import { idValue, type AssignmentDto } from '@bmi/shared';
import { currentLocale } from '@/lib/session';
import { translator } from '@/lib/i18n';
import { getWorkOrder } from '@/lib/resources';
import { ApiError } from '@/lib/api';
import { priorityPill, workOrderStatusPill } from '@/lib/status';
import { PageHeader, Card, Field, InfoPanel, EmptyState } from '@/components/ui';
import { Pill } from '@/components/Pill';
import { StepCard } from '@/components/StepCard';

/**
 * Work Order detail (FG-1, REQ-WO-011). Master-detail: the WO header + context
 * on the right, the ordered step cards on the left. The urgency and status
 * pills carry their text labels (NFR-A11Y). The originator's `finding_note` is
 * shown read-only when present (REQ-WO-016/DEC-91).
 */
export default async function WorkOrderDetailPage({
  params,
}: {
  params: { id: string };
}): Promise<JSX.Element> {
  const locale = currentLocale();
  const tr = translator(locale);
  const id = Number.parseInt(params.id, 10);

  let detail;
  try {
    detail = await getWorkOrder(id);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }
  const { workOrder: wo, steps } = detail;
  const ordered = [...steps].sort((a, b) => a.sequence - b.sequence);

  return (
    <>
      <PageHeader
        title={`${tr('wo.title')} ${wo.number}`}
        action={
          <Link href="/work-orders" className="btn btn-secondary">
            {tr('common.back')}
          </Link>
        }
      />

      <div className="layout-split">
        <div>
          <Card title={tr('wo.detail.steps')}>
            {ordered.length === 0 ? (
              <EmptyState message={tr('wo.noSteps')} />
            ) : (
              <ol style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {ordered.map((step: AssignmentDto) => (
                  <li key={idValue(step.id)} style={{ marginBottom: 'var(--space-sm)' }}>
                    <StepCard workOrderId={idValue(wo.id)} step={step} locale={locale} />
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>

        <div>
          <Card title={tr('wo.detail.context')}>
            <Field label={tr('common.priority')}>
              <Pill spec={priorityPill(wo.priority)} srPrefix={tr('common.priority')} />
            </Field>
            <Field label={tr('common.status')}>
              <Pill spec={workOrderStatusPill(wo.status)} srPrefix={tr('common.status')} />
            </Field>
            <Field label={tr('wo.category')}>{wo.category}</Field>
            <Field label={tr('wo.requiresDowntime')}>
              {wo.requiresDowntime ? '✓' : tr('common.none')}
            </Field>
            <Field label={tr('wo.description')}>{wo.description}</Field>
          </Card>

          {wo.findingNote ? (
            <Card title={tr('wo.findingNote')}>
              <InfoPanel>{wo.findingNote}</InfoPanel>
              <p className="field-help">{tr('wo.findingNoteHelp')}</p>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
