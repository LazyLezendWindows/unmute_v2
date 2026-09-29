import { getDatabase } from '../config/database';

export interface NotificationPreferences { calls: boolean; messages: boolean }
export async function getNotificationPreferences(userId: string): Promise<NotificationPreferences> {
  const row = await getDatabase().get<{ calls: number; messages: number }>('SELECT calls, messages FROM notification_preferences WHERE user_id = ?', [userId]);
  return row ? { calls: Boolean(row.calls), messages: Boolean(row.messages) } : { calls: true, messages: true };
}
export async function saveNotificationPreferences(userId: string, values: NotificationPreferences) {
  await getDatabase().run(`INSERT INTO notification_preferences (user_id, calls, messages) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE calls = VALUES(calls), messages = VALUES(messages)`, [userId, values.calls, values.messages]);
  return values;
}
