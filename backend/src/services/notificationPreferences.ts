import { getDatabase } from '../config/database';

/** `calls` / `messages`: push notifications; `emailAlerts`: emails about matches and messages while away. */
export interface NotificationPreferences { calls: boolean; messages: boolean; emailAlerts: boolean }

export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const row = await getDatabase().get<{ calls: number; messages: number; email_alerts: number }>(
    'SELECT calls, messages, email_alerts FROM notification_preferences WHERE user_id = ?',
    [userId]
  );
  return row
    ? { calls: Boolean(row.calls), messages: Boolean(row.messages), emailAlerts: Boolean(row.email_alerts) }
    : { calls: true, messages: true, emailAlerts: true };
}

export async function saveNotificationPreferences(userId: string, values: { calls: boolean; messages: boolean; emailAlerts?: boolean }) {
  const current = await getNotificationPreferences(userId);
  const next: NotificationPreferences = { calls: values.calls, messages: values.messages, emailAlerts: values.emailAlerts ?? current.emailAlerts };
  await getDatabase().run(
    `INSERT INTO notification_preferences (user_id, calls, messages, email_alerts) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE calls = VALUES(calls), messages = VALUES(messages), email_alerts = VALUES(email_alerts)`,
    [userId, next.calls, next.messages, next.emailAlerts]
  );
  return next;
}
