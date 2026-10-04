'use client';

import { type UseQueryResult, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ErrorBanner, Loading, QueryError, Spinner } from '@/components/ui/feedback';
import { SelectField } from '@/components/ui/select-field';
import { api, messageOf } from '@/lib/api';
import { taka } from '@/lib/format';
import { keys, useZones } from '@/lib/queries';
import type { FareEstimate } from '@/lib/types';

const SEAT_CHOICES = [1, 2, 3];

/** Pick a trip, see what it will cost, request a Tesla. */
export function BookingForm() {
  const queryClient = useQueryClient();
  const zones = useZones();
  const [pickup, setPickup] = useState('BANANI');
  const [dropoff, setDropoff] = useState('');
  const [seats, setSeats] = useState(1);
  const canQuote = Boolean(pickup && dropoff && pickup !== dropoff);

  // The live price: asked again whenever the trip changes (and remembered for each trip).
  const estimate = useQuery({
    queryKey: ['estimate', pickup, dropoff, seats],
    queryFn: () => api.estimate(pickup, dropoff, seats),
    enabled: canQuote,
    staleTime: Infinity,
    select: (data) => data.estimate,
  });

  const book = useMutation({
    mutationFn: () => api.bookRide({ pickupZone: pickup, dropoffZone: dropoff, seats }),
    onSuccess: ({ ride }) => {
      // Show the new ride at once (it may already be matched, thanks to auto-join).
      queryClient.setQueryData(keys.ride(ride.id), { ride });
      queryClient.setQueryData(keys.activeRides, { rides: [ride] });
    },
  });

  if (zones.isPending) return <Loading label="Loading zones…" />;
  if (zones.isError) {
    return <QueryError error={zones.error} onRetry={() => zones.refetch()} />;
  }

  return (
    <Card>
      <h1 className="mb-4 text-2xl font-semibold">Where to today?</h1>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          book.mutate();
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <SelectField label="Pickup" value={pickup} onChange={(e) => setPickup(e.target.value)}>
            {zones.data.map((zone) => (
              <option key={zone.code} value={zone.code}>
                {zone.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Drop-off"
            value={dropoff}
            onChange={(e) => setDropoff(e.target.value)}
            required
          >
            <option value="" disabled>
              Choose a zone
            </option>
            {zones.data
              .filter((zone) => zone.code !== pickup)
              .map((zone) => (
                <option key={zone.code} value={zone.code}>
                  {zone.name}
                </option>
              ))}
          </SelectField>
        </div>

        <fieldset>
          <legend className="mb-1 text-sm font-medium text-stone-700">Seats</legend>
          <div className="flex gap-2">
            {SEAT_CHOICES.map((n) => (
              <label
                key={n}
                className="cursor-pointer rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm has-checked:border-brand-600 has-checked:bg-brand-50 has-checked:text-brand-700 has-focus-visible:ring-2 has-focus-visible:ring-brand-100"
              >
                <input
                  type="radio"
                  name="seats"
                  value={n}
                  checked={seats === n}
                  onChange={() => setSeats(n)}
                  className="sr-only"
                />
                {n} {n === 1 ? 'seat' : 'seats'}
              </label>
            ))}
          </div>
        </fieldset>

        <FareCard canQuote={canQuote} estimate={estimate} />

        {book.isError && <ErrorBanner message={messageOf(book.error)} />}
        <Button type="submit" loading={book.isPending} disabled={!canQuote} className="w-full">
          Request a Tesla
        </Button>
        <p className="text-center text-xs text-stone-500">Pay in cash when you are dropped off.</p>
      </form>
    </Card>
  );
}

function FareCard({
  canQuote,
  estimate,
}: {
  canQuote: boolean;
  estimate: UseQueryResult<FareEstimate>;
}) {
  if (!canQuote) {
    return <p className="text-sm text-stone-500">Choose where you are going to see the fare.</p>;
  }
  if (estimate.isPending) return <Spinner label="Working out the fare…" />;
  if (estimate.isError) return <ErrorBanner message={messageOf(estimate.error)} />;

  const { solo, pooled, distanceKm } = estimate.data;
  return (
    <div className="rounded-xl bg-brand-50 p-4">
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
        <p>
          <span className="text-2xl font-semibold">{taka(solo.totalPaisa)}</span>{' '}
          <span className="text-sm text-stone-600">solo</span>
        </p>
        <p className="text-brand-700">
          <span className="text-2xl font-semibold">{taka(pooled.totalPaisa)}</span>{' '}
          <span className="text-sm">if shared</span>
        </p>
        <p className="text-sm text-stone-500">{distanceKm} km</p>
      </div>
      <p className="mt-2 text-sm text-stone-600">
        You never pay more than the solo fare. If someone else shares your Tesla when the trip
        starts, you save {taka(pooled.poolDiscountPaisa)}.
      </p>
    </div>
  );
}
