"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanReminderService = void 0;
const database_1 = require("../config/database");
const notificationService_1 = require("./notificationService");
const pushService_1 = require("./pushService");
/** How often to look for trials and plans that are ending. */
const CHECK_EVERY_MS = 10 * 60 * 1000;
const TEXT = {
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
const CANDIDATES_SQL = `
  SELECT user_id, kind, ends_at FROM (
    SELECT s.user_id, 'trial_ending' AS kind, DATE_ADD(s.trial_started_at, INTERVAL 7 DAY) AS ends_at
    FROM subscriptions s
    WHERE s.plan_expires_at IS NULL
      AND DATE_ADD(s.trial_started_at, INTERVAL 7 DAY) BETWEEN UTC_TIMESTAMP() AND UTC_TIMESTAMP() + INTERVAL 1 DAY
    UNION ALL
    SELECT s.user_id, 'trial_ended', DATE_ADD(s.trial_started_at, INTERVAL 7 DAY)
    FROM subscriptions s
    WHERE s.plan_expires_at IS NULL
      AND DATE_ADD(s.trial_started_at, INTERVAL 7 DAY) BETWEEN UTC_TIMESTAMP() - INTERVAL 3 DAY AND UTC_TIMESTAMP()
    UNION ALL
    SELECT s.user_id, 'plan_ending_3d', s.plan_expires_at FROM subscriptions s
    WHERE s.plan_expires_at BETWEEN UTC_TIMESTAMP() + INTERVAL 1 DAY AND UTC_TIMESTAMP() + INTERVAL 3 DAY
    UNION ALL
    SELECT s.user_id, 'plan_ending_1d', s.plan_expires_at FROM subscriptions s
    WHERE s.plan_expires_at BETWEEN UTC_TIMESTAMP() AND UTC_TIMESTAMP() + INTERVAL 1 DAY
    UNION ALL
    SELECT s.user_id, 'plan_ended', s.plan_expires_at FROM subscriptions s
    WHERE s.plan_expires_at BETWEEN UTC_TIMESTAMP() - INTERVAL 3 DAY AND UTC_TIMESTAMP()
  ) due
  JOIN users u ON u.id = due.user_id AND u.is_active = 1
  WHERE NOT EXISTS (
    SELECT 1 FROM plan_reminders r WHERE r.user_id = due.user_id AND r.kind = due.kind AND r.ends_at = due.ends_at
  )
  LIMIT 500`;
class PlanReminderService {
    /** Sends every reminder that's due; returns how many went out. */
    static async runOnce() {
        const db = (0, database_1.getDatabase)();
        const due = await db.query(CANDIDATES_SQL);
        let sent = 0;
        for (const r of due) {
            // Claim it first, so two servers (or overlapping runs) never send the same reminder twice.
            const { changes } = await db.run('INSERT IGNORE INTO plan_reminders (user_id, kind, ends_at, sent_at) VALUES (?, ?, ?, UTC_TIMESTAMP())', [r.user_id, r.kind, r.ends_at]);
            if (!changes)
                continue;
            await notificationService_1.NotificationService.planReminder(r.user_id, TEXT[r.kind]);
            await pushService_1.PushService.plan(r.user_id, TEXT[r.kind]).catch(() => undefined);
            sent++;
        }
        return sent;
    }
    static start() {
        const tick = () => this.runOnce().catch((err) => console.error('[Plans] Reminder check failed:', err));
        void tick();
        return setInterval(tick, CHECK_EVERY_MS);
    }
}
exports.PlanReminderService = PlanReminderService;
