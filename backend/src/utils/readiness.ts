import { config } from '../config/env';
import { BillingService } from '../services/billingService';
import { GifService } from '../services/gifService';
import { ModerationService } from '../services/moderationService';

/**
 * One line per outside service at startup: what is live, what only shows codes on screen
 * (development), and what still needs keys in backend/.env (see .env.example).
 */
export function readinessReport(): string[] {
  const { email, sms, ice, push, totp } = config;
  const preview = (provider: string) => (provider === 'console' ? 'development preview (codes printed in this terminal, nothing sent)' : null);
  const billing = BillingService.mode();
  return [
    `Email codes:   ${email.provider === 'smtp' && email.smtp.host && email.smtp.from ? `SMTP via ${email.smtp.host}` : preview(email.provider) ?? 'NOT SET: set EMAIL_PROVIDER=smtp and SMTP_*'}`,
    `SMS codes:     ${sms.provider === 'twilio' && sms.twilio.accountSid && sms.twilio.from ? 'Twilio' : preview(sms.provider) ?? 'NOT SET: set SMS_PROVIDER=twilio and TWILIO_*'}`,
    `2FA (TOTP):    ${totp.encryptionKey ? 'on (AES-256-GCM key set)' : config.isProduction ? 'NOT SET: set TOTP_ENCRYPTION_KEY' : 'on (development key; set TOTP_ENCRYPTION_KEY in production)'}`,
    `Google login:  ${config.googleClientId ? 'on' : 'off (button hidden in the app): set GOOGLE_CLIENT_ID to turn it on'}`,
    `Payments:      ${billing === 'razorpay' ? 'Razorpay' : billing === 'test' ? 'test mode (plans activate with no charge): set RAZORPAY_*' : 'off: set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET'}`,
    `Push:          ${push.publicKey && push.privateKey ? 'on' : config.isProduction ? 'off: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY' : 'development keys (data/vapid.json)'}`,
    `Call relay:    ${ice.turnUrls.length ? 'TURN configured' : 'STUN only; calls on strict mobile/office networks may fail: set TURN_URLS'}`,
    `GIFs:          ${GifService.enabled() ? 'on (Giphy)' : 'off (button hidden): set GIPHY_API_KEY'}`,
    `Photo checks:  ${ModerationService.enabled() ? 'on (Sightengine)' : 'off (reports and admin review only): set SIGHTENGINE_API_USER and SIGHTENGINE_API_SECRET'}`,
  ];
}
