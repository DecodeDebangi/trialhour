import { Router } from 'express';
import { outboxQuerySchema } from '@codeyoung/shared';
import type { OutboxService } from '../services/outboxService.js';

export function outboxRouter(outboxService: OutboxService): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    res.json(await outboxService.list(outboxQuerySchema.parse(req.query)));
  });
  return router;
}
