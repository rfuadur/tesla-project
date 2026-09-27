import { Router } from 'express';
import { pool } from '../db/pool.js';

export const healthRouter = Router();

// Used by Docker health checks and the hosting platform: "is the API up, and can it reach the database?"
healthRouter.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'ok' });
  } catch (err) {
    req.log.warn({ err }, 'health check: database unreachable');
    res.status(503).json({ status: 'degraded', db: 'unreachable' });
  }
});
