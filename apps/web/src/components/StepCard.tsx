import Link from 'next/link';
import { idValue, StepStatus, type AssignmentDto } from '@bmi/shared';
import { translator, type Locale } from '@/lib/i18n';
import { stepStatusPill, humanize } from '@/lib/status';
import { Pill } from './Pill';
import styles from './StepCard.module.css';

/**
 * One WO step card (DESIGN.md "Step Card"): the module name + sequence badge, a
 * status pill (status word always present), who is assigned, and a link into
 * the step screen. A Locked step says what it waits for. The step waiting for
 * action is emphasised with a red border (no colour-only meaning — it still
 * carries the status word).
 */
export function StepCard({
  workOrderId,
  step,
  locale,
}: {
  workOrderId: number;
  step: AssignmentDto;
  locale: Locale;
}): JSX.Element {
  const tr = translator(locale);
  const waiting = step.status === StepStatus.Open || step.status === StepStatus.InProgress;

  return (
    <div className={`${styles.card} ${waiting ? styles.waiting : ''}`}>
      <span className={styles.badge} aria-hidden="true">
        {step.sequence}
      </span>
      <div className={styles.body}>
        <div className={styles.titleRow}>
          <span className={styles.module}>{humanize(step.moduleCode)}</span>
          <Pill spec={stepStatusPill(step.status)} srPrefix={tr('common.status')} />
        </div>
        <div className={styles.meta}>
          <span>
            {tr('step.executor')}: {step.executorRoles.map(humanize).join(', ') || tr('common.none')}
          </span>
          <span>
            {tr('step.verifier')}: {humanize(step.verifierRole)}
          </span>
        </div>
      </div>
      <Link href={`/work-orders/${workOrderId}/steps/${idValue(step.id)}`} className="btn btn-secondary">
        {tr('common.view')}
      </Link>
    </div>
  );
}
