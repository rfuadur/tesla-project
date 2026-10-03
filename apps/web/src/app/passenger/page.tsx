import { EmptyState } from '@/components/ui/feedback';
import { requireUser } from '@/lib/session';

export default async function PassengerHome() {
  await requireUser('PASSENGER'); // the page checks too: a layout's check doesn't stop the page rendering

  return (
    <>
      <h1 className="text-2xl font-semibold">Where to today?</h1>
      <EmptyState title="Booking a ride is coming next.">
        You will pick a pickup and drop-off zone, see the fare, and follow your Tesla here.
      </EmptyState>
    </>
  );
}
