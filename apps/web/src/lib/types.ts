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
