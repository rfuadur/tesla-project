import type { Express } from 'express';
import request from 'supertest';
import { DEMO_PASSWORD } from '../../src/db/seed.js';

/** A browser-like client (it keeps cookies between requests) signed in as a seeded cast member. */
export async function signedInAs(app: Express, email: string) {
  const agent = request.agent(app);
  const res = await agent.post('/api/v1/auth/login').send({ email, password: DEMO_PASSWORD });
  if (res.status !== 200) {
    throw new Error(`sign-in failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return agent;
}
