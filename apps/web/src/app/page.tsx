import { redirect } from 'next/navigation';
import { hasSession } from '@/lib/api';

/** Entry point: route to the dashboard when signed in, else to sign-in. */
export default function HomePage(): never {
  redirect(hasSession() ? '/dashboard' : '/login');
}
