import express, { Application } from 'express';

// Route modules (created in later tasks)
import authRouter from './modules/auth/auth.routes';
import adminRouter from './modules/admin/admin.routes';
import venueRouter from './modules/venue/venue.routes';
import bookingRouter from './modules/booking/booking.routes';

// Global error handler (created in task 3.5) — MUST be registered last
import { globalErrorHandler } from './middleware/errorHandler';

/**
 * Builds and returns the configured Express application.
 * Routes and middleware are wired here; the HTTP server is started in server.ts.
 */
export function createApp(): Application {
  const app = express();

  // ── Body parsers ─────────────────────────────────────────────────────────────
  app.use(express.json());

  // ── Routes ───────────────────────────────────────────────────────────────────
  // NOTE: /api/venues/search must be mounted before /api/venues to prevent
  //       the "search" segment from being captured as a venue :id param.
  app.use('/api/auth', authRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/venues', venueRouter);
  app.use('/api/bookings', bookingRouter);

  // ── Global error handler (must be LAST) ──────────────────────────────────────
  app.use(globalErrorHandler);

  return app;
}
