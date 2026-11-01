import type { PillSpec, PillVariant } from '@/lib/status';
import styles from './Pill.module.css';

/**
 * Status / urgency pill. The LABEL (status word) is ALWAYS rendered — colour
 * only reinforces it (DESIGN.md "The Words First Rule"; WCAG 2.2 AA / NFR-A11Y:
 * status is never conveyed by colour alone). An optional visually-hidden prefix
 * names what the status describes, for screen readers.
 */
export function Pill({
  spec,
  srPrefix,
}: {
  spec: PillSpec;
  srPrefix?: string;
}): JSX.Element {
  return (
    <span className={`${styles.pill} ${styles[spec.variant]}`} data-variant={spec.variant}>
      {srPrefix ? <span className="sr-only">{srPrefix}: </span> : null}
      {spec.label}
    </span>
  );
}

export type { PillVariant };
