import { Request, Response } from 'express';
import { getDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';

export const PLANS = [
  { id: '1hour', label: '1 hour', amount: 1000, hours: 1, days: 0, months: 0 },
  { id: 'day', label: '1 day', amount: 2500, hours: 0, days: 1, months: 0 },
  { id: 'week', label: '1 week', amount: 7000, hours: 0, days: 7, months: 0 },
  { id: 'month', label: '1 month', amount: 15000, hours: 0, days: 0, months: 1 },
  { id: '2months', label: '2 months', amount: 25000, hours: 0, days: 0, months: 2 },
  { id: '3months', label: '3 months', amount: 35000, hours: 0, days: 0, months: 3 },
  { id: '6months', label: '6 months', amount: 60000, hours: 0, days: 0, months: 6 },
  { id: 'year', label: '1 year', amount: 100000, hours: 0, days: 0, months: 12 },
] as const;

/**
 * When free access ends: the 1-day trial, or later if referral rewards added free time
 * (`free_until`). `alias` is the subscriptions table alias in the query, e.g. 's.'.
 */
export function freeEndSql(alias = ''): string {
  return `GREATEST(DATE_ADD(${alias}trial_started_at, INTERVAL 1 DAY), COALESCE(${alias}free_until, ${alias}trial_started_at))`;
}

export function planEnd(start: Date, plan: typeof PLANS[number]): Date {
  const end = new Date(start);
  if (plan.hours) end.setUTCHours(end.getUTCHours() + plan.hours);
  else if (plan.days) end.setUTCDate(end.getUTCDate() + plan.days);
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
   * Starts the member's 1-day free trial at their first sign-in; every account gets one, on any
   * device. Signing in again (or on another device) never restarts it.
   */
  static async startTrial(userId: string, _req?: Request, _res?: Response) {
    await getDatabase().run('INSERT IGNORE INTO subscriptions (user_id, trial_started_at) VALUES (?, UTC_TIMESTAMP())', [userId]);
  }

  static async status(userId: string) {
    const row = await getDatabase().get<{ trialEnd: number; paidStart: number | null; paidEnd: number | null; now: number; plan: string | null }>(
      `SELECT TIMESTAMPDIFF(SECOND, '1970-01-01', ${freeEndSql()}) AS trialEnd,
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
