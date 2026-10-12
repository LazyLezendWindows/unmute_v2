import { billingWebhook } from './controllers/billingWebhook';
import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { config } from './config/env';
import { apiIpRateLimiter, apiRateLimiter } from './middleware/rateLimiter';
import { errorHandler } from './middleware/errorHandler';
import { requireTrustedOrigin } from './middleware/originCheck';
import apiRouter from './routes';

export function createApp(): Express {
  const app = express();
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');

  // Security Headers
  app.use(
    helmet({
      // Razorpay checkout, Google sign-in, and images/GIFs from https sources (photos, Giphy).
      contentSecurityPolicy: config.isProduction ? { directives: {
        scriptSrc: ["'self'", 'https://checkout.razorpay.com', 'https://accounts.google.com/gsi/client'],
        frameSrc: ["'self'", 'https://api.razorpay.com', 'https://*.razorpay.com', 'https://accounts.google.com'],
        connectSrc: ["'self'", 'https://*.razorpay.com', 'https://accounts.google.com', 'wss:'],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'blob:'],
      } } : false,
    })
  );

  // CORS
  app.use(
    cors({
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Signed gateway webhooks use exact raw bytes and do not use browser session/CSRF checks.
  app.post('/api/v1/subscriptions/webhook', express.raw({ type: 'application/json', limit: '256kb' }), billingWebhook);

  // Body parsers
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));

  // General rate limiter and CSRF origin check for cookie-authenticated requests
  app.use('/api', apiIpRateLimiter, apiRateLimiter);
  app.use('/api', requireTrustedOrigin);

  // Health check
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Uploaded profile photos. Names are random and never reused, so they cache for good; the
  // cross-origin policy lets the mobile apps (a different origin) show them.
  app.use(
    '/api/v1/media',
    express.static(config.uploadDir, {
      immutable: true,
      maxAge: '365d',
      index: false,
      setHeaders: (res) => {
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
        res.setHeader('X-Content-Type-Options', 'nosniff');
      },
    })
  );

  // Base API v1
  app.use('/api/v1', apiRouter);

  // Serve built frontend assets and SPA fallback for single-service deployment
  const frontendDist = path.resolve(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req: Request, res: Response, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/health') || req.path.startsWith('/socket.io')) {
        return next();
      }
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
  }

  // 404 handler for unmatched API routes
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'Resource not found',
    });
  });

  // Central Error Handler
  app.use(errorHandler);

  return app;
}
