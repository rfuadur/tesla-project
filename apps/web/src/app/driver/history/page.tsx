import { TripHistory } from '@/components/driver/trip-history';
import { requireUser } from '@/lib/session';

export default async function DriverHistoryPage() {
  await requireUser('DRIVER');
  return (
    <>
      <h1 className="text-2xl font-semibold">Your trips</h1>
      <TripHistory />
    </>
  );
}
