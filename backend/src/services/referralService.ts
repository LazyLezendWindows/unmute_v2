import crypto from 'crypto';
import { getDatabase, IDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { freeEndSql } from './subscriptionService';
import { NotificationService } from './notificationService';

/** Free access each side gets for a successful referral. */
export const REFERRAL_REWARD_DAYS = 14;
/** A referrer earns from at most this many friends. */
export const MAX_REWARDED_REFERRALS = 10;
/** New members can add a code until this many days after joining. */
const ENTER_CODE_WITHIN_DAYS = 7;

/** "Asha Rao" → "asharao" (letters and digits only, up to 12). */
function slug(name: string): string {
  return name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]/g, '').slice(0, 12) || 'member';
}

export function normaliseCode(code: string): string {
  return code.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/**
 * Referrals. Every member has a code like a username ("asha4821"). A new member enters a friend's
 * code at sign-up (or within their first week). When the new account has a verified mobile number
 * (so one person can't farm rewards with throwaway email accounts), both get two weeks of free
 * access, added after whatever trial or plan time they already have.
 */
export class ReferralService {
  /** The member's code, created on first use. */
  static async codeFor(userId: string): Promise<string> {
    const db = getDatabase();
    const row = await db.get<{ referral_code: string | null; display_name: string | null }>(
      'SELECT u.referral_code, p.display_name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?',
      [userId]
    );
    if (!row) throw new AppError('User not found', 404);
    if (row.referral_code) return row.referral_code;
    const base = slug(row.display_name || '');
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = `${base}${crypto.randomInt(1000, 10000)}`;
      try {
        const { changes } = await db.run('UPDATE users SET referral_code = ? WHERE id = ? AND referral_code IS NULL', [code, userId]);
        if (changes) return code;
        return (await db.get<{ referral_code: string }>('SELECT referral_code FROM users WHERE id = ?', [userId]))!.referral_code;
      } catch (err: any) {
        if (err?.code !== 'ER_DUP_ENTRY') throw err;
      }
    }
    throw new AppError('Could not create a referral code. Please try again.', 500);
  }

  /** The referrer for a code, or an error the sign-up form can show. */
  static async findReferrer(code: string): Promise<string> {
    const clean = normaliseCode(code);
    const row = clean
      ? await getDatabase().get<{ id: string }>('SELECT id FROM users WHERE referral_code = ? AND is_active = 1', [clean])
      : null;
    if (!row) throw new AppError('That referral code doesn’t exist. Check it with your friend, or leave it empty.', 400);
    return row.id;
  }

  /** Records who referred a new member, then rewards both if the new account is already verified. */
  static async apply(referredId: string, code: string) {
    const referrerId = await this.findReferrer(code);
    if (referrerId === referredId) throw new AppError('You can’t use your own referral code.', 400);
    const db = getDatabase();
    const joined = await db.get<{ recent: number }>(
      `SELECT created_at > DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL ${ENTER_CODE_WITHIN_DAYS} DAY, '%Y-%m-%dT%H:%i:%s') AS recent FROM users WHERE id = ?`,
      [referredId]
    );
    if (!joined) throw new AppError('User not found', 404);
    if (!Number(joined.recent)) throw new AppError(`Referral codes can only be added in your first ${ENTER_CODE_WITHIN_DAYS} days.`, 400);
    const { changes } = await db.run(
      'INSERT IGNORE INTO referrals (referred_id, referrer_id, created_at) VALUES (?, ?, UTC_TIMESTAMP())',
      [referredId, referrerId]
    );
    if (!changes) throw new AppError('You’ve already added a referral code.', 409);
    await this.rewardIfReady(referredId);
    return this.overview(referredId);
  }

  /** Grants both rewards once the referred account has a verified mobile number (called after phone sign-up or linking). */
  static async rewardIfReady(referredId: string) {
    const db = getDatabase();
    const referral = await db.get<{ referrer_id: string | null }>(
      `SELECT r.referrer_id FROM referrals r
       WHERE r.referred_id = ? AND r.rewarded_at IS NULL
         AND EXISTS (SELECT 1 FROM auth_accounts a WHERE a.user_id = r.referred_id AND a.provider = 'phone')`,
      [referredId]
    );
    if (!referral?.referrer_id) return;
    const referrerId = referral.referrer_id;

    const rewarded = await db.transaction(async (tx) => {
      // Claim the reward exactly once, even if two requests race.
      const { changes } = await tx.run('UPDATE referrals SET rewarded_at = UTC_TIMESTAMP() WHERE referred_id = ? AND rewarded_at IS NULL', [referredId]);
      if (!changes) return null;
      const earned = await tx.get<{ n: number }>(
        'SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ? AND rewarded_at IS NOT NULL AND referred_id <> ?',
        [referrerId, referredId]
      );
      const referrerGetsTime = Number(earned?.n ?? 0) < MAX_REWARDED_REFERRALS;
      await addFreeDays(tx, referredId, REFERRAL_REWARD_DAYS);
      if (referrerGetsTime) await addFreeDays(tx, referrerId, REFERRAL_REWARD_DAYS);
      return { referrerGetsTime };
    });
    if (!rewarded) return;

    const names = await db.query<{ user_id: string; display_name: string }>(
      'SELECT user_id, display_name FROM profiles WHERE user_id IN (?, ?)',
      [referrerId, referredId]
    );
    const nameOf = (id: string) => names.find((n) => n.user_id === id)?.display_name || 'Your friend';
    await NotificationService.planReminder(referredId, `You joined with ${nameOf(referrerId)}'s code: 2 weeks of free access added!`);
    await NotificationService.planReminder(
      referrerId,
      rewarded.referrerGetsTime
        ? `${nameOf(referredId)} joined with your code: 2 weeks of free access added!`
        : `${nameOf(referredId)} joined with your code. You've reached the ${MAX_REWARDED_REFERRALS}-friend limit for free time.`
    );
  }

  /** The Refer & earn page: your code, what you've earned, and whether you can still add a code. */
  static async overview(userId: string) {
    const db = getDatabase();
    const [code, stats, mine, joined] = await Promise.all([
      this.codeFor(userId),
      db.get<{ joined: number; rewarded: number }>(
        'SELECT COUNT(*) AS joined, COALESCE(SUM(rewarded_at IS NOT NULL), 0) AS rewarded FROM referrals WHERE referrer_id = ?',
        [userId]
      ),
      db.get<{ code: string | null; name: string | null; rewarded_at: string | null }>(
        `SELECT u.referral_code AS code, p.display_name AS name, r.rewarded_at
         FROM referrals r LEFT JOIN users u ON u.id = r.referrer_id LEFT JOIN profiles p ON p.user_id = r.referrer_id
         WHERE r.referred_id = ?`,
        [userId]
      ),
      db.get<{ recent: number }>(
        `SELECT created_at > DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL ${ENTER_CODE_WITHIN_DAYS} DAY, '%Y-%m-%dT%H:%i:%s') AS recent FROM users WHERE id = ?`,
        [userId]
      ),
    ]);
    const rewarded = Number(stats?.rewarded ?? 0);
    return {
      code,
      rewardDays: REFERRAL_REWARD_DAYS,
      maxRewarded: MAX_REWARDED_REFERRALS,
      friendsJoined: Number(stats?.joined ?? 0),
      friendsRewarded: rewarded,
      daysEarned: Math.min(rewarded, MAX_REWARDED_REFERRALS) * REFERRAL_REWARD_DAYS,
      /** Who referred you, once you've added a code. */
      referredBy: mine ? { code: mine.code, name: mine.name, rewarded: Boolean(mine.rewarded_at) } : null,
      canEnterCode: !mine && Boolean(Number(joined?.recent ?? 0)),
    };
  }
}

/** Adds free access after whatever the member already has (trial, plan, or earlier free time). */
async function addFreeDays(tx: IDatabase, userId: string, days: number) {
  await tx.run('INSERT IGNORE INTO subscriptions (user_id, trial_started_at) VALUES (?, UTC_TIMESTAMP())', [userId]);
  await tx.run(
    `UPDATE subscriptions
     SET free_until = DATE_ADD(GREATEST(UTC_TIMESTAMP(), ${freeEndSql()}, COALESCE(plan_expires_at, trial_started_at)), INTERVAL ? DAY)
     WHERE user_id = ?`,
    [days, userId]
  );
}
