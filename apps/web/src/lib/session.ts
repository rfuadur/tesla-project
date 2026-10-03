import 'server-only';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { cache } from 'react';
import type { CurrentUser, Role } from './types';

// Server-side session checks for pages and layouts. They ask the API (the only judge of a session),
// forwarding the browser's cookie. Hiding a page here is a convenience: every rule is enforced by the API.
//
// Check in every protected PAGE, not only in its layout: Next.js renders a route's layout and page side
// by side, so a redirect in the layout does not stop the page from rendering (see the Next.js
// authentication guide, "Layouts and auth checks").

const API_ORIGIN = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

export const homeFor = (role: Role) => (role === 'DRIVER' ? '/driver' : '/passenger');

/**
 * The signed-in user, or null if there is no valid session.
 * Wrapped in React's cache(): the layout and page of one request share a single call to the API.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const cookieStore = await cookies();
  if (!cookieStore.has('tp_session')) return null;

  const res = await fetch(`${API_ORIGIN}/api/v1/auth/me`, {
    headers: { cookie: cookieStore.toString() },
    cache: 'no-store',
  });
  if (res.status === 401) return null; // expired or tampered: treat as signed out
  if (!res.ok) throw new Error(`Could not check your session (the API answered ${res.status}).`);
  return ((await res.json()) as { user: CurrentUser }).user;
});

/** For a page only one role may see: anyone else is sent to sign in, or to their own home. */
export async function requireUser(role: Role): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== role) redirect(homeFor(user.role));
  return user;
}
