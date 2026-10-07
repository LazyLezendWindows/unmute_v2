import { getDatabase } from '../config/database';
import { freeEndSql } from './subscriptionService';
import { NotificationService } from './notificationService';
import { PushService } from './pushService';

/** How often to look for trials and plans that are ending. */
const CHECK_EVERY_MS = 10 * 60 * 1000;

type Kind = 'trial_ending' | 'trial_ended' | 'plan_ending_3d' | 'plan_ending_1d' | 'plan_ended';

const TEXT: Record<Kind, string> = {
  trial_ending: 'Your free trial ends tomorrow. Choose a plan to keep chatting.',
  trial_ended: 'Your free trial has ended. Choose a plan to continue.',
  plan_ending_3d: 'Your plan ends in 3 days. Renew now to keep your matches and chats going.',
  plan_ending_1d: 'Your plan ends tomorrow. Renew now to keep your matches and chats going.',
  plan_ended: 'Your plan has ended. Renew to continue.',
};

/**
 * Who needs which reminder right now. `ends_at` is the trial or plan end it's about; each
 * (member, kind, end) is sent once. "Ended" reminders only go out for the first 3 days after.
 */
const FREE_END = freeEndSql('s.');
// Free time from referrals after a plan means the plan ending isn't the end of access.
const NO_LATER_FREE_TIME = '(s.free_until IS NULL OR s.free_until <= s.plan_expires_at)';

const CANDIDATES_SQL = `
  SELECT user_id, kind, ends_at FROM (
    SELECT s.user_id, 'trial_ending' AS kind, ${FREE_END} AS ends_at
    FROM subscriptions s
    WHERE s.plan_expires_at IS NULL
      AND ${FREE_END} BETWEEN UTC_TIMESTAMP() AND UTC_TIMESTAMP() + INTERVAL 1 DAY
    UNION ALL
    SELECT s.user_id, 'trial_ended', ${FREE_END}
    FROM subscriptions s
    WHERE s.plan_expires_at IS NULL
      AND ${FREE_END} BETWEEN UTC_TIMESTAMP() - INTERVAL 3 DAY AND UTC_TIMESTAMP()
    UNION ALL
    SELECT s.user_id, 'plan_ending_3d', s.plan_expires_at FROM subscriptions s
    WHERE s.plan_expires_at BETWEEN UTC_TIMESTAMP() + INTERVAL 1 DAY AND UTC_TIMESTAMP() + INTERVAL 3 DAY AND ${NO_LATER_FREE_TIME}
    UNION ALL
    SELECT s.user_id, 'plan_ending_1d', s.plan_expires_at FROM subscriptions s
    WHERE s.plan_expires_at BETWEEN UTC_TIMESTAMP() AND UTC_TIMESTAMP() + INTERVAL 1 DAY AND ${NO_LATER_FREE_TIME}
    UNION ALL
    SELECT s.user_id, 'plan_ended', s.plan_expires_at FROM subscriptions s
    WHERE s.plan_expires_at BETWEEN UTC_TIMESTAMP() - INTERVAL 3 DAY AND UTC_TIMESTAMP() AND ${NO_LATER_FREE_TIME}
  ) due
  JOIN users u ON u.id = due.user_id AND u.is_active = 1
  WHERE NOT EXISTS (
    SELECT 1 FROM plan_reminders r WHERE r.user_id = due.user_id AND r.kind = due.kind AND r.ends_at = due.ends_at
  )
  LIMIT 500`;

export class PlanReminderService {
  /** Sends every reminder that's due; returns how many went out. */
  static async runOnce(): Promise<number> {
    const db = getDatabase();
    const due = await db.query<{ user_id: string; kind: Kind; ends_at: string }>(CANDIDATES_SQL);
    let sent = 0;
    for (const r of due) {
      // Claim it first, so two servers (or overlapping runs) never send the same reminder twice.
      const { changes } = await db.run(
        'INSERT IGNORE INTO plan_reminders (user_id, kind, ends_at, sent_at) VALUES (?, ?, ?, UTC_TIMESTAMP())',
        [r.user_id, r.kind, r.ends_at]
      );
      if (!changes) continue;
      await NotificationService.planReminder(r.user_id, TEXT[r.kind]);
      await PushService.plan(r.user_id, TEXT[r.kind]).catch(() => undefined);
      sent++;
    }
    return sent;
  }

  static start(): ReturnType<typeof setInterval> {
    const tick = () => this.runOnce().catch((err) => console.error('[Plans] Reminder check failed:', err));
    void tick();
    return setInterval(tick, CHECK_EVERY_MS);
  }
}
