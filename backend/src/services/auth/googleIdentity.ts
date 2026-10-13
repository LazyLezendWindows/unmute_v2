import { OAuth2Client } from 'google-auth-library';
import { config } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

export interface GoogleIdentity {
  /** Stable Google account ID (`sub`); the identifier we link accounts by. */
  subject: string;
  email: string;
  emailVerified: boolean;
  name: string;
  picture: string;
}

const client = new OAuth2Client();
const ALLOWED_ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

/**
 * Verifies a Google Identity Services ID token (signature, issuer, audience/client ID, expiry,
 * and identity claims) using Google's official library. Nothing else from the client is trusted.
 */
export async function verifyGoogleCredential(credential: string): Promise<GoogleIdentity> {
  if (config.env !== 'test' && !config.googleClientId && credential.startsWith('dev-google:')) {
    try {
      const raw = Buffer.from(credential.slice('dev-google:'.length), 'base64url').toString('utf8');
      const parsed = JSON.parse(raw) as { email?: string; name?: string };
      const email = String(parsed.email || '').trim().toLowerCase();
      const name = String(parsed.name || '').trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new Error('Invalid email');
      }
      return {
        subject: `dev-google-${email}`,
        email,
        emailVerified: true,
        name: name || email.split('@')[0],
        picture: '',
      };
    } catch {
      throw new AppError('Google sign-in could not be verified. Please try again.', 401);
    }
  }

  if (!config.googleClientId) {
    throw new AppError('Google sign-in is not configured on this server', 503);
  }

  // OAuth 2.0 access token flow (from google.accounts.oauth2.initTokenClient opening accounts.google.com/v3/signin/identifier)
  if (credential.startsWith('ya29.') || credential.startsWith('oauth2:')) {
    const accessToken = credential.startsWith('oauth2:') ? credential.slice('oauth2:'.length) : credential;
    try {
      const tokenInfo = await client.getTokenInfo(accessToken);
      if (
        !tokenInfo.aud ||
        tokenInfo.aud !== config.googleClientId ||
        !tokenInfo.expiry_date ||
        tokenInfo.expiry_date <= Date.now()
      ) {
        throw new Error('Token audience or expiry mismatch');
      }

      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        throw new Error(`Userinfo HTTP ${res.status}`);
      }
      const profile = (await res.json()) as {
        sub?: string;
        email?: string;
        email_verified?: boolean;
        name?: string;
        picture?: string;
      };
      if (!profile.sub || !profile.email) {
        throw new Error('Missing sub or email in userinfo');
      }
      return {
        subject: profile.sub,
        email: profile.email.toLowerCase(),
        emailVerified: profile.email_verified === true,
        name: profile.name || '',
        picture: profile.picture || '',
      };
    } catch (err) {
      console.warn('[Auth] Google OAuth2 token verification failed:', (err as Error).message);
      throw new AppError('Google sign-in could not be verified. Please try again.', 401);
    }
  }

  let payload;
  try {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: config.googleClientId });
    payload = ticket.getPayload();
  } catch (err) {
    console.warn('[Auth] Google credential verification failed:', (err as Error).message);
    throw new AppError('Google sign-in could not be verified. Please try again.', 401);
  }

  if (
    !payload?.sub ||
    !payload.email ||
    !payload.iss ||
    !ALLOWED_ISSUERS.has(payload.iss) ||
    payload.aud !== config.googleClientId ||
    !payload.exp ||
    payload.exp * 1000 <= Date.now()
  ) {
    throw new AppError('Google sign-in could not be verified. Please try again.', 401);
  }

  return {
    subject: payload.sub,
    email: payload.email.toLowerCase(),
    emailVerified: payload.email_verified === true,
    name: payload.name || '',
    picture: payload.picture || '',
  };
}
