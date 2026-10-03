import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/session';

// Everything under /driver is for signed-in drivers (checked on the server before rendering).
export default async function DriverLayout({ children }: LayoutProps<'/driver'>) {
  const user = await requireUser('DRIVER');
  return <AppShell user={user}>{children}</AppShell>;
}
