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

/** Signs the member out of every device except the session making the request. */
async function signOutOtherSessions(userId: string, keepSessionId: string) {
  await getDatabase().run(
    'UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND id <> ? AND revoked_at IS NULL',
    [userId, keepSessionId]
  );
  const io = getSocketServer();
  if (!io) return;
  for (const socket of await io.in(`user:${userId}`).fetchSockets()) {
    if (socket.data.sessionId !== keepSessionId) socket.disconnect(true);
  }
}

export class AccountService {
  /**
   * Changes the password (the current one is required), or sets a first password on a phone- or
   * Google-only account that has an email address. Other devices are signed out.
   */
  static async changePassword(userId: string, sessionId: string, input: { currentPassword?: string; newPassword: string }) {
    const db = getDatabase();
    const account = await db.get<{ password_hash: string | null }>(
      "SELECT password_hash FROM auth_accounts WHERE user_id = ? AND provider = 'password'",
      [userId]
    );
    const hash = await bcrypt.hash(input.newPassword, 12);
    const now = new Date().toISOString();
    if (account?.password_hash) {
      if (!input.currentPassword || !(await bcrypt.compare(input.currentPassword, account.password_hash))) {
        throw new AppError('Your current password is not correct.', 403);
      }
      await db.run("UPDATE auth_accounts SET password_hash = ?, updated_at = ? WHERE user_id = ? AND provider = 'password'", [hash, now, userId]);
    } else {
      const user = await db.get<{ email: string | null }>('SELECT email FROM users WHERE id = ?', [userId]);
      if (!user?.email) throw new AppError('Add an email address first; you sign in with your email and this password.', 400);
      await db.run(
        `INSERT INTO auth_accounts (id, user_id, provider, provider_account_id, password_hash, created_at, updated_at)
         VALUES (UUID(), ?, 'password', ?, ?, ?, ?)`,
        [userId, userId, hash, now, now]
      );
    }
    await signOutOtherSessions(userId, sessionId);
  }

  /** Hides the profile from Discover (or shows it again). Matches and chats are not affected. */
  static async setPaused(userId: string, paused: boolean) {
    await getDatabase().run(
      paused ? 'UPDATE users SET paused_at = COALESCE(paused_at, UTC_TIMESTAMP()) WHERE id = ?' : 'UPDATE users SET paused_at = NULL WHERE id = ?',
      [userId]
    );
    return { paused };
  }

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
