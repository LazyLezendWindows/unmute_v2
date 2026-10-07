import { PlanReminderService } from './services/planReminderService';
import { AdminAuthService } from './services/adminAuthService';
import http from 'http';
import { createApp } from './app';
import { config } from './config/env';
import { initDatabase } from './config/database';
import { initSocketServer } from './sockets/chatSocket';
import { readinessReport } from './utils/readiness';
import { seedInterests, seedReferenceData, seedDemoUsersIfEmpty } from './utils/seed';

async function bootstrap() {
  try {
    // 1. Apply pending database migrations
    await initDatabase();

    // 2. Seed reference data; demo accounts only when explicitly enabled in development
    await seedInterests();
    await seedReferenceData();
    if (config.seedDemoUsers) {
      await seedDemoUsersIfEmpty();
    }
    for (const line of readinessReport()) console.log(`[Unmute] ${line}`);
    await AdminAuthService.announceSetup();

    // 3. Create app and HTTP server
    const app = createApp();
    const server = http.createServer(app);

    // 4. Initialize real-time Socket.io server
    initSocketServer(server);

    // Reminders about trials and plans ending (checked every few minutes).
    PlanReminderService.start();

    // 5. Start listening
    server.listen(config.port, () => {
      console.log(`[Unmute] Backend server running on http://localhost:${config.port}`);
      console.log(`[Unmute] Environment: ${config.env}`);
      console.log(`[Unmute] Base API URL: http://localhost:${config.port}/api/v1`);
    });
  } catch (err) {
    console.error('[Unmute] Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
