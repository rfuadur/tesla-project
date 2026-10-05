'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorBanner, Loading, QueryError } from '@/components/ui/feedback';
import { api, messageOf } from '@/lib/api';
import { dhakaTime, taka } from '@/lib/format';
import { keys, useZoneName } from '@/lib/queries';
import type { PoolStatus } from '@/lib/types';

const POLL_EVERY_MS = 3_000;

/**
 * Riders waiting in Jashim's zone that would fit Bullet right now (the API applies the matching rule).
 * Refreshed every 3 seconds; if another driver takes a ride first, accepting it fails politely.
 */
export function WaitingRiders({ zone, poolStatus }: { zone: string; poolStatus?: PoolStatus }) {
  const queryClient = useQueryClient();
  const zoneName = useZoneName();
  const onTheRoad = poolStatus === 'STARTED';

  const requests = useQuery({
    queryKey: keys.driverRequests,
    queryFn: api.driverRequests,
    select: (data) => data.requests,
    enabled: !onTheRoad,
    refetchInterval: POLL_EVERY_MS,
  });

  const accept = useMutation({
    mutationFn: (rideId: string) => api.acceptRide(rideId),
    onSuccess: ({ pool }) => queryClient.setQueryData(keys.driverPool, { pool }),
    // Success or not (e.g. someone else took the ride), the list is out of date now.
    onSettled: () => queryClient.invalidateQueries({ queryKey: keys.driverRequests }),
  });

  if (onTheRoad) {
    return (
      <EmptyState title="You’re on the road.">Finish this trip to take new riders.</EmptyState>
    );
  }

  return (
    <Card className="space-y-3">
      <h2 className="text-lg font-semibold">
        {poolStatus ? 'Riders who fit this trip' : `Riders waiting at ${zoneName(zone)}`}
      </h2>
      {accept.isError && <ErrorBanner message={messageOf(accept.error)} />}

      {requests.isPending ? (
        <Loading label="Looking for riders…" />
      ) : requests.isError ? (
        <QueryError error={requests.error} onRetry={() => requests.refetch()} />
      ) : requests.data.length === 0 ? (
        <EmptyState title="Nobody waiting right now.">
          New bookings appear here by themselves.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-stone-100">
          {requests.data.map((request) => (
            <li
              key={request.rideId}
              className="flex flex-wrap items-center justify-between gap-3 py-2"
            >
              <div>
                <p className="font-medium">
                  {request.passengerName} → {zoneName(request.dropoffZone)}
                </p>
                <p className="text-sm text-stone-500">
                  {request.seats} {request.seats === 1 ? 'seat' : 'seats'} · {request.distanceKm} km
                  · {taka(request.fare.estimatedPaisa)} ({taka(request.fare.pooledPaisa)} if shared)
                  · waiting since {dhakaTime(request.requestedAt)}
                </p>
              </div>
              <Button
                size="sm"
                loading={accept.isPending && accept.variables === request.rideId}
                disabled={accept.isPending}
                onClick={() => accept.mutate(request.rideId)}
              >
                Accept
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
