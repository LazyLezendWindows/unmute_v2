import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { config } from '../config/env';
import { getDatabase, IDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { AuthAccountRepository } from '../repositories/authAccountRepository';
import { UserRepository } from '../repositories/userRepository';
import { decryptTotpSecret, encryptTotpSecret } from './auth/totpCrypto';

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;
const SETUP_TTL_SECONDS = 15 * 60;
export const PENDING_LOGIN_TTL_SECONDS = 5 * 60;
const MAX_PENDING_ATTEMPTS = 5;
const MAX_USER_FAILED_ATTEMPTS = 5;
const USER_LOCKOUT_SECONDS = 15 * 60;
const RECOVERY_CODE_COUNT = 8;
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

interface UserTotpRow {
  user_id: string;
  secret_encrypted: string;
  enabled: number;
  last_used_step: number | string | null;
  failed_attempts: number;
  locked_until: string | null;
  setup_expires_at: string | null;
  enabled_at: string | null;
  is_locked: number;
  setup_expired: number;
}

interface PendingLoginRow {
  id: string;
  user_id: string;
  is_new_user: number;
  attempts: number;
  consumed_at: string | null;
  is_expired: number;
  user_active: number;
}

function hashPendingToken(token: string): string {
  return crypto.createHash('sha256').update(`totp-pending:${token}`).digest('hex');
}

function normalizeRecoveryCode(raw: string): string {
  return raw.replace(/[\s-]/g, '').toUpperCase();
}

function hashRecoveryCode(userId: string, normalizedCode: string): string {
  return crypto.createHash('sha256').update(`${userId}:recovery:${normalizedCode}`).digest('hex');
}

function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
    let raw = '';
    for (let j = 0; j < 8; j++) {
      raw += RECOVERY_ALPHABET[crypto.randomInt(0, RECOVERY_ALPHABET.length)];
    }
    codes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
  }
  return codes;
}

/**
 * Validates a 6-digit TOTP code against `base32Secret` and checks replay against `lastUsedStep`.
 * Returns the matched 30-second time step on success, or `null` if invalid or replayed.
 */
