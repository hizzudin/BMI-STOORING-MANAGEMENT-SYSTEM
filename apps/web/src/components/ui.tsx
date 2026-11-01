import type { ReactNode } from 'react';
import styles from './ui.module.css';

/**
 * Small shared primitives built to DESIGN.md: flat white sheets on a pale page,
 * hairline borders, one filled red action per region, label/value rows, one
 * fact per table column. No nested cards, no resting shadows (The Flat Sheet
 * Rule).
 */

export function PageHeader({
  title,
  action,
}: {
  title: string;
  action?: ReactNode;
}): JSX.Element {
  return (
    <header className={styles.pageHeader}>
      <h1 className={styles.headline}>{title}</h1>
      {action ? <div className={styles.headerAction}>{action}</div> : null}
    </header>
  );
}

export function Card({
  title,
  children,
}: {
  title?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <section className={styles.card}>
      {title ? <h2 className={styles.cardTitle}>{title}</h2> : null}
      {children}
    </section>
  );
}

/** A label/value row — the logbook's basic unit (DESIGN.md). */
export function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <div className={styles.field}>
      <span className={styles.fieldLabel}>{label}</span>
      <span className={styles.fieldValue}>{children}</span>
    </div>
  );
}

export function EmptyState({ message }: { message: string }): JSX.Element {
  return <p className={styles.empty}>{message}</p>;
}

export function InfoPanel({ children }: { children: ReactNode }): JSX.Element {
  return <div className={styles.infoPanel}>{children}</div>;
}

export function Metric({ value, label }: { value: ReactNode; label: string }): JSX.Element {
  return (
    <div className={styles.metricCard}>
      <span className={`${styles.metricValue} tnum`}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
}
