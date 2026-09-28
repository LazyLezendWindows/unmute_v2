import crypto from 'crypto';
import { getDatabase, IDatabase } from '../config/database';

export interface PhoneCodeRow {
  id: string;
  code_hash: string;
  attempts: number;
}

/** One-time SMS sign-in codes. Times are compared in the database (UTC) so clocks never disagree. */
export class PhoneCodeRepository {
  /** Codes sent to `phone` in the last `seconds`, and seconds since the newest one (null if none). */
  static async recent(phone: string, seconds: number): Promise<{ count: number; secondsSinceLast: number | null }> {
    const row = await getDatabase().get<{ count: number; since: number | null }>(
      `SELECT COUNT(*) AS count, TIMESTAMPDIFF(SECOND, MAX(created_at), UTC_TIMESTAMP()) AS since
       FROM phone_codes
       WHERE phone = ? AND created_at > UTC_TIMESTAMP() - INTERVAL ? SECOND`,
      [phone, seconds]
    );
    return { count: Number(row?.count ?? 0), secondsSinceLast: row?.since === null || row?.since === undefined ? null : Number(row.since) };
  }

  /** Stores a new code for `phone`; any earlier unused code for the number stops working. */
  static async issue(phone: string, codeHash: string, ttlSeconds: number): Promise<void> {
    await getDatabase().transaction(async (tx) => {
      await tx.run('UPDATE phone_codes SET consumed_at = UTC_TIMESTAMP() WHERE phone = ? AND consumed_at IS NULL', [phone]);
      await tx.run(
        `INSERT INTO phone_codes (id, phone, code_hash, attempts, created_at, expires_at)
         VALUES (?, ?, ?, 0, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ? SECOND)`,
        [crypto.randomUUID(), phone, codeHash, ttlSeconds]
      );
    });
  }

  /** The code currently usable for `phone`: unused and unexpired. */
  static active(phone: string): Promise<PhoneCodeRow | null> {
    return getDatabase().get(
      `SELECT id, code_hash, attempts FROM phone_codes
       WHERE phone = ? AND consumed_at IS NULL AND expires_at > UTC_TIMESTAMP()
       ORDER BY created_at DESC LIMIT 1`,
      [phone]
    );
  }

  static async recordWrongGuess(id: string): Promise<void> {
    await getDatabase().run('UPDATE phone_codes SET attempts = attempts + 1 WHERE id = ?', [id]);
  }

  /** Marks the code used; false when another request already used it (so it signs in only once). */
  static async consume(db: IDatabase, id: string): Promise<boolean> {
    const { changes } = await db.run(
      'UPDATE phone_codes SET consumed_at = UTC_TIMESTAMP() WHERE id = ? AND consumed_at IS NULL',
      [id]
    );
    return changes === 1;
  }
}
