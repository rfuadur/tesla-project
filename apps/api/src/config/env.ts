import { z } from 'zod';

// Every setting the API needs, validated once at startup.
// A server that boots with a missing secret fails later in confusing ways, so we fail fast instead.
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().startsWith('postgres', 'must be a postgres:// connection string'),
  JWT_SECRET: z.string().min(32, 'must be at least 32 characters'),
  COOKIE_SECURE: z.stringbool().default(false),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  // Sign-in / sign-up attempts allowed per IP address per 15 minutes.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
});

export type Env = z.infer<typeof EnvSchema>;

function loadEnv(): Env {
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

export const env = loadEnv();
