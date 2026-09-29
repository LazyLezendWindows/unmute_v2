import crypto from 'crypto';
import { getDatabase, IDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { revealEmailCodes, sendEmail } from './auth/emailSender';

export type EmailCodePurpose = 'verify' | 'reset';

const TTL_SECONDS = 30 * 60;
const RESEND_AFTER_SECONDS = 30;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;

const hash = (email: string, purpose: string, code: string) =>
  crypto.createHash('sha256').update(`${email}:${purpose}:${code}`).digest('hex');

/** 6-digit codes sent by email, stored only as hashes, single-use and short-lived (like SMS codes). */
export class EmailCodeService {
  static async send(email: string, purpose: EmailCodePurpose): Promise<{ devCode?: string }> {
    const db = getDatabase();
    const recent = await db.get<{ n: number; since: number | null }>(
      `SELECT COUNT(*) AS n, TIMESTAMPDIFF(SECOND, MAX(created_at), UTC_TIMESTAMP()) AS since FROM email_codes
       WHERE email = ? AND purpose = ? AND created_at > UTC_TIMESTAMP() - INTERVAL 1 HOUR`,
      [email, purpose]
    );
    if (recent?.since !== null && recent?.since !== undefined && Number(recent.since) < RESEND_AFTER_SECONDS) {
      throw new AppError(`Please wait ${RESEND_AFTER_SECONDS - Number(recent.since)} seconds before asking for another code.`, 429);
    }
    if (Number(recent?.n ?? 0) >= MAX_PER_HOUR) throw new AppError('Too many codes were sent. Please try again in an hour.', 429);

    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
    await db.transaction(async (tx) => {
      await tx.run('UPDATE email_codes SET consumed_at = UTC_TIMESTAMP() WHERE email = ? AND purpose = ? AND consumed_at IS NULL', [email, purpose]);
      await tx.run(
        `INSERT INTO email_codes (id, email, purpose, code_hash, created_at, expires_at)
         VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ? SECOND)`,
        [crypto.randomUUID(), email, purpose, hash(email, purpose, code), TTL_SECONDS]
      );
    });
    const subject = purpose === 'verify' ? 'Your Unmute verification code' : 'Reset your Unmute password';
    const body =
      purpose === 'verify'
        ? `Your Unmute email verification code is ${code}. It expires in 30 minutes.`
        : `Your Unmute password reset code is ${code}. It expires in 30 minutes. If you didn't ask for this, ignore this email; your password stays the same.`;
    await sendEmail(email, subject, body);
    return revealEmailCodes() ? { devCode: code } : {};
  }

  /** Checks and uses up a code inside `tx`; throws a message the member can act on. */
  static async consume(tx: IDatabase, email: string, purpose: EmailCodePurpose, code: string): Promise<void> {
    const row = await tx.get<{ id: string; code_hash: string; attempts: number }>(
      `SELECT id, code_hash, attempts FROM email_codes
       WHERE email = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP()
       ORDER BY created_at DESC LIMIT 1`,
      [email, purpose]
    );
    if (!row || row.attempts >= MAX_ATTEMPTS) throw new AppError('This code has expired. Request a new one.', 400);
    const ok = crypto.timingSafeEqual(Buffer.from(row.code_hash, 'hex'), Buffer.from(hash(email, purpose, code), 'hex'));
    if (!ok) {
      // Counted outside the transaction, so a wrong guess still counts when the caller rolls back.
      await getDatabase().run('UPDATE email_codes SET attempts = attempts + 1 WHERE id = ?', [row.id]);
      throw new AppError(row.attempts + 1 < MAX_ATTEMPTS ? "That code isn't right. Check the email and try again." : 'Too many wrong codes. Request a new one.', 400);
    }
    // Conditional, so two requests racing with the same code can't both use it.
    const { changes } = await tx.run('UPDATE email_codes SET consumed_at = UTC_TIMESTAMP() WHERE id = ? AND consumed_at IS NULL', [row.id]);
    if (!changes) throw new AppError('This code has already been used. Request a new one.', 400);
  }
}
