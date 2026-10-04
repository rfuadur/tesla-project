// The shapes the API returns (see docs/api.md). Kept by hand in this app; a shared package or types
// generated from an OpenAPI spec would be the next step if the API grew.

export type Role = 'PASSENGER' | 'DRIVER';

export interface PublicUser {
  id: string;
  role: Role;
  fullName: string;
  email: string;
  phone: string | null;
}

export interface Vehicle {
  id: string;
  name: string;
  capacity: number;
  isOnline: boolean;
  currentZone: string | null;
}

export interface CurrentUser extends PublicUser {
  vehicle: Vehicle | null;
}

export type RideStatus =
  'REQUESTED' | 'MATCHED' | 'DRIVER_ARRIVED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';

export type PoolStatus = 'ACCEPTED' | 'DRIVER_ARRIVED' | 'STARTED' | 'COMPLETED' | 'CANCELLED';

export interface Zone {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

/** Money is always in paisa (1 taka = 100 paisa); lib/format.ts turns it into taka for display. */
export interface FareQuote {
  ruleVersion: string;
  distanceKm: number;
  seats: number;
  baseFarePaisa: number;
  distanceChargePaisa: number;
  subtotalPaisa: number;
  poolDiscountPaisa: number;
  totalPaisa: number;
}

export interface FareEstimate {
  pickupZone: string;
  dropoffZone: string;
  distanceKm: number;
  seats: number;
  solo: FareQuote;
  pooled: FareQuote;
}

export interface RideFare {
  ruleVersion: string;
  estimatedPaisa: number; // solo: the most this ride can cost
  pooledPaisa: number; // if the trip starts shared
  discountPaisa: number | null; // decided when the trip starts
  finalPaisa: number | null;
}

/** What a passenger may know about their Tesla: never who the other riders are. */
export interface RidePool {
  status: PoolStatus;
  vehicleName: string | null;
  driverName: string | null;
  coRiders: number;
  seatsLeft: number;
}

export interface Ride {
  id: string;
  status: RideStatus;
  pickupZone: string;
  dropoffZone: string;
  seats: number;
  paymentMethod: 'CASH' | 'TESLAPAY';
  distanceKm: number;
  fare: RideFare;
  pool: RidePool | null;
  requestedAt: string;
  matchedAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
}

export interface TimelineEvent {
  type: string;
  fromStatus: string | null;
  toStatus: string | null;
  by: 'PASSENGER' | 'DRIVER' | 'SYSTEM';
  at: string;
  details: Record<string, unknown>;
}

export interface RideDetail extends Ride {
  timeline: TimelineEvent[];
}
