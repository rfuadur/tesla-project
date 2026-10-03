import { AppShell } from '@/components/app-shell';
import { requireUser } from '@/lib/session';

// Everything under /passenger is for signed-in passengers (checked on the server before rendering).
export default async function PassengerLayout({ children }: LayoutProps<'/passenger'>) {
  const user = await requireUser('PASSENGER');
  return <AppShell user={user}>{children}</AppShell>;
}
