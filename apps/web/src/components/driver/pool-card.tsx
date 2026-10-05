'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/feedback';
import { api, messageOf } from '@/lib/api';
import { taka } from '@/lib/format';
import { keys, useZoneName } from '@/lib/queries';
import type { DriverPool, PoolRider } from '@/lib/types';
import { SeatMeter } from './seat-meter';

const STATUS_TEXT: Record<DriverPool['status'], string> = {
  ACCEPTED: 'Heading to the pickup',
  DRIVER_ARRIVED: 'Waiting at the pickup',
  STARTED: 'On the road',
  COMPLETED: 'Finished',
  CANCELLED: 'Cancelled',
};

/**
 * Bullet's current trip: who is aboard, where each is going, what each pays, and the one next step.
 * Every button calls the API; the server decides whether the step is allowed (state machine, ownership).
 */
export function PoolCard({
  pool,
  onFinished,
}: {
  pool: DriverPool;
  onFinished: (trip: DriverPool) => void;
}) {
  const queryClient = useQueryClient();
  const zoneName = useZoneName();

  const afterStep = ({ pool: updated }: { pool: DriverPool }) => {
    if (updated.status === 'COMPLETED' || updated.status === 'CANCELLED') {
      queryClient.setQueryData(keys.driverPool, { pool: null });
      queryClient.invalidateQueries({ queryKey: keys.driverHistory });
      onFinished(updated);
    } else {
      queryClient.setQueryData(keys.driverPool, { pool: updated });
    }
    queryClient.invalidateQueries({ queryKey: keys.driverRequests });
  };

  const arrive = useMutation({ mutationFn: () => api.markArrived(pool.id), onSuccess: afterStep });
  const start = useMutation({ mutationFn: () => api.startTrip(pool.id), onSuccess: afterStep });
  const dropOff = useMutation({
    mutationFn: (rideId: string) => api.dropOff(pool.id, rideId),
    onSuccess: afterStep,
  });
  const failed = [arrive, start, dropOff].find((step) => step.isError);

  const riders = pool.riders.filter((rider) => rider.status !== 'CANCELLED');
  const pickup = zoneName(pool.pickupZone);

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Current trip from {pickup}</h2>
          <p className="text-sm text-stone-500">{STATUS_TEXT[pool.status]}</p>
        </div>
        <SeatMeter taken={pool.seatsTaken} capacity={pool.capacity} />
      </div>

      <ul className="divide-y divide-stone-100">
        {riders.map((rider) => (
          <li key={rider.rideId} className="flex flex-wrap items-center justify-between gap-3 py-2">
            <div>
              <p className="font-medium">
                {rider.passengerName} → {zoneName(rider.dropoffZone)}
              </p>
              <p className="text-sm text-stone-500">
                {rider.seats} {rider.seats === 1 ? 'seat' : 'seats'} · <RiderFare rider={rider} />
              </p>
            </div>
            {rider.status === 'COMPLETED' ? (
              <span className="text-sm text-brand-700">Dropped off ✓</span>
            ) : pool.status === 'STARTED' ? (
              <Button
                size="sm"
                loading={dropOff.isPending && dropOff.variables === rider.rideId}
                disabled={dropOff.isPending}
                onClick={() => dropOff.mutate(rider.rideId)}
              >
                Drop off at {zoneName(rider.dropoffZone)}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>

      {pool.status === 'STARTED' && pool.dropOffOrder.length > 1 && (
        <p className="text-sm text-stone-600">
          Suggested order: {pool.dropOffOrder.map(zoneName).join(' → ')}
        </p>
      )}

      {pool.status === 'ACCEPTED' && (
        <Button loading={arrive.isPending} onClick={() => arrive.mutate()} className="w-full">
          I’ve arrived at {pickup}
        </Button>
      )}
      {pool.status === 'DRIVER_ARRIVED' && (
        <div className="space-y-2">
          <Button loading={start.isPending} onClick={() => start.mutate()} className="w-full">
            Start trip
          </Button>
          <p className="text-center text-xs text-stone-500">
            Once you start, nobody else can join and fares are decided:
            {riders.length >= 2
              ? ' shared, so everyone gets 25% off.'
              : ' one booking, so no discount.'}
          </p>
        </div>
      )}

      {failed && <ErrorBanner message={messageOf(failed.error)} />}
    </Card>
  );
}

function RiderFare({ rider }: { rider: PoolRider }) {
  const { fare } = rider;
  if (fare.finalPaisa !== null) {
    return (
      <>{rider.status === 'COMPLETED' ? `paid ${taka(fare.finalPaisa)}` : taka(fare.finalPaisa)}</>
    );
  }
  return (
    <>
      {taka(fare.estimatedPaisa)}{' '}
      <span className="text-brand-700">({taka(fare.pooledPaisa)} if shared)</span>
    </>
  );
}
