'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';
import { EmptyState, Loading, QueryError } from '@/components/ui/feedback';
import { api } from '@/lib/api';
import { taka } from '@/lib/format';
import { keys } from '@/lib/queries';
import type { CurrentUser, DriverPool } from '@/lib/types';
import { AvailabilityCard } from './availability-card';
import { PoolCard } from './pool-card';
import { WaitingRiders } from './waiting-riders';

const POLL_EVERY_MS = 3_000;

/** Jashim's screen: availability, the current trip (if any), and riders he could take. */
export function DriverDashboard({ initialUser }: { initialUser: CurrentUser }) {
  // The server already knows who he is; the query keeps Bullet's online status fresh after changes.
  const me = useQuery({
    queryKey: keys.me,
    queryFn: api.me,
    initialData: { user: initialUser },
    select: (data) => data.user,
  });
  const vehicle = me.data.vehicle;

  // The current trip changes from the outside too (auto-joined riders, cancellations), so it is polled.
  const pool = useQuery({
    queryKey: keys.driverPool,
    queryFn: api.driverPool,
    select: (data) => data.pool,
    refetchInterval: vehicle?.isOnline ? POLL_EVERY_MS : false,
  });
  const [finishedTrip, setFinishedTrip] = useState<DriverPool | null>(null);

  if (!vehicle) {
    return <EmptyState title="No Tesla is registered to your account." />;
  }

  return (
    <>
      <AvailabilityCard vehicle={vehicle} onTrip={Boolean(pool.data)} />

      {finishedTrip && !pool.data && (
        <p role="status" className="rounded-lg bg-brand-50 px-4 py-3 text-sm text-brand-700">
          Trip finished: you collected {taka(finishedTrip.collectedPaisa)}.{' '}
          <Link href="/driver/history" className="font-medium underline">
            See your trips
          </Link>
        </p>
      )}

      {pool.isPending ? (
        <Loading label="Checking your current trip…" />
      ) : pool.isError ? (
        <QueryError error={pool.error} onRetry={() => pool.refetch()} />
      ) : pool.data ? (
        <PoolCard pool={pool.data} onFinished={setFinishedTrip} />
      ) : null}

      {vehicle.isOnline ? (
        <WaitingRiders zone={vehicle.currentZone ?? ''} poolStatus={pool.data?.status} />
      ) : (
        <EmptyState title="You’re offline.">
          Go online to see riders waiting in your zone.
        </EmptyState>
      )}
    </>
  );
}
