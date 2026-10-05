import { DriverDashboard } from '@/components/driver/driver-dashboard';
import { requireUser } from '@/lib/session';

export default async function DriverPage() {
  // The page checks too: a layout's check doesn't stop the page rendering.
  const user = await requireUser('DRIVER');
  return <DriverDashboard initialUser={user} />;
}
