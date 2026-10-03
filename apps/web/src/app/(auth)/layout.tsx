import type { ReactNode } from 'react';
import { redirect } from 'next/navigation';
import { Brand } from '@/components/brand';
import { getCurrentUser, homeFor } from '@/lib/session';

// Sign-in and sign-up pages. Someone already signed in goes straight to their home instead.
export default async function AuthLayout({ children }: { children: ReactNode }) {
  const user = await getCurrentUser();
  if (user) redirect(homeFor(user.role));

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <Brand tagline />
      {children}
    </main>
  );
}
