/** Route-segment loading fallback for the authenticated shell. */
export default function Loading(): JSX.Element {
  return (
    <p role="status" aria-live="polite" style={{ padding: 'var(--space-page)', color: 'var(--text-muted)' }}>
      Memuat… / Loading…
    </p>
  );
}
