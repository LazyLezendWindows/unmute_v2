import bcrypt from 'bcryptjs';
import { getDatabase, IDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { getSocketServer } from '../sockets/chatSocket';
import { PhoneAuthService } from './phoneAuthService';
import { PhoneCodeRepository } from '../repositories/phoneCodeRepository';
import { EmailCodeService } from './emailCodeService';
import { emailAvailable } from './auth/emailSender';
import { revealCodesToClient } from './auth/smsSender';

/**
 * "Forgot password": a 6-digit code goes to the account's email and, if it has one, its verified
 * phone. Either code sets a new password. Answers never say whether an email is registered.
 */
async function accountFor(email: string): Promise<{ id: string; email: string; phone: string | null } | null> {
  return getDatabase().get(
    `SELECT u.id, u.email, a.provider_account_id AS phone
     FROM users u LEFT JOIN auth_accounts a ON a.user_id = u.id AND a.provider = 'phone'
     WHERE u.email = ? AND u.is_active = 1`,
    [email.toLowerCase()]
  );
}

export class PasswordResetService {
  static async start(email: string): Promise<{ devCode?: string }> {
    const account = await accountFor(email);
    if (!account) return {};
    let devCode: string | undefined;
    if (emailAvailable()) devCode = (await EmailCodeService.send(account.email, 'reset')).devCode;
    if (account.phone) {
      const sms = await PhoneAuthService.start({ phone: account.phone }).catch(() => null);
      devCode ??= revealCodesToClient() ? sms?.devCode : undefined;
    }
    return devCode ? { devCode } : {};
  }

  static async finish(email: string, code: string, password: string): Promise<void> {
    const account = await accountFor(email);
    if (!account) throw new AppError('This code has expired. Request a new one.', 400);
    const hash = await bcrypt.hash(password, 12);

    // The code may have come by email or by SMS.
    const useCode = async (tx: IDatabase) => {
      try {
        await EmailCodeService.consume(tx, account.email, 'reset', code);
        await tx.run('UPDATE users SET email_verified_at = COALESCE(email_verified_at, UTC_TIMESTAMP()) WHERE id = ?', [account.id]);
      } catch (emailErr) {
        if (!account.phone) throw emailErr;
        const active = await PhoneAuthService.checkCode(account.phone, code).catch(() => {
          throw emailErr;
        });
        if (!(await PhoneCodeRepository.consume(tx, active.id))) throw new AppError('This code has already been used. Request a new one.', 400);
      }
    };

    await getDatabase().transaction(async (tx) => {
      await useCode(tx);
      const now = new Date().toISOString();
      const { changes } = await tx.run(
        "UPDATE auth_accounts SET password_hash = ?, updated_at = ? WHERE user_id = ? AND provider = 'password'",
        [hash, now, account.id]
      );
      if (!changes) {
        await tx.run(
          `INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, password_hash, created_at, updated_at)
           VALUES (UUID(), ?, 'password', ?, ?, ?, ?)`,
          [account.id, account.id, hash, now, now]
        );
      }
      // Anyone signed in with the old password is signed out everywhere.
      await tx.run('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [account.id]);
    });
    getSocketServer()?.in(`user:${account.id}`).disconnectSockets(true);
  }
}
