import { Request, Response } from 'express';
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
  /**
   * Starts the member's 7-day free trial at their first sign-in; every account gets one, on any
   * device. Signing in again (or on another device) never restarts it.
   */
  static async startTrial(userId: string, _req?: Request, _res?: Response) {
    await getDatabase().run('INSERT IGNORE INTO subscriptions (user_id, trial_started_at) VALUES (?, UTC_TIMESTAMP())', [userId]);
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
