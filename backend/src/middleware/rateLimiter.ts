import crypto from 'crypto';
import rateLimit from 'express-rate-limit';
import { SessionService } from '../services/sessionService';
import { AuthRequest } from './auth';

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  // 50 attempts per window; the test suite signs up many accounts from one address, so it raises this.
  max: Number(process.env.AUTH_RATE_LIMIT) || 50,
  message: {
    success: false,
    error: 'Too many authentication attempts. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Each code request sends a paid SMS, so these are capped per client well below other sign-in calls. */
export const smsRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: Number(process.env.SMS_RATE_LIMIT) || 10,
  message: {
    success: false,
    error: 'Too many code requests. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Code checks; each code also locks after a few wrong guesses (see PhoneAuthService). */
export const phoneVerifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: {
    success: false,
    error: 'Too many code attempts. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Authenticator-app (TOTP) and recovery-code verification attempts; per-user lockout also applies in TotpService. */
export const totpVerifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: Number(process.env.TOTP_RATE_LIMIT) || 30,
  message: {
    success: false,
    error: 'Too many verification attempts. Please try again in 15 minutes.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * General API limit, per signed-in session (per IP address for visitors). Many people can share
 * one public IP (mobile carriers, offices, colleges), so a per-IP limit alone would slow everyone
 * on that network down together.
 */
export const apiRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: Number(process.env.API_RATE_LIMIT) || 300, // 300 requests per minute
  keyGenerator: (req) => {
    const token = SessionService.tokenFromRequest(req);
    return token ? `session:${crypto.createHash('sha256').update(token).digest('hex').slice(0, 32)}` : `ip:${req.ip}`;
  },
  message: {
    success: false,
    error: 'Too many requests. Please slow down.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/** A much higher ceiling per IP address, so made-up session cookies can't get around the limit above. */
export const apiIpRateLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: Number(process.env.API_IP_RATE_LIMIT) || 2000,
  message: {
    success: false,
    error: 'Too many requests from this network. Please try again shortly.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Per-account cap on abuse reports (must run after requireAuth). */
export const reportRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20,
  keyGenerator: (req) => (req as AuthRequest).user!.userId,
  message: {
    success: false,
    error: 'You have submitted many reports recently. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Per-account cap on changing one's area (must run after requireAuth). Moving a search origin
 * around repeatedly is how distance-based apps get trilaterated.
 */
export const locationRateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 30,
  keyGenerator: (req) => (req as AuthRequest).user!.userId,
  message: {
    success: false,
    error: 'You have changed your area many times recently. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
