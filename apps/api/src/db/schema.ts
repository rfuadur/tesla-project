import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { POOL_STATUSES, RIDE_STATUSES } from '../domain/lifecycle.js';

// The database schema: every table, constraint and index from docs/database.md.
// `drizzle-kit generate` turns this file into the SQL migrations in ../../drizzle.

export const userRole = pgEnum('user_role', ['PASSENGER', 'DRIVER']);
// Status values come from the domain's state machines, so they are defined in one place only.
export const rideStatus = pgEnum('ride_status', RIDE_STATUSES);
export const poolStatus = pgEnum('pool_status', POOL_STATUSES);
export const paymentMethod = pgEnum('payment_method', ['CASH', 'TESLAPAY']);

// All timestamps are stored with time zone (UTC inside Postgres).
const timestamptz = (name: string) => timestamp(name, { withTimezone: true });

export const zones = pgTable('zones', {
  code: text('code').primaryKey(),
  name: text('name').notNull().unique(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
});

export const users = pgTable(
  'users',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    role: userRole('role').notNull(),
    fullName: text('full_name').notNull(),
    email: text('email').notNull().unique(),
    phone: text('phone').unique(),
    passwordHash: text('password_hash').notNull(),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check('users_email_lowercase', sql`${t.email} = lower(${t.email})`),
    check('users_full_name_length', sql`char_length(${t.fullName}) BETWEEN 1 AND 80`),
  ],
);

export const vehicles = pgTable(
  'vehicles',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    driverId: uuid('driver_id')
      .notNull()
      .unique() // one Tesla per driver
      .references(() => users.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    capacity: smallint('capacity').notNull(),
    isOnline: boolean('is_online').notNull().default(false),
    currentZoneCode: text('current_zone_code').references(() => zones.code, {
      onDelete: 'restrict',
    }),
    updatedAt: timestamptz('updated_at').notNull().defaultNow(),
  },
  (t) => [
    check('vehicles_capacity_range', sql`${t.capacity} BETWEEN 1 AND 6`),
    check('vehicles_online_needs_zone', sql`NOT ${t.isOnline} OR ${t.currentZoneCode} IS NOT NULL`),
  ],
);

export const pools = pgTable(
  'pools',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    vehicleId: uuid('vehicle_id')
      .notNull()
      .references(() => vehicles.id, { onDelete: 'restrict' }),
    pickupZoneCode: text('pickup_zone_code')
      .notNull()
      .references(() => zones.code, { onDelete: 'restrict' }),
    status: poolStatus('status').notNull().default('ACCEPTED'),
    // Copied from the vehicle when the pool is created, because a CHECK constraint can only see its own row.
    capacity: smallint('capacity').notNull(),
    seatsTaken: smallint('seats_taken').notNull().default(0),
    acceptedAt: timestamptz('accepted_at').notNull().defaultNow(),
    arrivedAt: timestamptz('arrived_at'),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    cancelledAt: timestamptz('cancelled_at'),
  },
  (t) => [
    check('pools_capacity_positive', sql`${t.capacity} > 0`),
    // The capacity rule, enforced by the database itself: Bullet can never be oversold.
    check('pools_seats_within_capacity', sql`${t.seatsTaken} BETWEEN 0 AND ${t.capacity}`),
    uniqueIndex('pools_one_active_per_vehicle')
      .on(t.vehicleId)
      .where(sql`${t.status} IN ('ACCEPTED', 'DRIVER_ARRIVED', 'STARTED')`),
    index('pools_joinable_by_pickup')
      .on(t.pickupZoneCode, t.acceptedAt)
      .where(sql`${t.status} IN ('ACCEPTED', 'DRIVER_ARRIVED')`),
    index('pools_vehicle_history').on(t.vehicleId, t.acceptedAt.desc()),
  ],
);

