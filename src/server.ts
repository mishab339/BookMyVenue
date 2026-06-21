import http from 'http';
import { loadConfig } from './config/config';
import { connectDb } from './db/sequelize';
import { createApp } from './app';

// ── Process-level safety net ─────────────────────────────────────────────────

process.on('uncaughtException', (err: Error) => {
  console.error('[uncaughtException] Unhandled exception — shutting down:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  console.error('[unhandledRejection] Unhandled promise rejection — shutting down:', reason);
  process.exit(1);
});

// ── Bootstrap ────────────────────────────────────────────────────────────────

async function bootstrap(): Promise<void> {
  // 1. Load and validate environment configuration (throws on missing vars).
  const config = loadConfig();

  // 2. Connect to the database (implemented in task 2.1).
  await connectDb();

  // 3. Build the Express application.
  const app = createApp();

  // 4. Start the HTTP server.
  const server = http.createServer(app);

  server.listen(config.port, () => {
    console.log(`[server] Listening on port ${config.port} (${config.nodeEnv})`);
  });
}

bootstrap();
