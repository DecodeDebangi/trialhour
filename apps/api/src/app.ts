import express, { type Express } from 'express';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { bookingsRouter } from './routes/bookings.js';
import { healthRouter } from './routes/health.js';
import { slotsRouter } from './routes/slots.js';
import type { BookingService } from './services/bookingService.js';
import type { SlotService } from './services/slotService.js';

export interface AppDeps {
  slotService: SlotService;
  bookingService: BookingService;
  checkDatabase: () => Promise<void>;
}

/** Builds the HTTP app from injected dependencies. No I/O happens here. */
export function createApp(deps: AppDeps): Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '16kb' }));

  app.use('/api/health', healthRouter(deps.checkDatabase));
  app.use('/api/slots', slotsRouter(deps.slotService));
  app.use('/api/bookings', bookingsRouter(deps.bookingService));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
