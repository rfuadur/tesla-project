'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { EmptyState, Loading, QueryError } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { dhakaDateTime, taka } from '@/lib/format';
import { keys, useZoneName } from '@/lib/queries';

/** Finished rides (completed or cancelled), newest first; each opens its full timeline. */
export function RideHistory() {
  const zoneName = useZoneName();
  const history = useQuery({
    queryKey: keys.rideHistory,
    queryFn: () => api.listRides('history'),
    select: (data) => data.rides,
  });

  if (history.isPending) return <Loading label="Loading your rides…" />;
  if (history.isError) {
    return <QueryError error={history.error} onRetry={() => history.refetch()} />;
  }
  if (history.data.length === 0) {
    return (
      <EmptyState title="No past rides yet.">
        Your finished and cancelled rides will appear here.
      </EmptyState>
    );
  }

  return (
    <ul className="space-y-3">
      {history.data.map((ride) => (
        <li key={ride.id}>
          <Link
            href={`/passenger/rides/${ride.id}`}
            className="flex items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-4 shadow-sm hover:border-brand-500"
          >
            <div>
              <p className="font-medium">
                {zoneName(ride.pickupZone)} → {zoneName(ride.dropoffZone)}
              </p>
              <p className="text-sm text-stone-500">
                {dhakaDateTime(ride.requestedAt)} · {ride.seats}{' '}
                {ride.seats === 1 ? 'seat' : 'seats'}
              </p>
            </div>
            <div className="text-right">
              {ride.status === 'COMPLETED' ? (
                <p className="font-semibold">
                  {taka(ride.fare.finalPaisa ?? ride.fare.estimatedPaisa)}
                </p>
              ) : (
                <p className="text-sm text-stone-500">Cancelled</p>
              )}
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
