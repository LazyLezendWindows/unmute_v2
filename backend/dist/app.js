"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
const billingWebhook_1 = require("./controllers/billingWebhook");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const rateLimiter_1 = require("./middleware/rateLimiter");
const errorHandler_1 = require("./middleware/errorHandler");
const originCheck_1 = require("./middleware/originCheck");
const routes_1 = __importDefault(require("./routes"));
function createApp() {
    const app = (0, express_1.default)();
    app.set('trust proxy', env_1.config.trustProxy);
    app.disable('x-powered-by');
    // Security Headers
    app.use((0, helmet_1.default)({
        contentSecurityPolicy: env_1.config.isProduction ? { directives: {
                scriptSrc: ["'self'", 'https://checkout.razorpay.com'],
                frameSrc: ["'self'", 'https://api.razorpay.com', 'https://*.razorpay.com'],
                connectSrc: ["'self'", 'https://*.razorpay.com', 'wss:'],
            } } : false,
    }));
    // CORS
    app.use((0, cors_1.default)({
        origin: env_1.config.corsOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    }));
    // Signed gateway webhooks use exact raw bytes and do not use browser session/CSRF checks.
    app.post('/api/v1/subscriptions/webhook', express_1.default.raw({ type: 'application/json', limit: '256kb' }), billingWebhook_1.billingWebhook);
    // Body parsers
    app.use(express_1.default.json({ limit: '1mb' }));
    app.use(express_1.default.urlencoded({ extended: true, limit: '1mb' }));
    // General rate limiter and CSRF origin check for cookie-authenticated requests
    app.use('/api', rateLimiter_1.apiRateLimiter);
    app.use('/api', originCheck_1.requireTrustedOrigin);
    // Health check
    app.get('/health', (_req, res) => {
        res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
    });
    // Uploaded profile photos. Names are random and never reused, so they cache for good; the
    // cross-origin policy lets the mobile apps (a different origin) show them.
    app.use('/api/v1/media', express_1.default.static(env_1.config.uploadDir, {
        immutable: true,
        maxAge: '365d',
        index: false,
        setHeaders: (res) => {
            res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
            res.setHeader('X-Content-Type-Options', 'nosniff');
        },
    }));
    // Base API v1
    app.use('/api/v1', routes_1.default);
    // Serve built frontend assets and SPA fallback for single-service deployment
    const frontendDist = path_1.default.resolve(__dirname, '../../frontend/dist');
    if (fs_1.default.existsSync(frontendDist)) {
        app.use(express_1.default.static(frontendDist));
        app.get('*', (req, res, next) => {
            if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
                return next();
            }
            res.sendFile(path_1.default.join(frontendDist, 'index.html'));
        });
    }
    // 404 handler for unmatched API routes
    app.use((_req, res) => {
        res.status(404).json({
            success: false,
            error: 'Resource not found',
        });
    });
    // Central Error Handler
    app.use(errorHandler_1.errorHandler);
    return app;
}
