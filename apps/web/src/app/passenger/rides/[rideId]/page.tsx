import Link from 'next/link';
import { RideTracker } from '@/components/ride/ride-tracker';
import { requireUser } from '@/lib/session';

// One past (or current) ride with its full timeline. Someone else's ride id shows "Ride not found":
// the API answers 404 for rides that aren't yours.
export default async function RidePage({ params }: PageProps<'/passenger/rides/[rideId]'>) {
  await requireUser('PASSENGER');
  const { rideId } = await params;

  return (
    <>
      <Link href="/passenger/history" className="text-sm text-brand-700 underline">
        ← Your rides
      </Link>
      <RideTracker rideId={rideId} />
    </>
  );
}
