import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import type { RideStatus } from './types';

// Query keys in one place, so screens refresh each other's data reliably.
// Invalidating ['rides'] refreshes the active ride, the history and every ride detail at once.
export const keys = {
  zones: ['zones'] as const,
  activeRides: ['rides', 'active'] as const,
  rideHistory: ['rides', 'history'] as const,
  ride: (rideId: string) => ['rides', 'detail', rideId] as const,
};

/** The 10 zones never change while the app runs, so they are fetched once. */
export function useZones() {
  return useQuery({
    queryKey: keys.zones,
    queryFn: api.zones,
    staleTime: Infinity,
    select: (data) => data.zones,
  });
}

/** "MOHAKHALI" → "Mohakhali" (falls back to the code until the zones have loaded). */
export function useZoneName() {
  const { data: zones } = useZones();
  return (code: string) => zones?.find((zone) => zone.code === code)?.name ?? code;
}

/** Same rules as the API's state machine (apps/api/src/domain/lifecycle.ts). */
export const isFinalRide = (status: RideStatus) => status === 'COMPLETED' || status === 'CANCELLED';
export const canCancelRide = (status: RideStatus) =>
  status === 'REQUESTED' || status === 'MATCHED' || status === 'DRIVER_ARRIVED';
