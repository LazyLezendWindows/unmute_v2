import { config } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

/**
 * Delivers sign-in codes by SMS. `SMS_PROVIDER` picks the transport:
 * - `console` (the default outside production): prints the message to the server log, for local
 *   development and tests. Never used in production, where it would leak codes into logs.
 * - `twilio`: Twilio's Messages API (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM).
 * With no usable provider, phone sign-in reports itself unavailable.
 */
export function smsAvailable(): boolean {
  const { provider, twilio } = config.sms;
  if (provider === 'console') return !config.isProduction;
  if (provider === 'twilio') return Boolean(twilio.accountSid && twilio.authToken && twilio.from);
  return false;
}

/**
 * Local development without a real SMS provider: the code is handed back to the app so it can be
 * shown on screen. Never in production or tests, and never once a real provider is configured.
 */
export function revealCodesToClient(): boolean {
  return config.env === 'development' && config.sms.provider === 'console';
}

export async function sendSms(to: string, body: string): Promise<void> {
  if (!smsAvailable()) {
    throw new AppError('Phone sign-in is not available right now.', 503);
  }
  if (config.sms.provider === 'console') {
    console.info(`[SMS] to ${to}: ${body}`);
    return;
  }

  const { accountSid, authToken, from } = config.sms.twilio;
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
    throw new AppError("We couldn't send a code to that number. Check it and try again.", 502);
  }
}
