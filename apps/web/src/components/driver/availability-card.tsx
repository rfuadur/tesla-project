'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner } from '@/components/ui/feedback';
import { SelectField } from '@/components/ui/select-field';
import { api, messageOf } from '@/lib/api';
import { keys, useZoneName, useZones } from '@/lib/queries';
import type { CurrentUser, Vehicle } from '@/lib/types';

/** The Tesla, and whether Jashim is taking rides: online/offline and the zone he is in. */
export function AvailabilityCard({
  vehicle,
  onTrip,
}: {
  vehicle: Vehicle;
  /** While a trip is running, the API refuses going offline or changing zone. */
  onTrip: boolean;
}) {
  const queryClient = useQueryClient();
  const zones = useZones();
  const zoneName = useZoneName();
  const [zone, setZone] = useState(vehicle.currentZone ?? 'BANANI');

  const availability = useMutation({
    mutationFn: (change: { online: boolean; zone: string }) =>
      api.setAvailability(change.online, change.zone),
    onSuccess: ({ vehicle: updated }) => {
      queryClient.setQueryData<{ user: CurrentUser }>(keys.me, (old) =>
        old ? { user: { ...old.user, vehicle: updated } } : old,
      );
      queryClient.invalidateQueries({ queryKey: keys.driverRequests });
    },
  });

  const changeZone = (next: string) => {
    setZone(next);
    if (vehicle.isOnline) availability.mutate({ online: true, zone: next });
  };

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{vehicle.name}</h1>
          <p className="text-sm text-stone-500">{vehicle.capacity} seats</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-sm font-medium ${vehicle.isOnline ? 'bg-brand-50 text-brand-700' : 'bg-stone-100 text-stone-600'}`}
        >
          {vehicle.isOnline ? `Online at ${zoneName(vehicle.currentZone ?? zone)}` : 'Offline'}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="Your zone"
          value={zone}
          onChange={(event) => changeZone(event.target.value)}
          disabled={onTrip || availability.isPending || !zones.data}
          className="min-w-48"
        >
          {zones.data?.map((z) => (
            <option key={z.code} value={z.code}>
              {z.name}
            </option>
          ))}
        </SelectField>
        {vehicle.isOnline ? (
          <Button
            variant="secondary"
            loading={availability.isPending}
            disabled={onTrip}
            onClick={() => availability.mutate({ online: false, zone })}
          >
            Go offline
          </Button>
        ) : (
          <Button
            loading={availability.isPending}
            onClick={() => availability.mutate({ online: true, zone })}
          >
            Go online
          </Button>
        )}
      </div>
      {onTrip && (
        <p className="text-sm text-stone-500">
          You can change zone or go offline once this trip is finished.
        </p>
      )}
      {availability.isError && <ErrorBanner message={messageOf(availability.error)} />}
    </Card>
  );
}
