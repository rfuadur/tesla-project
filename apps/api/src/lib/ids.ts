import { z } from 'zod';
import { notFound } from './errors.js';

/**
 * Reads an id from the URL. A malformed id can't belong to anything, so it gets the same 404 as an
 * unknown one (instead of reaching the database as invalid input).
 */
export function idParam(value: string, notFoundMessage: string): string {
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw notFound(notFoundMessage);
  return parsed.data;
}
