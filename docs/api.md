# API

## Style
- **REST over JSON.** There are two small clients (passenger and driver screens) with simple, fixed data shapes. REST maps
  cleanly onto resources and HTTP status codes, and is easy to test with Supertest or curl. GraphQL pays off when many
  different clients need flexible data shapes, which is not the case here. We would switch if mobile apps and partners
  needed very different views of the same data.
- **Status changes are commands:** `POST /rides/:id/cancel`, not `PATCH { status }`. Each transition has its own
  permissions, guards and side effects, so a dedicated endpoint is easier to validate, authorize, log and test.
- **Versioned** under `/api/v1` from day one.

## Authentication and authorization
- Passengers register themselves. Drivers are onboarded by operations (seeded) and only sign in.
- Signing in sets an **HttpOnly, SameSite=Lax cookie** holding a signed JWT (user id + role, 24 h expiry); `Secure` in production.
- `requireAuth` verifies the token; `requireRole` checks PASSENGER or DRIVER.
- **Ownership is checked in the query itself** (`WHERE id = $rideId AND passenger_id = $me`). Someone else's ride answers
  **404**, exactly like a ride that doesn't exist, so ids can't be probed.

## Endpoints

| Method and path | Who | Purpose |
|---|---|---|
| `POST /api/v1/auth/register` | public | passenger sign-up → 201 + session cookie |
| `POST /api/v1/auth/login` | public | passenger or driver sign-in → session cookie |
| `POST /api/v1/auth/logout` | signed in | clear the cookie → 204 |
| `GET /api/v1/auth/me` | signed in | current user, plus their Tesla for drivers |
| `GET /api/v1/zones` | public | the zone list |
| `GET /api/v1/fares/estimate?pickup=&dropoff=&seats=` | public | solo and pooled fare with breakdown |
| `POST /api/v1/rides` | passenger | book a ride (tries to auto-join an open pool) → 201 |
| `GET /api/v1/rides?scope=active\|history` | passenger | own rides |
| `GET /api/v1/rides/:rideId` | passenger (owner) | ride details + timeline |
| `POST /api/v1/rides/:rideId/cancel` | passenger (owner) | cancel while allowed |
| `PATCH /api/v1/driver/availability` | driver | go online/offline, set current zone: `{ online, zone }` |
| `GET /api/v1/driver/requests` | driver | relevant waiting rides |
| `POST /api/v1/driver/requests/:rideId/accept` | driver | add the ride to the current pool (creates the pool if none) |
| `GET /api/v1/driver/pool` | driver | current pool with its riders, or null |
| `GET /api/v1/driver/pools?scope=history` | driver | past pools |
| `POST /api/v1/pools/:poolId/arrive` | driver (owner) | mark arrival at the pickup |
| `POST /api/v1/pools/:poolId/start` | driver (owner) | start the trip; fares are locked |
| `POST /api/v1/pools/:poolId/rides/:rideId/drop-off` | driver (owner) | drop one passenger off |
| `GET /health` | public | `{ status, db }` for Docker and hosting health checks |

## Example: Rafiq books at 8:43 (Dhaka time, UTC+6)
```http
POST /api/v1/rides
Content-Type: application/json

{ "pickupZone": "BANANI", "dropoffZone": "GULSHAN_1", "seats": 1, "paymentMethod": "CASH" }
```
```json
201 Created
{
  "ride": {
    "id": "8f0c2d1e-…",
    "status": "MATCHED",
    "pickupZone": "BANANI",
    "dropoffZone": "GULSHAN_1",
    "seats": 1,
    "fare": { "estimatedPaisa": 12000, "pooledPaisa": 9000, "finalPaisa": null, "ruleVersion": "v1" },
    "pool": { "vehicleName": "Bullet", "driverName": "Jashim", "status": "ACCEPTED", "coRiders": 1, "seatsLeft": 1 },
    "requestedAt": "2026-09-24T02:43:10Z"
  }
}
```
Rafiq sees how many people share his Tesla, but never their names or fares.

## Errors
Every error has the same shape:
```json
{ "error": { "code": "POOL_FULL", "message": "Bullet has no free seats left.", "requestId": "…" } }
```

| HTTP | Codes |
|---|---|
| 400 | `VALIDATION_ERROR` (with field details) |
| 401 | `UNAUTHENTICATED`, `INVALID_CREDENTIALS` |
| 403 | `FORBIDDEN` (wrong role) |
| 404 | `NOT_FOUND` (also returned for someone else's ride) |
| 409 | `ACTIVE_RIDE_EXISTS`, `INVALID_TRANSITION`, `POOL_FULL`, `NOT_COMPATIBLE`, `RIDE_NOT_AVAILABLE`, `DRIVER_OFFLINE`, `WRONG_ZONE`, `ACTIVE_POOL_EXISTS`, `EMAIL_TAKEN` |
| 429 | `RATE_LIMITED` |
| 500 | `INTERNAL_ERROR` (generic message; details only in the logs, linked by `requestId`) |
