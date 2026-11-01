'use client';

import { useEffect } from 'react';

/**
 * Error boundary for the authenticated shell. Shows a recoverable message and a
 * retry; the detailed error stays server-side (never leaked to the UI).
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}): JSX.Element {
  useEffect(() => {
    // Surface to the server/console channel for diagnostics.
    console.error(error);
  }, [error]);

  return (
    <div style={{ padding: 'var(--space-page)' }} role="alert">
      <h1 style={{ fontSize: 'var(--fs-headline)', fontWeight: 700 }}>Terjadi kesalahan / Something went wrong</h1>
      <p style={{ color: 'var(--text-muted)' }}>
        Tidak dapat memuat data dari server. / Could not load data from the server.
      </p>
      <button type="button" className="btn btn-primary" onClick={() => reset()}>
        Coba lagi / Retry
      </button>
    </div>
  );
}
