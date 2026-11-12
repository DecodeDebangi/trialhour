import { Router } from 'express';

/** Liveness + database check. `checkDatabase` rejects when the database is unreachable. */
export function healthRouter(checkDatabase: () => Promise<void>): Router {
  const router = Router();
  router.get('/', async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ok' });
    } catch {
      res.status(503).json({ status: 'unavailable', database: 'unreachable' });
    }
  });
  return router;
}
