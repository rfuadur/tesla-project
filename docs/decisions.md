# Decisions: assumptions, technology choices and trade-offs

## Assumptions
The brief leaves some details open on purpose. Each gap below is filled with an explicit assumption that the code
follows consistently.

| # | Assumption | Why |
|---|---|---|
| A1 | Locations are 10 predefined Dhaka zones; a ride goes from one zone to another, and pickup ≠ drop-off. | Keeps geography simple and every fare hand-checkable. |
| A2 | Distances come from a fixed, symmetric zone-to-zone table in whole km (see `domain.md`). | No map API; an evaluator can verify every number. |
| A3 | A pool has one pickup zone, and all its riders board there. | The story is a single curbside pickup; multi-pickup routing is out of scope. |
| A4 | Matching: same pickup zone, drop-offs within 3 km of every rider aboard, enough free seats, pool not started. | Limits the detour to 3 km per extra stop; consistent regardless of booking order. |
| A5 | Rides are matched either instantly when booked (auto-join) or when an online driver accepts them; both paths use one seat-claim function. | "The app has to figure out, in about a second, whether these two can share." One place to get capacity right. |
| A6 | A driver accepts a trip, not each co-rider: compatible riders join his open pool automatically. | Approving every co-rider while driving would be slow and unsafe. |
| A7 | A pool accepts new riders until it starts. | Everyone boards at the same curb; once moving, there are no more pickups. |
| A8 | A passenger can have only one active ride at a time. | Prevents duplicate bookings, including double clicks. |
| A9 | A booking takes 1–3 seats (a group travelling together), and each seat is charged. | Seats are the scarce resource. |
| A10 | Fare = (৳40 + ৳20/km) × seats, with 25 % off if the pool starts with at least 2 separate bookings. The estimate is the solo fare; the final fare is locked at the start. | Hand-testable; never charges more than the estimate. |
| A11 | Money is stored as integer paisa. | Exact arithmetic (see `domain.md`). |
| A12 | Payment is cash, recorded when the passenger is dropped off. TeslaPay is a next step. | The brief allows cash; it keeps the MVP small. |
| A13 | Passengers can cancel until the trip starts, free of charge; not after it starts. Cancelling frees the seats, and a pool left empty is cancelled. | A clear, testable rule. A late-cancellation fee is a next step. |
| A14 | Drivers are onboarded by operations (seeded), not self-registered. One Tesla per driver, fixed capacity. | The brief lists "sign in" for drivers but no sign-up; real platforms vet drivers. |
| A15 | A driver must be online with a current zone to accept rides, and cannot go offline or change zone while running a pool. | Keeps "relevant requests" meaningful. |
| A16 | "Relevant requests" are waiting rides in the driver's current zone; with an open pool, only those that pass the matching rule and fit his free seats. | Direct reading of "see relevant requests". |
| A17 | Passengers see their own ride, the Tesla and driver, and the number of co-riders, never co-riders' names or fares. The driver sees his riders' names, seats, drop-offs and fares. | "Each passenger needs to see their own fare and their own status, not anyone else's." |
| A18 | Out of scope: driver cancellation, no-show handling, request expiry, ratings, real maps. | Keep the MVP small and correct; all listed as next steps. |
| A19 | Screens update by polling every ~3 s. | Works on any free host with no extra infrastructure. |
| A20 | Times are stored in UTC and shown in Asia/Dhaka. | Avoids timezone bugs. |

## Technology choices

| Area | Pick | Realistic alternatives | Why it fits this MVP | We'd switch when… |
|---|---|---|---|---|
| Language | TypeScript (web and API) | JavaScript | Union types such as `'REQUESTED' \| 'MATCHED'` catch status typos at compile time | — |
| Runtime | Node.js 24 LTS | Node 22, Bun, Deno | Required Node; LTS is stable and supported; same version locally and in Docker | a newer LTS is supported by our dependencies |
| Backend framework | Express 5 | Fastify, NestJS, Hono | Few concepts to learn and explain; huge community; Express 5 passes errors from async handlers to the error middleware; we add our own clear layers | the team grows and needs enforced module boundaries (NestJS), or throughput becomes the bottleneck (Fastify) |
| API style | REST + JSON | GraphQL, tRPC | Two small clients with fixed data shapes | many different clients need different data shapes |
| Validation | Zod 4 | Joi, Yup, class-validator | One schema is both the runtime check and the TypeScript type | moving to an OpenAPI-first or JSON-Schema-based stack |
| Database | PostgreSQL 17 | MySQL, SQLite, MongoDB | Transactions and row locks for the last-seat race; CHECK constraints and partial unique indexes enforce our rules in the database; free managed hosting | — (at scale: read replicas, partitioning, PostGIS) |
| ORM and migrations | Drizzle ORM + drizzle-kit | Prisma, Kysely, Knex, raw SQL | Schema in TypeScript that maps one to one to SQL; readable generated migrations; supports CHECK, partial indexes, generated columns and `FOR UPDATE` directly | a query outgrows the builder (raw SQL), or the team prefers Prisma and rarely needs locks |
| Auth | Email + password, bcrypt, JWT in an HttpOnly cookie | Server sessions, Auth.js, Clerk/Supabase Auth | Few moving parts, fully explainable, no third-party limits; stateless tokens keep the API easy to scale | we need "log out everywhere" or instant bans (sessions / refresh tokens), or social login (Auth.js) |
| Frontend | Next.js 16 (App Router) + React 19 | React + Vite, React Router | Recommended by the brief; rewrites give a same-origin API proxy (first-party cookies, no CORS); easy free deploy | we need a purely static single-page app |
| Server state | TanStack Query | SWR, fetch + useEffect | Loading and error states, retries, polling and cache refresh after changes | — (still used with push updates) |
| Styling | Tailwind CSS 4 | CSS Modules, component libraries | A clean, consistent UI quickly, without designing a CSS architecture | a brand or design system is needed |
| Tests | Vitest + Supertest against a real PostgreSQL | Jest, Testcontainers, Playwright | Fast and TypeScript-native; only a real database can prove locks and constraints | fresh containers per CI run (Testcontainers); UI end-to-end tests (Playwright) |
| Logging | pino + pino-http | winston, morgan | Structured JSON logs with request ids and redaction of secrets | shipping logs to a platform at scale |
| Real-time updates | Polling | Server-Sent Events, WebSockets | Stateless, works on any free host, tiny load | thousands of concurrent riders |
| Containers | Docker Compose: db → migrate → api → web | — | Required; reproducible anywhere | — |
| Hosting | Vercel (web) · Render (API) · Neon (PostgreSQL), all free tiers | Koyeb, a free VM running Compose | No cost; Render runs the same Docker image; Neon's free database doesn't expire | free tiers change or cold starts become unacceptable |

## Key trade-offs
- **Zones instead of real maps:** hand-checkable fares and a consistent matching rule, at the cost of realism.
- **Polling instead of WebSockets:** simpler and host-friendly, at the cost of up to ~3 s of delay.
- **JWT instead of server sessions:** no session store and easy to scale, at the cost of not being able to revoke a token
  before it expires (hence a short expiry).
- **Row lock instead of SERIALIZABLE:** explicit and easy to reason about, at the cost of brief waits on one busy pool.
- **Foreign key instead of a membership table:** one less table to keep in sync, at the cost of not tracking a ride that
  moves between pools (not possible in the MVP).
