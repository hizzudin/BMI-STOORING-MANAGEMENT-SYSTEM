import Link from 'next/link';

/** Shown when a Work Order id does not resolve. */
export default function WorkOrderNotFound(): JSX.Element {
  return (
    <div style={{ padding: 'var(--space-page)' }}>
      <h1 style={{ fontSize: 'var(--fs-headline)', fontWeight: 700 }}>
        Work Order tidak ditemukan / not found
      </h1>
      <Link href="/work-orders" className="btn btn-secondary">
        Kembali / Back
      </Link>
    </div>
  );
}
