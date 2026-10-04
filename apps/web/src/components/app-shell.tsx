import type { ReactNode } from 'react';
import type { CurrentUser } from '@/lib/types';
import { Brand } from './brand';
import { NavLinks } from './nav-links';
import { SignOutButton } from './sign-out-button';

/** The frame around every signed-in page: brand, navigation, who you are, sign out. */
export function AppShell({ user, children }: { user: CurrentUser; children: ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Brand />
            <NavLinks role={user.role} />
          </div>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-stone-600">
              {user.fullName}
              <span className="ml-2 rounded-full bg-stone-100 px-2 py-0.5 text-xs text-stone-600">
                {user.role === 'DRIVER' ? 'Driver' : 'Passenger'}
              </span>
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-3xl space-y-6 px-4 py-6">{children}</main>
    </div>
  );
}
