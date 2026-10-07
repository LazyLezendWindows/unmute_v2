import { config } from '../config/env';
import { getDatabase } from '../config/database';
import { isOnline } from '../sockets/presence';
import { emailAvailable, sendEmail } from './auth/emailSender';
import { getNotificationPreferences } from './notificationPreferences';

/** At most one email per conversation in this many hours. */
const QUIET_HOURS = 6;

/**
 * Emails about new matches and messages, for members who aren't using the app right now.
 * Never includes what the message says (only who sent it), and never more than one email per
 * conversation every few hours. Members turn these off in their notification settings.
 */
export class EmailAlertService {
  static async matched(userId: string, otherName: string, conversationId: string) {
    await this.send(userId, `match:${conversationId}`, `It's a match with ${otherName}!`, [
      `You and ${otherName} liked each other on Unmute.`,
      `Say hi: ${config.appUrl}/chat/${conversationId}`,
    ]);
  }

  static async message(userId: string, senderName: string, conversationId: string) {
    await this.send(userId, `msg:${conversationId}`, `${senderName} sent you a message`, [
      `${senderName} sent you a message on Unmute.`,
      `Read and reply: ${config.appUrl}/chat/${conversationId}`,
    ]);
  }

  private static async send(userId: string, topic: string, subject: string, lines: string[]) {
    try {
      if (!emailAvailable() || isOnline(userId)) return;
      const db = getDatabase();
      const user = await db.get<{ email: string | null; is_active: number }>('SELECT email, is_active FROM users WHERE id = ?', [userId]);
      if (!user?.email || !user.is_active) return;
      if (!(await getNotificationPreferences(userId)).emailAlerts) return;
      const recent = await db.get(
        `SELECT 1 FROM email_alert_log WHERE user_id = ? AND topic = ? AND sent_at > UTC_TIMESTAMP() - INTERVAL ${QUIET_HOURS} HOUR`,
        [userId, topic]
      );
      if (recent) return;
      await db.run(
        'INSERT INTO email_alert_log (user_id, topic, sent_at) VALUES (?, ?, UTC_TIMESTAMP()) ON DUPLICATE KEY UPDATE sent_at = VALUES(sent_at)',
        [userId, topic]
      );
      await sendEmail(
        user.email,
        subject,
        [...lines, '', `You're getting this because email alerts are on. Turn them off in Unmute: Profile → Notifications.`].join('\n')
      );
    } catch (err) {
      console.error('[EmailAlerts] Not sent:', (err as Error).message);
    }
  }
}
