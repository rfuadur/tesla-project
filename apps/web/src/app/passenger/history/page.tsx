import { RideHistory } from '@/components/ride/ride-history';
import { requireUser } from '@/lib/session';

export default async function PassengerHistoryPage() {
  await requireUser('PASSENGER');
  return (
    <>
      <h1 className="text-2xl font-semibold">Your rides</h1>
      <RideHistory />
    </>
  );
}