export const rideRequests = pgTable(
  'ride_requests',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    passengerId: uuid('passenger_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    // Pool membership: null while REQUESTED, set when the ride joins a pool.
    poolId: uuid('pool_id').references(() => pools.id, { onDelete: 'restrict' }),
    pickupZoneCode: text('pickup_zone_code')
      .notNull()
      .references(() => zones.code, { onDelete: 'restrict' }),
    dropoffZoneCode: text('dropoff_zone_code')
      .notNull()
      .references(() => zones.code, { onDelete: 'restrict' }),
    seats: smallint('seats').notNull(),
    status: rideStatus('status').notNull().default('REQUESTED'),
    paymentMethod: paymentMethod('payment_method').notNull().default('CASH'),
    // Fare snapshot, all money in integer paisa (see docs/domain.md).
    distanceKm: smallint('distance_km').notNull(),
    fareRuleVersion: text('fare_rule_version').notNull(),
    estimatedFarePaisa: integer('estimated_fare_paisa').notNull(),
    poolDiscountPaisa: integer('pool_discount_paisa'), // set when the trip starts
    finalFarePaisa: integer('final_fare_paisa').generatedAlwaysAs(
      sql`estimated_fare_paisa - pool_discount_paisa`,
    ),
    cancelReason: text('cancel_reason'),
    requestedAt: timestamptz('requested_at').notNull().defaultNow(),
    matchedAt: timestamptz('matched_at'),
    startedAt: timestamptz('started_at'),
    completedAt: timestamptz('completed_at'),
    cancelledAt: timestamptz('cancelled_at'),
  },
  (t) => [
    check('ride_requests_seats_range', sql`${t.seats} BETWEEN 1 AND 6`),
    check('ride_requests_distinct_zones', sql`${t.dropoffZoneCode} <> ${t.pickupZoneCode}`),
    check('ride_requests_distance_positive', sql`${t.distanceKm} > 0`),
    check('ride_requests_estimate_non_negative', sql`${t.estimatedFarePaisa} >= 0`),
    check(
      'ride_requests_discount_within_estimate',
      sql`${t.poolDiscountPaisa} BETWEEN 0 AND ${t.estimatedFarePaisa}`,
    ),
    // A waiting ride never has a pool; a matched one always does.
    check(
      'ride_requests_status_matches_pool',
      sql`(${t.status} = 'REQUESTED' AND ${t.poolId} IS NULL)
        OR (${t.status} IN ('MATCHED', 'DRIVER_ARRIVED', 'STARTED', 'COMPLETED') AND ${t.poolId} IS NOT NULL)
        OR ${t.status} = 'CANCELLED'`,
    ),
    uniqueIndex('ride_requests_one_active_per_passenger')
      .on(t.passengerId)
      .where(sql`${t.status} IN ('REQUESTED', 'MATCHED', 'DRIVER_ARRIVED', 'STARTED')`),
    index('ride_requests_waiting_by_pickup')
      .on(t.pickupZoneCode, t.requestedAt)
      .where(sql`${t.status} = 'REQUESTED'`),
    index('ride_requests_by_pool').on(t.poolId),
    index('ride_requests_passenger_history').on(t.passengerId, t.requestedAt.desc()),
  ],
);

// Append-only history: who did what, when, and from which status to which.
export const rideEvents = pgTable(
  'ride_events',
  {
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    rideRequestId: uuid('ride_request_id').references(() => rideRequests.id, {
      onDelete: 'restrict',
    }),
    poolId: uuid('pool_id').references(() => pools.id, { onDelete: 'restrict' }),
    actorUserId: uuid('actor_user_id').references(() => users.id, { onDelete: 'restrict' }), // null = system
    type: text('type').notNull(),
    fromStatus: text('from_status'),
    toStatus: text('to_status'),
    details: jsonb('details').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => [
    check(
      'ride_events_has_subject',
      sql`${t.rideRequestId} IS NOT NULL OR ${t.poolId} IS NOT NULL`,
    ),
    index('ride_events_ride_timeline').on(t.rideRequestId, t.id),
    index('ride_events_pool_timeline').on(t.poolId, t.id),
  ],
);

export const payments = pgTable(
  'payments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rideRequestId: uuid('ride_request_id')
      .notNull()
      .unique() // one payment per ride
      .references(() => rideRequests.id, { onDelete: 'restrict' }),
    method: paymentMethod('method').notNull(),
    amountPaisa: integer('amount_paisa').notNull(),
    paidAt: timestamptz('paid_at').notNull().defaultNow(),
  },
  (t) => [check('payments_amount_non_negative', sql`${t.amountPaisa} >= 0`)],
);
