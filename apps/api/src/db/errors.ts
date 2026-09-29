// Postgres reports constraint failures with a code (e.g. 23505 = unique violation) and the constraint's name.
// Drizzle wraps the driver's error, so the original lives in `cause`.

export const UNIQUE_VIOLATION = '23505';
export const CHECK_VIOLATION = '23514';

export function pgError(err: unknown): { code?: string; constraint?: string } {
  const original = (err as { cause?: unknown } | null)?.cause ?? err;
  return typeof original === 'object' && original !== null ? original : {};
}

/** True if `err` is a unique-constraint violation (optionally: of that specific constraint). */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  const { code, constraint: violated } = pgError(err);
  return code === UNIQUE_VIOLATION && (constraint === undefined || violated === constraint);
}
