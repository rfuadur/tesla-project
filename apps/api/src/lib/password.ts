import bcrypt from 'bcryptjs';
import { env } from '../config/env.js';

// bcrypt is slow on purpose: cost 12 ≈ a quarter of a second per hash, so a leaked hash is expensive to guess.
// Tests use the minimum cost to stay fast; they are not guarding real passwords.
const COST = env.NODE_ENV === 'test' ? 4 : 12;

export const hashPassword = (plain: string): Promise<string> => bcrypt.hash(plain, COST);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);
