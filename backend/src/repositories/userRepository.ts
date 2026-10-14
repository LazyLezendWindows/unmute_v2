import crypto from 'crypto';
import { getDatabase, IDatabase } from '../config/database';

export interface UserRow {
  id: string;
  /** Null for accounts created with a phone number. */
  email: string | null;
  is_active: number;
  /** Set while the member has paused their profile (hidden from Discover). */
  paused_at?: string | null;
  suspended_until?: string | null;
  disabled_reason?: string | null;
  moderation_notes?: string | null;
}

export class UserRepository {
  static findById(id: string): Promise<UserRow | null> {
    return getDatabase().get(
      'SELECT id, email, is_active, paused_at, suspended_until, disabled_reason, moderation_notes FROM users WHERE id = ?',
      [id]
    );
  }

  static findByEmail(email: string): Promise<UserRow | null> {
    return getDatabase().get(
      'SELECT id, email, is_active, suspended_until, disabled_reason, moderation_notes FROM users WHERE email = ?',
      [email]
    );
  }

  static async isActive(id: string): Promise<boolean> {
    const row = await this.findById(id);
    if (!row) return false;
    if (row.suspended_until) {
      if (new Date(row.suspended_until) <= new Date()) {
        await getDatabase().run(
          'UPDATE users SET is_active = 1, suspended_until = NULL, disabled_reason = NULL WHERE id = ?',
          [id]
        );
        return true;
      }
      return false;
    }
    return Boolean(row.is_active);
  }

  static async insert(tx: IDatabase, email: string | null): Promise<string> {
    const id = crypto.randomUUID();
    await tx.run('INSERT INTO users (id, email, is_active, created_at) VALUES (?, ?, 1, ?)', [
      id,
      email,
      new Date().toISOString(),
    ]);
    return id;
  }
}
