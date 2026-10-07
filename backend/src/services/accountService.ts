import bcrypt from 'bcryptjs';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env';
import { getDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { getSocketServer } from '../sockets/chatSocket';

/** Removes every uploaded file of this member (photos, voice messages, verification images). */
async function removeFiles(dir: string, userId: string) {
  const names = await fs.readdir(dir).catch(() => [] as string[]);
  await Promise.all(names.filter((n) => n.startsWith(`${userId}-`)).map((n) => fs.unlink(path.join(dir, n)).catch(() => undefined)));
}

export class AccountService {
  /**
   * Permanently deletes the member's account. Every row tied to the user (profile, sessions, likes,
   * matches, conversations, messages, notifications, plans, verification requests) is removed by the
   * database's ON DELETE CASCADE rules; uploaded files are deleted afterwards.
   *
   * Accounts with a password must confirm with it; accounts without one (phone or Google sign-in)
   * confirm by typing DELETE.
   */
  static async deleteAccount(userId: string, input: { password?: string; confirm?: string }) {
    const db = getDatabase();
    const account = await db.get<{ password_hash: string | null }>(
      "SELECT password_hash FROM auth_accounts WHERE user_id = ? AND provider = 'password'",
      [userId]
    );
    if (account?.password_hash) {
      if (!input.password || !(await bcrypt.compare(input.password, account.password_hash))) {
        throw new AppError('That password is not correct.', 403);
      }
    } else if (input.confirm !== 'DELETE') {
      throw new AppError('Type DELETE to confirm.', 400);
    }

    const { changes } = await db.run('DELETE FROM users WHERE id = ?', [userId]);
    if (!changes) throw new AppError('User not found', 404);

    getSocketServer()?.in(`user:${userId}`).disconnectSockets(true);
    await Promise.all([removeFiles(config.uploadDir, userId), removeFiles(config.privateUploadDir, userId)]);
  }
}
