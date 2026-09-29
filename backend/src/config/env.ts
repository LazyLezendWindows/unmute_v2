import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const env = process.env.NODE_ENV || 'development';
const isProduction = env === 'production';

const rawCors =
  process.env.CORS_ORIGIN ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.APP_URL ||
  (isProduction ? '' : 'http://localhost:5173');

const corsOrigins = rawCors
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

if (isProduction && corsOrigins.length === 0) {
  // If no external URL configured yet, allow same-origin requests
  console.warn('[Unmute] CORS_ORIGIN not explicitly set in production; defaulting to same-origin requests.');
}

/**
 * `lax` (default) suits a web app served from the API's own site. The Capacitor app runs on its own
 * origin (https://localhost, capacitor://localhost), so it needs `none`, which browsers only accept
 * together with Secure, i.e. over HTTPS.
 */
const cookieSameSite = (process.env.SESSION_COOKIE_SAMESITE || 'lax').toLowerCase();
if (cookieSameSite !== 'lax' && cookieSameSite !== 'none') {
  throw new Error('SESSION_COOKIE_SAMESITE must be "lax" or "none"');
}

export const config = {
  env,
  isProduction,
  port: parseInt(process.env.PORT || '5000', 10),
  /** Number of reverse-proxy hops in front of the API (so req.ip and rate limits see the real client). */
  trustProxy: parseInt(process.env.TRUST_PROXY || '0', 10),
  /** Browser origins allowed to call the API with credentials (comma-separated CORS_ORIGIN). */
  corsOrigins,
  minAge: parseInt(process.env.MIN_AGE || '18', 10),
  googleClientId: process.env.GOOGLE_CLIENT_ID || '',
  /**
   * WebRTC servers for calls. STUN finds a direct route between the two phones; a TURN server
   * relays the call when no direct route exists (strict mobile networks and offices). Without
   * TURN_URLS some calls on such networks won't connect.
   */
  ice: {
    stunUrls: (process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302')
      .split(',').map((u) => u.trim()).filter(Boolean),
    turnUrls: (process.env.TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean),
    turnUsername: process.env.TURN_USERNAME || '',
    turnCredential: process.env.TURN_CREDENTIAL || '',
  },
  /** Web Push (calls ringing and messages while the app is closed). Keys: `npx web-push generate-vapid-keys`. */
  push: {
    publicKey: process.env.VAPID_PUBLIC_KEY || '',
    privateKey: process.env.VAPID_PRIVATE_KEY || '',
    subject: process.env.VAPID_SUBJECT || 'mailto:support@unmute.app',
  },
  /** SMS delivery for phone sign-in codes (see services/auth/smsSender.ts). */
  sms: {
    provider: (process.env.SMS_PROVIDER || (isProduction ? '' : 'console')).toLowerCase(),
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID || '',
      authToken: process.env.TWILIO_AUTH_TOKEN || '',
      from: process.env.TWILIO_FROM || '',
    },
  },
  session: {
    // The __Host- prefix makes browsers require Secure, Path=/ and no Domain for the cookie.
    cookieName: isProduction ? '__Host-unmute_session' : 'unmute_session',
    ttlDays: parseInt(process.env.SESSION_TTL_DAYS || '30', 10),
    sameSite: cookieSameSite as 'lax' | 'none',
    // SameSite=None cookies are rejected by browsers unless Secure.
    secure: isProduction || cookieSameSite === 'none',
  },
  /** Where uploaded profile photos are stored (served back at /api/v1/media/<file>). */
  uploadDir: process.env.UPLOAD_DIR || path.resolve(__dirname, '../../data/uploads'),
  /** Seed demo accounts on an empty database (never in production). */
  seedDemoUsers: !isProduction && process.env.SEED_DEMO_USERS === 'true',
  mariadb: {
    host: process.env.MARIADB_HOST || '127.0.0.1',
    port: parseInt(process.env.MARIADB_PORT || '3307', 10),
    user: process.env.MARIADB_USER || process.env.USER || '',
    password: process.env.MARIADB_PASSWORD || '',
    database: process.env.MARIADB_DATABASE || 'unmute_db',
    socketPath: process.env.MARIADB_SOCKET || path.resolve(__dirname, '../../data/mariadb.sock'),
  },
};
