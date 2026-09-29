"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyGoogleCredential = verifyGoogleCredential;
const google_auth_library_1 = require("google-auth-library");
const env_1 = require("../../config/env");
const errorHandler_1 = require("../../middleware/errorHandler");
const client = new google_auth_library_1.OAuth2Client();
/**
 * Verifies a Google Identity Services ID token (signature, issuer, expiry and that it was issued
 * for our client ID) and returns the identity it asserts. Nothing else from the client is trusted.
 */
async function verifyGoogleCredential(credential) {
    if (!env_1.config.googleClientId) {
        throw new errorHandler_1.AppError('Google sign-in is not configured on this server', 503);
    }
    let payload;
    try {
        const ticket = await client.verifyIdToken({ idToken: credential, audience: env_1.config.googleClientId });
        payload = ticket.getPayload();
    }
    catch (err) {
        console.warn('[Auth] Google credential verification failed:', err.message);
        throw new errorHandler_1.AppError('Google sign-in could not be verified. Please try again.', 401);
    }
    if (!payload?.sub || !payload.email) {
        throw new errorHandler_1.AppError('Google sign-in could not be verified. Please try again.', 401);
    }
    return {
        subject: payload.sub,
        email: payload.email.toLowerCase(),
        emailVerified: payload.email_verified === true,
        name: payload.name || '',
        picture: payload.picture || '',
    };
}
