// The seeded story cast (apps/api/src/db/seed.ts). Shown on the sign-in page so anyone trying the demo
// can sign in with one click. These accounts are public on purpose.
export const DEMO_PASSWORD = 'banani0841';

export const DEMO_ACCOUNTS = [
  { name: 'Jashim', note: 'Driver · Bullet, 3 seats', email: 'jashim@teslapool.test' },
  { name: 'Nusrat', note: 'Passenger', email: 'nusrat@teslapool.test' },
  { name: 'Rafiq', note: 'Passenger', email: 'rafiq@teslapool.test' },
  { name: 'Shirin', note: 'Passenger', email: 'shirin@teslapool.test' },
] as const;
