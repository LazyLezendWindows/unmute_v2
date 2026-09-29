"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const app_1 = require("./app");
const env_1 = require("./config/env");
const database_1 = require("./config/database");
const chatSocket_1 = require("./sockets/chatSocket");
const seed_1 = require("./utils/seed");
async function bootstrap() {
    try {
        // 1. Apply pending database migrations
        await (0, database_1.initDatabase)();
        // 2. Seed reference data; demo accounts only when explicitly enabled in development
        await (0, seed_1.seedInterests)();
        await (0, seed_1.seedReferenceData)();
        if (env_1.config.seedDemoUsers) {
            await (0, seed_1.seedDemoUsersIfEmpty)();
        }
        if (!env_1.config.googleClientId) {
            console.warn('[Unmute] GOOGLE_CLIENT_ID is not set; Google sign-in will be unavailable.');
        }
        // 3. Create app and HTTP server
        const app = (0, app_1.createApp)();
        const server = http_1.default.createServer(app);
        // 4. Initialize real-time Socket.io server
        (0, chatSocket_1.initSocketServer)(server);
        // 5. Start listening
        server.listen(env_1.config.port, () => {
            console.log(`[Unmute] Backend server running on http://localhost:${env_1.config.port}`);
            console.log(`[Unmute] Environment: ${env_1.config.env}`);
            console.log(`[Unmute] Base API URL: http://localhost:${env_1.config.port}/api/v1`);
        });
    }
    catch (err) {
        console.error('[Unmute] Failed to start server:', err);
        process.exit(1);
    }
}
bootstrap();
