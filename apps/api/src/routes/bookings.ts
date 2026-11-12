import { Router } from 'express';
import { z } from 'zod';
import { bookingRequestSchema } from '@codeyoung/shared';
import { IdempotencyKeyMissingError, RequestValidationError } from '../domain/errors.js';
import type { BookingService } from '../services/bookingService.js';

const idParamSchema = z.object({ id: z.uuid() });

export function bookingsRouter(bookingService: BookingService): Router {
  const router = Router();

  router.post('/', async (req, res) => {
    const key = req.get('Idempotency-Key');
    if (!key) throw new IdempotencyKeyMissingError();
    if (!z.uuid().safeParse(key).success) {
      const message = 'Idempotency-Key must be a UUID';
      throw new RequestValidationError(message, [{ path: 'Idempotency-Key', message }]);
    }
    const request = bookingRequestSchema.parse(req.body);
    const { booking, replayed } = await bookingService.createBooking(request, key);
    if (replayed) res.set('Idempotent-Replayed', 'true');
    res.status(replayed ? 200 : 201).json(booking);
  });

  router.get('/:id', async (req, res) => {
    const { id } = idParamSchema.parse(req.params);
    res.json(await bookingService.getBooking(id));
  });

  return router;
}
