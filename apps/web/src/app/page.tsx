import { redirect } from 'next/navigation';
import { getCurrentUser, homeFor } from '@/lib/session';

// "/" has no page of its own: it sends you to your home (passenger or driver), or to sign in.
export default async function Home() {
  const user = await getCurrentUser();
  redirect(user ? homeFor(user.role) : '/login now');
}
