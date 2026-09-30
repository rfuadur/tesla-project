import { asc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/client.js';
import { rideEvents, users } from '../../db/schema.js';

// The append-only history behind "explain exactly what happened" (docs/domain.md, docs/database.md).
// Status columns say where a ride is now; these events say how it got there, when, and who did it.
// Rows are only ever inserted: never updated, never deleted.

export type EventType =
  | 'RIDE_REQUESTED'
  | 'RIDE_MATCHED'
  | 'SEAT_CLAIM_REJECTED'
  | 'POOL_CREATED'
  | 'DRIVER_ARRIVED'
  | 'TRIP_STARTED'
  | 'DROPPED_OFF'
  | 'RIDE_CANCELLED'
  | 'POOL_CANCELLED'
  | 'POOL_COMPLETED';

export interface NewEvent {
  type: EventType;
  rideRequestId?: string;
  poolId?: string;
  actorUserId?: string | null; // null / missing = the system did it
  fromStatus?: string | null;
  toStatus?: string | null;
  /** Shown to the ride's passenger, so never put other passengers' details in here. */
  details?: Record<string, unknown>;
}

/** Writes one history row. Pass the open transaction so the event commits (or rolls back) with the change. */
export async function recordEvent(tx: DbOrTx, event: NewEvent): Promise<void> {
  await tx.insert(rideEvents).values({
    type: event.type,
    rideRequestId: event.rideRequestId,
    poolId: event.poolId,
    actorUserId: event.actorUserId ?? null,
    fromStatus: event.fromStatus ?? null,
    toStatus: event.toStatus ?? null,
    details: event.details ?? {},
  });
}

/** A ride's history in order: what happened, from which status to which, who did it, and when. */
export async function rideTimeline(tx: DbOrTx, rideRequestId: string) {
  const rows = await tx
    .select({ event: rideEvents, actorRole: users.role })
    .from(rideEvents)
    .leftJoin(users, eq(users.id, rideEvents.actorUserId))
    .where(eq(rideEvents.rideRequestId, rideRequestId))
    .orderBy(asc(rideEvents.id));

  return rows.map(({ event, actorRole }) => ({
    type: event.type,
    fromStatus: event.fromStatus,
    toStatus: event.toStatus,
    by: actorRole ?? 'SYSTEM',
    at: event.createdAt,
    details: event.details,
  }));
}
