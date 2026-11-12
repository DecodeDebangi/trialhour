import { Router } from 'express';
import { slotsQuerySchema } from '@codeyoung/shared';
import type { SlotService } from '../services/slotService.js';

export function slotsRouter(slotService: SlotService): Router {
  const router = Router();
  router.get('/', async (req, res) => {
    const query = slotsQuerySchema.parse(req.query);
    res.json(await slotService.listSlots(query));
  });
  return router;
}
