import Link from 'next/link';
import { notFound } from 'next/navigation';
import { idValue } from '@bmi/shared';
import { currentLocale } from '@/lib/session';
import { translator } from '@/lib/i18n';
import { getWorkOrder } from '@/lib/resources';
import { ApiError } from '@/lib/api';
import { stepStatusPill, humanize } from '@/lib/status';
import { formatWibDateTime } from '@/lib/format';
import { PageHeader, Card, Field, InfoPanel } from '@/components/ui';
import { Pill } from '@/components/Pill';

/**
 * Step screen (FG-1 engine step, REQ-ENG). A context banner (which WO/vehicle),
 * the step's module/executor/verifier/time details, and a right-aligned action
 * bar. The step action buttons map to the engine endpoints; here the shell
 * renders the step faithfully and exposes the navigable surface. Status always
 * carries its word (NFR-A11Y).
 */
export default async function StepScreen({
  params,
}: {
  params: { id: string; stepId: string };
}): Promise<JSX.Element> {
  const locale = currentLocale();
  const tr = translator(locale);
  const woId = Number.parseInt(params.id, 10);
  const stepId = Number.parseInt(params.stepId, 10);

  let detail;
  try {
    detail = await getWorkOrder(woId);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      notFound();
    }
    throw err;
  }
  const step = detail.steps.find((s) => idValue(s.id) === stepId);
  if (!step) {
    notFound();
  }

  return (
    <>
      <PageHeader
        title={`${tr('step.title')} ${step.sequence} · ${humanize(step.moduleCode)}`}
        action={
          <Link href={`/work-orders/${woId}`} className="btn btn-secondary">
            {tr('common.back')}
          </Link>
        }
      />

      <InfoPanel>
        {tr('wo.title')} {detail.workOrder.number} · {tr('common.status')}:{' '}
        <Pill spec={stepStatusPill(step.status)} srPrefix={tr('common.status')} />
      </InfoPanel>

      <div className="layout-split" style={{ marginTop: 'var(--space-md)' }}>
        <Card title={tr('step.title')}>
          <Field label={tr('step.module')}>{humanize(step.moduleCode)}</Field>
          <Field label={tr('step.sequence')}>{step.sequence}</Field>
          <Field label={tr('step.executor')}>
            {step.executorRoles.map(humanize).join(', ') || tr('common.none')}
          </Field>
          <Field label={tr('step.verifier')}>{humanize(step.verifierRole)}</Field>
          <Field label={tr('step.assignee')}>
            {step.assigneeId ? `#${idValue(step.assigneeId)}` : tr('common.none')}
          </Field>
        </Card>

        <Card title={tr('wo.detail.context')}>
          <Field label="Opened">{formatWibDateTime(step.openedAt)}</Field>
          <Field label="Started">{formatWibDateTime(step.startedAt)}</Field>
          <Field label="Submitted">{formatWibDateTime(step.submittedAt)}</Field>
          <Field label="Verified">{formatWibDateTime(step.verifiedAt)}</Field>
          {step.returnNote ? <InfoPanel>{step.returnNote}</InfoPanel> : null}
        </Card>
      </div>
    </>
  );
}
