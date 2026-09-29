import crypto from 'crypto';
import { getDatabase } from '../config/database';
import { blockedBetween } from './sql';

export class InteractionRepository {
  /** Idempotent: repeating a like is a no-op (unique (liker_id, likee_id)). */
  static async like(likerId: string, likeeId: string, isSuper = false): Promise<void> {
    await getDatabase().run(
      `INSERT INTO likes (id, liker_id, likee_id, created_at, is_super) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE is_super = GREATEST(is_super, VALUES(is_super))`,
      [crypto.randomUUID(), likerId, likeeId, new Date().toISOString(), isSuper ? 1 : 0]
    );
  }

  /** Super Likes sent by `userId` since `sinceIso`. */
  static async countSuperLikesSince(userId: string, sinceIso: string): Promise<number> {
    const row = await getDatabase().get<{ n: number | string }>(
      'SELECT COUNT(*) AS n FROM likes WHERE liker_id = ? AND is_super = 1 AND created_at > ?',
      [userId, sinceIso]
    );
    return Number(row?.n ?? 0);
  }

  static async isSuperLike(likerId: string, likeeId: string): Promise<boolean> {
    return Boolean(await getDatabase().get('SELECT id FROM likes WHERE liker_id = ? AND likee_id = ? AND is_super = 1', [likerId, likeeId]));
  }

  /** Takes back a recent pass (Rewind); false when there's none from the last hour. */
  static async undoPass(passerId: string, passeeId: string, sinceIso: string): Promise<boolean> {
    const { changes } = await getDatabase().run(
      'DELETE FROM passes WHERE passer_id = ? AND passee_id = ? AND created_at > ?',
      [passerId, passeeId, sinceIso]
    );
    return changes > 0;
  }

  static async pass(passerId: string, passeeId: string): Promise<void> {
    await getDatabase().run(
      'INSERT INTO passes (id, passer_id, passee_id, created_at) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE id = id',
      [crypto.randomUUID(), passerId, passeeId, new Date().toISOString()]
    );
  }

  /** How many members like `userId`, leaving out anyone blocked either way. */
  static async countLikesReceived(userId: string): Promise<number> {
    const row = await getDatabase().get<{ n: number | string }>(
      `SELECT COUNT(*) AS n FROM likes l WHERE l.likee_id = ? AND NOT ${blockedBetween('l.likee_id', 'l.liker_id')}`,
      [userId]
    );
    return Number(row?.n ?? 0);
  }

  static async hasLiked(likerId: string, likeeId: string): Promise<boolean> {
    return Boolean(
      await getDatabase().get('SELECT id FROM likes WHERE liker_id = ? AND likee_id = ?', [likerId, likeeId])
    );
  }

  /** Profiles the user liked that haven't matched back yet (no mutual match, no block, still active). */
  static async getLikedNotMatched(userId: string): Promise<{ likee_id: string; created_at: string; is_super: number }[]> {
    return getDatabase().query(
      `SELECT l.likee_id, l.created_at, l.is_super FROM likes l
       JOIN users u ON u.id = l.likee_id AND u.is_active = 1
       WHERE l.liker_id = ?
         AND NOT EXISTS (
           SELECT 1 FROM matches m
           WHERE (m.user_a_id = l.liker_id AND m.user_b_id = l.likee_id)
              OR (m.user_a_id = l.likee_id AND m.user_b_id = l.liker_id)
         )
         AND NOT ${blockedBetween('l.liker_id', 'l.likee_id')}
       ORDER BY l.created_at DESC`,
      [userId]
    );
  }

  /** People who liked the user and are still waiting for an answer (not liked back or passed yet). */
  static async getLikersPending(userId: string): Promise<{ liker_id: string; created_at: string; is_super: number }[]> {
    return getDatabase().query(
      `SELECT l.liker_id, l.created_at, l.is_super FROM likes l
       JOIN users u ON u.id = l.liker_id AND u.is_active = 1
       WHERE l.likee_id = ?
         AND NOT EXISTS (SELECT 1 FROM likes back WHERE back.liker_id = l.likee_id AND back.likee_id = l.liker_id)
         AND NOT EXISTS (SELECT 1 FROM passes p WHERE p.passer_id = l.likee_id AND p.passee_id = l.liker_id)
         AND NOT ${blockedBetween('l.liker_id', 'l.likee_id')}
       -- Super Likes first, then likes from paid (Premium) members, then newest.
       ORDER BY l.is_super DESC,
                EXISTS (SELECT 1 FROM subscriptions sp WHERE sp.user_id = l.liker_id AND sp.plan_expires_at > UTC_TIMESTAMP()) DESC,
                l.created_at DESC`,
      [userId]
    );
  }
}
