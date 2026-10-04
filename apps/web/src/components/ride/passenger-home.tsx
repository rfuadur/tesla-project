'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Loading, QueryError } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { keys } from '@/lib/queries';
import { BookingForm } from './booking-form';
import { RideTracker } from './ride-tracker';

/** A passenger has at most one active ride: show it if there is one, otherwise the booking form. */
export function PassengerHome() {
  const queryClient = useQueryClient();
  const active = useQuery({
    queryKey: keys.activeRides,
    queryFn: () => api.listRides('active'),
    // Don't swap a just-finished ride for the booking form behind the passenger's back:
    // this list only refreshes when they book, or press "Book another ride".
    refetchOnWindowFocus: false,
  });

  if (active.isPending) return <Loading />;
  if (active.isError) {
    return <QueryError error={active.error} onRetry={() => active.refetch()} />;
  }

  const ride = active.data.rides[0];
  return ride ? (
    <RideTracker
      rideId={ride.id}
      onDone={() => queryClient.invalidateQueries({ queryKey: keys.activeRides })}
    />
  ) : (
    <BookingForm />
  );
}
