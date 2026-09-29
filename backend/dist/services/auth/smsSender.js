"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.smsAvailable = smsAvailable;
exports.revealCodesToClient = revealCodesToClient;
exports.sendSms = sendSms;
const env_1 = require("../../config/env");
const errorHandler_1 = require("../../middleware/errorHandler");
/**
 * Delivers sign-in codes by SMS. `SMS_PROVIDER` picks the transport:
 * - `console` (the default outside production): prints the message to the server log, for local
 *   development and tests. Never used in production, where it would leak codes into logs.
 * - `twilio`: Twilio's Messages API (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).
 * With no usable provider, phone sign-in reports itself unavailable.
 */
function smsAvailable() {
    const { provider, twilio } = env_1.config.sms;
    if (provider === 'console')
        return !env_1.config.isProduction;
    if (provider === 'twilio')
        return Boolean(twilio.accountSid && twilio.authToken && twilio.from);
    return false;
}
/**
 * Local development without a real SMS provider: the code is handed back to the app so it can be
 * shown on screen. Never in production or tests, and never once a real provider is configured.
 */
function revealCodesToClient() {
    return env_1.config.env === 'development' && env_1.config.sms.provider === 'console';
}
async function sendSms(to, body) {
    if (!smsAvailable()) {
        throw new errorHandler_1.AppError('Phone sign-in is not available right now.', 503);
    }
    if (env_1.config.sms.provider === 'console') {
        console.info(`[SMS] to ${to}: ${body}`);
        return;
    }
    const { accountSid, authToken, from } = env_1.config.sms.twilio;
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
        method: 'POST',
        headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
    });
    if (!res.ok) {
        // The provider's reply can name the account or number; keep it in the server log only.
        console.error(`[SMS] Twilio rejected a message (${res.status}): ${await res.text()}`);
        throw new errorHandler_1.AppError("We couldn't send a code to that number. Check it and try again.", 502);
    }
}
