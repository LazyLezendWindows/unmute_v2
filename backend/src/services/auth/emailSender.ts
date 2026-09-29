import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../../config/env';
import { AppError } from '../../middleware/errorHandler';

/**
 * Sends account emails (verification and password-reset codes). `EMAIL_PROVIDER` picks the transport:
 * - `console` (the default outside production): prints the email to the server log.
 * - `smtp`: any SMTP service (Gmail, Zoho, Amazon SES, Brevo…) via SMTP_HOST, SMTP_PORT, SMTP_USER,
 *   SMTP_PASS and EMAIL_FROM.
 */
let transport: Transporter | null = null;

export function emailAvailable(): boolean {
  const { provider, smtp } = config.email;
  if (provider === 'console') return !config.isProduction;
  if (provider === 'smtp') return Boolean(smtp.host && smtp.from);
  return false;
}

/** Local development without a mail service: the code is shown in the app instead. */
export function revealEmailCodes(): boolean {
  return config.env === 'development' && config.email.provider === 'console';
}

export async function sendEmail(to: string, subject: string, text: string): Promise<void> {
  if (!emailAvailable()) throw new AppError('Email isn’t available right now. Please try again later.', 503);
  if (config.email.provider === 'console') {
    console.info(`[Email] to ${to}: ${subject} — ${text}`);
    return;
  }
  const { smtp } = config.email;
  transport ??= nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass } : undefined,
  });
  try {
    await transport.sendMail({ from: smtp.from, to, subject, text });
  } catch (err: any) {
    console.error('[Email] Delivery failed:', err?.message);
    throw new AppError("We couldn't send the email. Check the address and try again.", 502);
  }
}
