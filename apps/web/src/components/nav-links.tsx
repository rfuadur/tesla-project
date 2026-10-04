'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { Role } from '@/lib/types';

const LINKS: Record<Role, { href: string; label: string }[]> = {
  PASSENGER: [
    { href: '/passenger', label: 'Ride' },
    { href: '/passenger/history', label: 'History' },
  ],
  DRIVER: [{ href: '/driver', label: 'Dashboard' }],
};

export function NavLinks({ role }: { role: Role }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex gap-1 text-sm">
      {LINKS[role].map((link) => {
        const active = pathname === link.href;
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-lg px-3 py-1.5 ${active ? 'bg-brand-50 font-medium text-brand-700' : 'text-stone-600 hover:bg-stone-100'}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
