import { Router } from 'express';
import { z } from 'zod';
import { bookingRequestSchema } from '@codeyoung/shared';
import type { BookingService } from '../services/bookingService.js';

const idParamSchema = z.object({ id: z.uuid() });

export function bookingsRouter(bookingService: BookingService): Router {
  const router = Router();

  // P0: an Idempotency-Key header is accepted but not yet enforced (SPEC §12).
  router.post('/', async (req, res) => {
    const request = bookingRequestSchema.parse(req.body);
    res.status(201).json(await bookingService.createBooking(request));
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(await bookingService.getBooking(id));
  });

  return router;
}
