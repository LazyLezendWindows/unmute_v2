import crypto from 'crypto';
import { getDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { AuthAccountRepository } from '../repositories/authAccountRepository';

type Kind = 'email' | 'phone';

/** Banned values are kept only as hashes of the normalised email (lower case) or E.164 phone. */
function hashOf(kind: Kind, value: string): string {
  const normalised = kind === 'email' ? value.trim().toLowerCase() : value.replace(/[^\d+]/g, '');
  return crypto.createHash('sha256').update(`${kind}:${normalised}`).digest('hex');
}

const BANNED_MESSAGE = 'This account can’t be created. Contact support if you think this is a mistake.';

export class BanService {
  static async isBanned(kind: Kind, value: string | null | undefined): Promise<boolean> {
    if (!value) return false;
    return Boolean(await getDatabase().get('SELECT id FROM banned_identities WHERE kind = ? AND value_hash = ?', [kind, hashOf(kind, value)]));
  }

  /** Refuses new accounts (and new emails or numbers on an account) that a moderator has banned. */
  static async assertAllowed(identities: { email?: string | null; phone?: string | null }) {
    if ((await this.isBanned('email', identities.email)) || (await this.isBanned('phone', identities.phone))) {
      throw new AppError(BANNED_MESSAGE, 403);
    }
  }

  /** Bans the member's current email and phone number, so a new account can't use them. */
  static async banUser(userId: string, adminId: string, reason?: string) {
    const db = getDatabase();
    const user = await db.get<{ email: string | null }>('SELECT email FROM users WHERE id = ?', [userId]);
    if (!user) throw new AppError('User not found', 404);
    const phone = await AuthAccountRepository.phoneOf(userId);
    const values: [Kind, string | null][] = [['email', user.email], ['phone', phone]];
    for (const [kind, value] of values) {
      if (!value) continue;
      await db.run(
        `INSERT INTO banned_identities (id, kind, value_hash, user_id, reason, admin_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP())
         ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), reason = VALUES(reason), admin_id = VALUES(admin_id)`,
        [crypto.randomUUID(), kind, hashOf(kind, value), userId, reason?.trim().slice(0, 200) || null, adminId]
      );
    }
  }

  static async unbanUser(userId: string) {
    await getDatabase().run('DELETE FROM banned_identities WHERE user_id = ?', [userId]);
  }

  static async isUserBanned(userId: string): Promise<boolean> {
    return Boolean(await getDatabase().get('SELECT id FROM banned_identities WHERE user_id = ? LIMIT 1', [userId]));
  }
}
