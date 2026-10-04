import type { CurrentUser, FareEstimate, PublicUser, Ride, RideDetail, Zone } from './types';

// The browser's client for the Express API. Every call goes to /api/v1/… on THIS origin; Next.js
// forwards it to the API (next.config.ts), so the HttpOnly session cookie travels along automatically.

export interface FieldIssue {
  path: string;
  message: string;
}

/** An error answer from the API, in its standard shape: { error: { code, message, details? } }. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: FieldIssue[];

  constructor(status: number, code: string, message: string, details?: FieldIssue[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(
  method: 'GET' | 'POST' | 'PATCH',
  path: string,
  body?: unknown,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(
      0,
      'NETWORK_ERROR',
      'Could not reach Dhaka Tesla Pool. Check your connection.',
    );
  }

  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as {
    error?: { code?: string; message?: string; details?: FieldIssue[] };
  } | null;

  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? 'UNKNOWN',
      data?.error?.message ?? 'Something went wrong. Please try again.',
      data?.error?.details,
    );
  }
  return data as T;
}

export const api = {
  login: (email: string, password: string) =>
    request<{ user: PublicUser }>('POST', '/auth/login', { email, password }),
  register: (input: { fullName: string; email: string; password: string; phone?: string }) =>
    request<{ user: PublicUser }>('POST', '/auth/register', input),
  logout: () => request<void>('POST', '/auth/logout'),
  me: () => request<{ user: CurrentUser }>('GET', '/auth/me'),

  zones: () => request<{ zones: Zone[] }>('GET', '/zones'),
  estimate: (pickup: string, dropoff: string, seats: number) =>
    request<{ estimate: FareEstimate }>(
      'GET',
      `/fares/estimate?${new URLSearchParams({ pickup, dropoff, seats: String(seats) })}`,
    ),

  bookRide: (input: { pickupZone: string; dropoffZone: string; seats: number }) =>
    request<{ ride: RideDetail }>('POST', '/rides', input),
  listRides: (scope: 'active' | 'history') =>
    request<{ rides: Ride[] }>('GET', `/rides?scope=${scope}`),
  getRide: (rideId: string) => request<{ ride: RideDetail }>('GET', `/rides/${rideId}`),
  cancelRide: (rideId: string) =>
    request<{ ride: RideDetail }>('POST', `/rides/${rideId}/cancel`, {}),
};

/**
 * Worth trying again? Network failures and server errors (5xx) may pass on a retry; a 4xx answer
 * ("not found", "not allowed", "invalid") will give the same result every time.
 */
export const isRetryable = (error: unknown) =>
  !(error instanceof ApiError && error.status >= 400 && error.status < 500);

/** A message fit to show a person, whatever went wrong. */
export function messageOf(error: unknown): string {
  return error instanceof ApiError ? error.message : 'Something went wrong. Please try again.';
}

/** Per-field messages from a 400 VALIDATION_ERROR, keyed by field name (e.g. { email: "…" }). */
export function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError) || error.code !== 'VALIDATION_ERROR' || !error.details)
    return {};
  return Object.fromEntries(error.details.map((issue) => [issue.path, issue.message]));
}
