import crypto from 'crypto';
import { Request, Response } from 'express';
import { parse } from 'cookie';
import { config } from '../config/env';
import { getDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export const PLANS = [
  { id: 'day', label: '1 day', amount: 200, days: 1, months: 0 },
  { id: 'week', label: '1 week', amount: 1000, days: 7, months: 0 },
  { id: 'month', label: '1 month', amount: 3000, days: 0, months: 1 },
  { id: '2months', label: '2 months', amount: 5000, days: 0, months: 2 },
  { id: '3months', label: '3 months', amount: 7000, days: 0, months: 3 },
  { id: '6months', label: '6 months', amount: 12000, days: 0, months: 6 },
  { id: 'year', label: '1 year', amount: 20000, days: 0, months: 12 },
] as const;
const DEVICE_COOKIE = 'unmute_trial_device';
const duplicateMessage = 'An account has already been used on this device. Sign in to your original account and upgrade. Changing your phone number does not start a new free trial.';

export function planEnd(start: Date, plan: typeof PLANS[number]): Date {
  const end = new Date(start);
  if (plan.days) end.setUTCDate(end.getUTCDate() + plan.days);
  else {
    const day = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + plan.months);
    const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(day, last));
  }
  return end;
}

export class SubscriptionService {
  static deviceHash(req: Request): string | null {
    const token = parse(req.headers.cookie || '')[DEVICE_COOKIE];
    return token && /^[a-f0-9]{64}$/.test(token) ? crypto.createHash('sha256').update(token).digest('hex') : null;
  }

  static async assertNewDevice(req: Request) {
    const hash = this.deviceHash(req);
    if (hash && await getDatabase().get('SELECT user_id FROM trial_devices WHERE token_hash = ?', [hash])) {
      throw new AppError(duplicateMessage, 409);
    }
  }

  static async startTrial(userId: string, req: Request, res: Response) {
    const token = crypto.randomBytes(32).toString('hex');
    const existingHash = this.deviceHash(req);
    const hash = existingHash || crypto.createHash('sha256').update(token).digest('hex');
    await getDatabase().transaction(async tx => {
      // Unique primary key plus row lock serializes simultaneous claims on this installation.
      await tx.run('INSERT IGNORE INTO trial_devices (token_hash, user_id) VALUES (?, ?)', [hash, userId]);
      const claim = await tx.get<{ user_id: string }>('SELECT user_id FROM trial_devices WHERE token_hash = ? FOR UPDATE', [hash]);
      if (claim!.user_id !== userId) throw new AppError(duplicateMessage, 409);
      await tx.run('INSERT IGNORE INTO subscriptions (user_id, trial_started_at) VALUES (?, UTC_TIMESTAMP())', [userId]);
    });
    if (!existingHash) res.cookie(DEVICE_COOKIE, token, {
      httpOnly: true, secure: config.session.secure, sameSite: config.session.sameSite,
      path: '/', maxAge: 400 * 86400000,
    });
  }

  static async status(userId: string) {
    const row = await getDatabase().get<{ trialEnd: number; paidStart: number | null; paidEnd: number | null; now: number; plan: string | null }>(
      `SELECT TIMESTAMPDIFF(SECOND, '1970-01-01', DATE_ADD(trial_started_at, INTERVAL 7 DAY)) AS trialEnd,
       TIMESTAMPDIFF(SECOND, '1970-01-01', plan_started_at) AS paidStart,
       TIMESTAMPDIFF(SECOND, '1970-01-01', plan_expires_at) AS paidEnd, TIMESTAMPDIFF(SECOND, '1970-01-01', UTC_TIMESTAMP()) AS now, plan
       FROM subscriptions WHERE user_id = ?`, [userId]);
    if (!row) return { active: false, state: 'expired', expiresAt: null, trialEndsAt: null, plan: null, planStartsAt: null };
    const now = Number(row.now);
    const end = Math.max(Number(row.trialEnd), Number(row.paidEnd || 0));
    // 'paid' (with Premium) only once the plan period has begun; bought during the trial, it waits for it to end.
    const paidNow = Number(row.paidEnd || 0) > now && Number(row.paidStart ?? now) <= now;
    const upcoming = Number(row.paidEnd || 0) > now && !paidNow;
    return {
      active: end > now,
      state: end <= now ? 'expired' : paidNow ? 'paid' : 'trial',
      expiresAt: new Date(end * 1000).toISOString(),
      trialEndsAt: new Date(Number(row.trialEnd) * 1000).toISOString(), plan: row.plan,
      /** A plan bought during the free trial: it (and Premium) starts at this time. */
      planStartsAt: upcoming && row.paidStart ? new Date(Number(row.paidStart) * 1000).toISOString() : null,
    };
  }

  static async requireAccess(userId: string) {
    if (!(await this.status(userId)).active) throw new AppError('Your free trial or plan has ended. Please upgrade to continue.', 402);
  }
}
