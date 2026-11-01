import { idValue, type ScheduleCardDto } from '@bmi/shared';
import { currentLocale } from '@/lib/session';
import { translator } from '@/lib/i18n';
import { listSchedule } from '@/lib/resources';
import { humanize } from '@/lib/status';
import { formatWibDate } from '@/lib/format';
import { PageHeader, EmptyState } from '@/components/ui';
import { Pill } from '@/components/Pill';
import styles from './schedule.module.css';

/**
 * Maintenance schedule (FG-12, REQ-SCH-003, DEC-92). Each card shows its
 * planned WIB date and status; a card rolled forward from a missed day carries
 * the "Rolled over / late" flag (`wo_schedule.is_rolled_over`) as a pill with
 * its text label — a flag never shown by colour alone (NFR-A11Y).
 */
export default async function SchedulePage(): Promise<JSX.Element> {
  const locale = currentLocale();
  const tr = translator(locale);
  const cards = await listSchedule();

  return (
    <>
      <PageHeader title={tr('schedule.title')} />
      {cards.length === 0 ? (
        <EmptyState message={tr('schedule.empty')} />
      ) : (
        <ul className={styles.cardGrid}>
          {cards.map((card: ScheduleCardDto) => (
            <li key={idValue(card.id)} className={styles.card}>
              <div className={styles.cardHead}>
                <span className={styles.woRef}>WO #{idValue(card.workOrderId)}</span>
                {card.isRolledOver ? (
                  <Pill
                    spec={{ variant: 'danger', label: tr('schedule.rolledOver') }}
                    srPrefix={tr('common.status')}
                  />
                ) : null}
              </div>
              <div className={styles.row}>
                <span className={styles.label}>{tr('schedule.plannedDate')}</span>
                <span className="tnum">{formatWibDate(card.plannedDate)}</span>
              </div>
              <div className={styles.row}>
                <span className={styles.label}>{tr('common.status')}</span>
                <span>{humanize(card.status)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
