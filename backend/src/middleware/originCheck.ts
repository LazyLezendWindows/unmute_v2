import { Request, Response, NextFunction } from 'express';
import { config } from '../config/env';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isAllowedOrigin(origin: string | undefined, hostHeader?: string): boolean {
  if (!origin) return true;

  // 1. Explicitly configured origins (from CORS_ORIGIN, RENDER_EXTERNAL_URL, APP_URL, etc.)
  if (config.corsOrigins.includes(origin)) return true;

  // 2. Same-origin request: matches the server's Host header (e.g. deployed on Render)
  if (hostHeader) {
    if (origin === `https://${hostHeader}` || origin === `http://${hostHeader}`) {
      return true;
    }
  }

  // 3. In development / testing: allow localhost, 127.0.0.1, or local LAN IP addresses (e.g. 192.168.x.x, 10.x.x.x, 172.x.x.x)
  if (!config.isProduction) {
    try {
      const url = new URL(origin);
      const hostname = url.hostname;
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
      ) {
        return true;
      }
    } catch {
      return false;
    }
  }

  return false;
}

/**
 * CSRF defence in depth alongside SameSite=Lax cookies: browsers always send `Origin` on
 * cross-site state-changing requests, so reject any whose origin is not an allowed app origin.
 * Requests without an Origin header (non-browser clients) cannot carry a victim's cookies.
 */
export function requireTrustedOrigin(req: Request, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (SAFE_METHODS.has(req.method) || isAllowedOrigin(origin, req.headers.host)) {
    next();
    return;
  }
  res.status(403).json({ success: false, error: 'Request origin not allowed' });
}
