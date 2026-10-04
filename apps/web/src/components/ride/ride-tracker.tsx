'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner, Loading, QueryError } from '@/components/ui/feedback';
import { api, messageOf } from '@/lib/api';
import { taka } from '@/lib/format';
import { canCancelRide, isFinalRide, keys, useZoneName } from '@/lib/queries';
import type { RideDetail } from '@/lib/types';
import { RideTimeline } from './ride-timeline';
import { StatusStepper } from './status-stepper';

const POLL_EVERY_MS = 3_000;

/**
 * One ride, kept up to date: asks the API for it every 3 seconds until it is completed or cancelled.
 * Polling is simple and works on any host; push updates (SSE/WebSockets) are a documented next step.
 */
export function RideTracker({ rideId, onDone }: { rideId: string; onDone?: () => void }) {
  const queryClient = useQueryClient();
  const zoneName = useZoneName();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const query = useQuery({
    queryKey: keys.ride(rideId),
    queryFn: () => api.getRide(rideId),
    select: (data) => data.ride,
    refetchInterval: (q) =>
      q.state.data && isFinalRide(q.state.data.ride.status) ? false : POLL_EVERY_MS,
  });

  const cancel = useMutation({
    mutationFn: () => api.cancelRide(rideId),
    onSuccess: (data) => {
      queryClient.setQueryData(keys.ride(rideId), data);
      setConfirmingCancel(false);
    },
  });

  if (query.isPending) return <Loading label="Loading your ride…" />;
  if (query.isError) {
    return <QueryError error={query.error} onRetry={() => query.refetch()} />;
  }

  const ride = query.data;
  return (
    <>
      <Card className="space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">
            {zoneName(ride.pickupZone)} → {zoneName(ride.dropoffZone)}
          </h1>
          <p className="text-sm text-stone-500">
            {ride.seats} {ride.seats === 1 ? 'seat' : 'seats'} · {ride.distanceKm} km · cash
          </p>
        </div>

        <StatusStepper status={ride.status} />

        <div>
          <p className="text-lg font-medium">{headline(ride, zoneName)}</p>
          {ride.pool && !isFinalRide(ride.status) && (
            <p className="text-sm text-stone-600">
              {ride.pool.coRiders === 0
                ? 'Nobody else is sharing yet.'
                : `Sharing with ${ride.pool.coRiders} other ${ride.pool.coRiders === 1 ? 'passenger' : 'passengers'}.`}{' '}
              {ride.pool.seatsLeft} {ride.pool.seatsLeft === 1 ? 'seat' : 'seats'} left.
            </p>
          )}
        </div>

        <FareLine ride={ride} />

        {cancel.isError && <ErrorBanner message={messageOf(cancel.error)} />}
        {canCancelRide(ride.status) &&
          (confirmingCancel ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm">Cancel this ride?</span>
              <Button
                variant="danger"
                size="sm"
                loading={cancel.isPending}
                onClick={() => cancel.mutate()}
              >
                Yes, cancel
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setConfirmingCancel(false)}>
                Keep my ride
              </Button>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setConfirmingCancel(true)}>
              Cancel ride
            </Button>
          ))}
        {isFinalRide(ride.status) && onDone && <Button onClick={onDone}>Book another ride</Button>}
      </Card>

      <Card>
        <h2 className="mb-3 font-semibold">What happened</h2>
        <RideTimeline ride={ride} zoneName={zoneName} />
      </Card>
    </>
  );
}

function headline(ride: RideDetail, zoneName: (code: string) => string) {
  const tesla = ride.pool?.vehicleName ?? 'Your Tesla';
  switch (ride.status) {
    case 'REQUESTED':
      return `Looking for a Tesla at ${zoneName(ride.pickupZone)}…`;
    case 'MATCHED':
      return `Matched with ${tesla}: ${ride.pool?.driverName ?? 'your driver'} is on the way.`;
    case 'DRIVER_ARRIVED':
      return `${tesla} is at ${zoneName(ride.pickupZone)}. Hop in!`;
    case 'STARTED':
      return `On the way to ${zoneName(ride.dropoffZone)}.`;
    case 'COMPLETED':
      return `Arrived at ${zoneName(ride.dropoffZone)}.`;
    case 'CANCELLED':
      return 'Ride cancelled.';
  }
}

/** Before the trip starts the fare is a range; once it starts it is final (decided by who is aboard). */
function FareLine({ ride }: { ride: RideDetail }) {
  const { fare } = ride;
  if (ride.status === 'CANCELLED') return <p className="text-sm text-stone-600">Nothing to pay.</p>;

  if (fare.finalPaisa === null) {
    return (
      <p className="text-sm">
        Fare: <strong>{taka(fare.estimatedPaisa)}</strong> at most ·{' '}
        <strong className="text-brand-700">{taka(fare.pooledPaisa)}</strong> if the trip starts
        shared
      </p>
    );
  }
  return (
    <p className="text-sm">
      {ride.status === 'COMPLETED' ? 'Paid in cash: ' : 'Fare: '}
      <strong>{taka(fare.finalPaisa)}</strong>
      {fare.discountPaisa ? ` (shared trip: ${taka(fare.discountPaisa)} off)` : ''}
    </p>
  );
}
