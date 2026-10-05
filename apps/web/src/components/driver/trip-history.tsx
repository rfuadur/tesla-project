'use client';

import { useQuery } from '@tanstack/react-query';
import { EmptyState, Loading, QueryError } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { dhakaDateTime, taka } from '@/lib/format';
import { keys, useZoneName } from '@/lib/queries';

/** Jashim's finished trips, newest first: who rode, where to, and what he collected. */
export function TripHistory() {
  const zoneName = useZoneName();
  const history = useQuery({
    queryKey: keys.driverHistory,
    queryFn: api.driverHistory,
    select: (data) => data.pools,
  });

  if (history.isPending) return <Loading label="Loading your trips…" />;
  if (history.isError) {
    return <QueryError error={history.error} onRetry={() => history.refetch()} />;
  }
  if (history.data.length === 0) {
    return (
      <EmptyState title="No finished trips yet.">Completed trips will appear here.</EmptyState>
    );
  }

  return (
    <ul className="space-y-3">
      {history.data.map((trip) => {
        const riders = trip.riders.filter((rider) => rider.status === 'COMPLETED');
        return (
          <li key={trip.id} className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium">
                From {zoneName(trip.pickupZone)} · {dhakaDateTime(trip.acceptedAt)}
              </p>
              {trip.status === 'COMPLETED' ? (
                <p className="font-semibold">{taka(trip.collectedPaisa)} collected</p>
              ) : (
                <p className="text-sm text-stone-500">Cancelled (every rider cancelled)</p>
              )}
            </div>
            {riders.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-stone-600">
                {riders.map((rider) => (
                  <li key={rider.rideId}>
                    {rider.passengerName} → {zoneName(rider.dropoffZone)} ·{' '}
                    {taka(rider.fare.finalPaisa ?? rider.fare.estimatedPaisa)}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