function verifyTotpToken(base32Secret: string, code: string, lastUsedStep: number | string | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const totp = new OTPAuth.TOTP({
    issuer: config.totp.issuer,
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  const nowMs = Date.now();
  const delta = totp.validate({ token: code, timestamp: nowMs, window: TOTP_WINDOW });
  if (delta === null) return null;

  const currentStep = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
  const matchedStep = currentStep + delta;
  if (lastUsedStep !== null && lastUsedStep !== undefined && matchedStep <= Number(lastUsedStep)) {
    return null;
  }
  return matchedStep;
}

async function getTotpRow(db: IDatabase, userId: string): Promise<UserTotpRow | null> {
  return db.get<UserTotpRow>(
    `SELECT user_id, secret_encrypted, enabled, last_used_step, failed_attempts,
            locked_until, setup_expires_at, enabled_at,
            CASE WHEN locked_until IS NOT NULL AND locked_until > UTC_TIMESTAMP() THEN 1 ELSE 0 END AS is_locked,
            CASE WHEN setup_expires_at IS NOT NULL AND setup_expires_at <= UTC_TIMESTAMP() THEN 1 ELSE 0 END AS setup_expired
     FROM user_totp
     WHERE user_id = ?`,
    [userId]
  );
}

async function recordFailedAttempt(userId: string): Promise<void> {
  const db = getDatabase();
  await db.run(
    `UPDATE user_totp
     SET failed_attempts = failed_attempts + 1,
         locked_until = CASE
           WHEN failed_attempts + 1 >= ? THEN DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND)
           ELSE locked_until
         END
     WHERE user_id = ?`,
    [MAX_USER_FAILED_ATTEMPTS, USER_LOCKOUT_SECONDS, userId]
  );
}

export class TotpService {
  /** Whether the user has active, verified two-factor authentication enabled. */
  static async isEnabled(userId: string): Promise<boolean> {
    const row = await getDatabase().get<{ enabled: number }>(
      'SELECT enabled FROM user_totp WHERE user_id = ? AND enabled = 1',
      [userId]
    );
    return Boolean(row?.enabled);
  }

  /** Current 2FA status for the signed-in account settings screen (never exposes secrets or codes). */
  static async status(userId: string): Promise<{
    enabled: boolean;
    enabledAt: string | null;
    recoveryCodesRemaining: number;
  }> {
    const db = getDatabase();
    const row = await db.get<{ enabled: number; enabled_at: string | null }>(
      'SELECT enabled, enabled_at FROM user_totp WHERE user_id = ? AND enabled = 1',
      [userId]
    );
    if (!row) {
      return { enabled: false, enabledAt: null, recoveryCodesRemaining: 0 };
    }
    const countRow = await db.get<{ remaining: number }>(
      'SELECT COUNT(*) AS remaining FROM user_totp_recovery_codes WHERE user_id = ? AND used_at IS NULL',
      [userId]
    );
    return {
      enabled: true,
      enabledAt: row.enabled_at ? new Date(row.enabled_at + 'Z').toISOString() : null,
      recoveryCodesRemaining: Number(countRow?.remaining ?? 0),
    };
  }

  /**
   * Starts 2FA setup for `userId`: generates a fresh 160-bit TOTP secret, stores it encrypted in
   * pending state (`enabled = 0`), and returns the QR code Data URL and manual setup key.
   */
  static async initiateSetup(userId: string): Promise<{
    qrCodeDataUrl: string;
    manualEntryKey: string;
    otpauthUrl: string;
    issuer: string;
    accountName: string;
  }> {
    const db = getDatabase();
    const existing = await getTotpRow(db, userId);
    if (existing?.enabled) {
      throw new AppError('Two-factor authentication is already enabled on your account.', 409);
    }

    const user = await UserRepository.findById(userId);
    if (!user || !user.is_active) {
      throw new AppError('User not found or inactive', 404);
    }
    const phone = await AuthAccountRepository.phoneOf(userId);
    const accountName = user.email || phone || `user-${userId.slice(0, 8)}`;

    const secret = new OTPAuth.Secret({ size: 20 });
    const base32Secret = secret.base32;
    const encryptedSecret = encryptTotpSecret(base32Secret, userId);

    const totp = new OTPAuth.TOTP({
      issuer: config.totp.issuer,
      label: accountName,
      algorithm: 'SHA1',
      digits: TOTP_DIGITS,
      period: TOTP_PERIOD_SECONDS,
      secret,
    });
    const otpauthUrl = totp.toString();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 240,
    });

    await db.run(
      `INSERT INTO user_totp (user_id, secret_encrypted, enabled, last_used_step, failed_attempts, locked_until, created_at, setup_expires_at, enabled_at)
       VALUES (?, ?, 0, NULL, 0, NULL, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND), NULL)
       ON DUPLICATE KEY UPDATE
         secret_encrypted = VALUES(secret_encrypted),
         enabled = 0,
         last_used_step = NULL,
         failed_attempts = 0,
         locked_until = NULL,
         created_at = UTC_TIMESTAMP(),
         setup_expires_at = VALUES(setup_expires_at),
         enabled_at = NULL`,
      [userId, encryptedSecret, SETUP_TTL_SECONDS]
    );

    return {
      qrCodeDataUrl,
      manualEntryKey: base32Secret,
      otpauthUrl,
      issuer: config.totp.issuer,
      accountName,
    };
  }

  /**
   * Verifies the first 6-digit code from the user's authenticator app, transitions the pending
   * TOTP secret to enabled, and issues one-time recovery codes (returned once, stored only as hashes).
   */
  static async verifyAndEnable(userId: string, rawCode: string): Promise<{
    enabled: true;
    recoveryCodes: string[];
  }> {
    const db = getDatabase();
    const row = await getTotpRow(db, userId);
    if (!row) {
      throw new AppError('Start two-factor authentication setup first.', 400);
    }
    if (row.enabled) {
      throw new AppError('Two-factor authentication is already enabled.', 409);
    }
    if (row.is_locked) {
      throw new AppError('Too many failed verification attempts. Please try again in 15 minutes.', 429);
    }
    if (row.setup_expired) {
      throw new AppError('This setup session has expired. Please start setup again.', 400);
    }

    const code = rawCode.trim();
    const base32Secret = decryptTotpSecret(row.secret_encrypted, userId);
    const matchedStep = verifyTotpToken(base32Secret, code, row.last_used_step);
    if (matchedStep === null) {
      await recordFailedAttempt(userId);
      throw new AppError('Invalid verification code. Check your authenticator app and try again.', 400);
    }

    const recoveryCodes = generateRecoveryCodes();
    await db.transaction(async (tx) => {
      const { changes } = await tx.run(
        `UPDATE user_totp
         SET enabled = 1,
             last_used_step = ?,
             failed_attempts = 0,
             locked_until = NULL,
             setup_expires_at = NULL,
             enabled_at = UTC_TIMESTAMP()
         WHERE user_id = ? AND enabled = 0`,
        [matchedStep, userId]
      );
      if (!changes) {
        throw new AppError('Two-factor authentication is already enabled.', 409);
      }
      await tx.run('DELETE FROM user_totp_recovery_codes WHERE user_id = ?', [userId]);
      for (const rc of recoveryCodes) {
        await tx.run(
          `INSERT INTO user_totp_recovery_codes (id, user_id, code_hash, used_at, created_at)
           VALUES (?, ?, ?, NULL, UTC_TIMESTAMP())`,
          [crypto.randomUUID(), userId, hashRecoveryCode(userId, normalizeRecoveryCode(rc))]
        );
      }
    });

    return { enabled: true, recoveryCodes };
  }

  /**
   * Creates a short-lived server-validated pending authentication token after primary credentials
   * succeed for an account with 2FA enabled. No session cookie is granted yet.
   */
  static async createPendingLogin(
    userId: string,
    meta: { ip?: string; userAgent?: string; isNewUser?: boolean } = {}
  ): Promise<{
    requiresTwoFactor: true;
    pendingToken: string;
    expiresIn: number;
  }> {
    const pendingToken = crypto.randomBytes(32).toString('base64url');
    const tokenHash = hashPendingToken(pendingToken);
    await getDatabase().run(
      `INSERT INTO totp_pending_logins (id, user_id, token_hash, is_new_user, attempts, ip_address, user_agent, created_at, expires_at)
       VALUES (?, ?, ?, ?, 0, ?, ?, UTC_TIMESTAMP(), DATE_ADD(UTC_TIMESTAMP(), INTERVAL ? SECOND))`,
      [
        crypto.randomUUID(),
        userId,
        tokenHash,
        meta.isNewUser ? 1 : 0,
        (meta.ip || '').slice(0, 64),
        (meta.userAgent || '').slice(0, 255),
        PENDING_LOGIN_TTL_SECONDS,
      ]
    );
    return {
      requiresTwoFactor: true,
      pendingToken,
      expiresIn: PENDING_LOGIN_TTL_SECONDS,
    };
  }

  /**
   * Verifies a second-factor code (6-digit TOTP code or 8-character recovery code) against a
   * pending login token and consumes the pending login so it can never be reused.
   */
  static async verifyPendingLogin(
    pendingToken: string,
    rawCode: string
  ): Promise<{ userId: string; isNewUser: boolean; usedRecoveryCode: boolean }> {
    const db = getDatabase();
    const tokenHash = hashPendingToken(pendingToken.trim());
    const pending = await db.get<PendingLoginRow>(
      `SELECT p.id, p.user_id, p.is_new_user, p.attempts, p.consumed_at,
              CASE WHEN p.expires_at <= UTC_TIMESTAMP() THEN 1 ELSE 0 END AS is_expired,
              u.is_active AS user_active
       FROM totp_pending_logins p
       JOIN users u ON u.id = p.user_id
       WHERE p.token_hash = ?`,
      [tokenHash]
    );

    if (!pending || pending.consumed_at || pending.is_expired || !pending.user_active) {
      throw new AppError('Your sign-in session has expired. Please sign in again.', 401);
    }
    if (pending.attempts >= MAX_PENDING_ATTEMPTS) {
      throw new AppError('Too many failed verification attempts. Please sign in again.', 429);
    }

    const totpRow = await getTotpRow(db, pending.user_id);
    if (!totpRow || !totpRow.enabled) {
      throw new AppError('Invalid verification code.', 401);
    }
    if (totpRow.is_locked) {
      throw new AppError('Too many failed verification attempts. Please try again in 15 minutes.', 429);
    }

    const outcome = await this.consumeSecondFactor(pending.user_id, totpRow, rawCode);
    if (!outcome.valid) {
      await db.run('UPDATE totp_pending_logins SET attempts = attempts + 1 WHERE id = ?', [pending.id]);
      await recordFailedAttempt(pending.user_id);
      if (pending.attempts + 1 >= MAX_PENDING_ATTEMPTS) {
        throw new AppError('Too many failed verification attempts. Please sign in again.', 429);
      }
      throw new AppError('Invalid verification code.', 401);
    }

    const { changes } = await db.run(
      'UPDATE totp_pending_logins SET consumed_at = UTC_TIMESTAMP() WHERE id = ? AND consumed_at IS NULL',
      [pending.id]
    );
    if (!changes) {
      throw new AppError('Your sign-in session has expired. Please sign in again.', 401);
    }

    return {
      userId: pending.user_id,
      isNewUser: Boolean(pending.is_new_user),
      usedRecoveryCode: outcome.usedRecoveryCode,
    };
  }

  /**
   * Disables 2FA for `userId` after reauthenticating with their current password and/or a valid
   * TOTP/recovery code. Removes the secret and all recovery codes.
   */
  static async disable(
    userId: string,
    input: { password?: string; code?: string }
  ): Promise<{ enabled: false }> {
    const db = getDatabase();
    const totpRow = await getTotpRow(db, userId);
    if (!totpRow || !totpRow.enabled) {
      throw new AppError('Two-factor authentication is not enabled.', 400);
    }
    if (totpRow.is_locked) {
      throw new AppError('Too many failed verification attempts. Please try again in 15 minutes.', 429);
    }

    await this.verifyReauthentication(userId, totpRow, input);

    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM user_totp_recovery_codes WHERE user_id = ?', [userId]);
      await tx.run('DELETE FROM user_totp WHERE user_id = ?', [userId]);
      await tx.run(
        'UPDATE totp_pending_logins SET consumed_at = UTC_TIMESTAMP() WHERE user_id = ? AND consumed_at IS NULL',
        [userId]
      );
    });

    return { enabled: false };
  }

  /**
   * Generates a new set of 8 one-time recovery codes after reauthentication, invalidating any
   * previous recovery codes.
   */
  static async regenerateRecoveryCodes(
    userId: string,
    input: { password?: string; code?: string }
  ): Promise<{ recoveryCodes: string[] }> {
    const db = getDatabase();
    const totpRow = await getTotpRow(db, userId);
    if (!totpRow || !totpRow.enabled) {
      throw new AppError('Two-factor authentication is not enabled.', 400);
    }
    if (totpRow.is_locked) {
      throw new AppError('Too many failed verification attempts. Please try again in 15 minutes.', 429);
    }

    await this.verifyReauthentication(userId, totpRow, input);

    const recoveryCodes = generateRecoveryCodes();
    await db.transaction(async (tx) => {
      await tx.run('DELETE FROM user_totp_recovery_codes WHERE user_id = ?', [userId]);
      for (const rc of recoveryCodes) {
        await tx.run(
          `INSERT INTO user_totp_recovery_codes (id, user_id, code_hash, used_at, created_at)
           VALUES (?, ?, ?, NULL, UTC_TIMESTAMP())`,
          [crypto.randomUUID(), userId, hashRecoveryCode(userId, normalizeRecoveryCode(rc))]
        );
      }
    });

    return { recoveryCodes };
  }

  private static async verifyReauthentication(
    userId: string,
    totpRow: UserTotpRow,
    input: { password?: string; code?: string }
  ): Promise<void> {
    const hasPasswordInput = Boolean(input.password && input.password.length > 0);
    const hasCodeInput = Boolean(input.code && input.code.trim().length > 0);

    if (!hasPasswordInput && !hasCodeInput) {
      throw new AppError('Please confirm with your authenticator code or password.', 400);
    }

    if (hasPasswordInput) {
      const account = await getDatabase().get<{ password_hash: string | null }>(
        "SELECT password_hash FROM auth_accounts WHERE user_id = ? AND provider = 'password'",
        [userId]
      );
      const validPassword =
        Boolean(account?.password_hash) && (await bcrypt.compare(input.password!, account!.password_hash!));
      if (!validPassword) {
        await recordFailedAttempt(userId);
        throw new AppError('Invalid password or verification code.', 401);
      }
    }

    if (hasCodeInput) {
      const outcome = await this.consumeSecondFactor(userId, totpRow, input.code!);
      if (!outcome.valid) {
        await recordFailedAttempt(userId);
        throw new AppError('Invalid password or verification code.', 401);
      }
    }
  }

  /**
   * Checks a 6-digit TOTP code (with replay prevention) or an 8-character recovery code (marking it
   * used), resetting the user's failed attempt counter on success.
   */
  private static async consumeSecondFactor(
    userId: string,
    totpRow: UserTotpRow,
    rawCode: string
  ): Promise<{ valid: boolean; usedRecoveryCode: boolean }> {
    const db = getDatabase();
    const trimmed = rawCode.trim();

    if (/^\d{6}$/.test(trimmed)) {
      const base32Secret = decryptTotpSecret(totpRow.secret_encrypted, userId);
      const matchedStep = verifyTotpToken(base32Secret, trimmed, totpRow.last_used_step);
      if (matchedStep === null) {
        return { valid: false, usedRecoveryCode: false };
      }
      const { changes } = await db.run(
        `UPDATE user_totp
         SET last_used_step = ?, failed_attempts = 0, locked_until = NULL
         WHERE user_id = ? AND enabled = 1 AND (last_used_step IS NULL OR last_used_step < ?)`,
        [matchedStep, userId, matchedStep]
      );
      if (!changes) {
        return { valid: false, usedRecoveryCode: false };
      }
      return { valid: true, usedRecoveryCode: false };
    }

    const normalized = normalizeRecoveryCode(trimmed);
    if (!/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{8}$/.test(normalized)) {
      return { valid: false, usedRecoveryCode: false };
    }

    const candidateHash = Buffer.from(hashRecoveryCode(userId, normalized), 'hex');
    const unusedRows = await db.query<{ id: string; code_hash: string }>(
      'SELECT id, code_hash FROM user_totp_recovery_codes WHERE user_id = ? AND used_at IS NULL',
      [userId]
    );

    let matchedId: string | null = null;
    for (const row of unusedRows) {
      const storedHash = Buffer.from(row.code_hash, 'hex');
      if (storedHash.length === candidateHash.length && crypto.timingSafeEqual(storedHash, candidateHash)) {
        matchedId = row.id;
      }
    }
    if (!matchedId) {
      return { valid: false, usedRecoveryCode: false };
    }

    const { changes } = await db.run(
      'UPDATE user_totp_recovery_codes SET used_at = UTC_TIMESTAMP() WHERE id = ? AND used_at IS NULL',
      [matchedId]
    );
    if (!changes) {
      return { valid: false, usedRecoveryCode: false };
    }
    await db.run('UPDATE user_totp SET failed_attempts = 0, locked_until = NULL WHERE user_id = ?', [userId]);
    return { valid: true, usedRecoveryCode: true };
  }
}

