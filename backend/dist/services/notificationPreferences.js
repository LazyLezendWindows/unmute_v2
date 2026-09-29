"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getNotificationPreferences = getNotificationPreferences;
exports.saveNotificationPreferences = saveNotificationPreferences;
const database_1 = require("../config/database");
async function getNotificationPreferences(userId) {
    const row = await (0, database_1.getDatabase)().get('SELECT calls, messages FROM notification_preferences WHERE user_id = ?', [userId]);
    return row ? { calls: Boolean(row.calls), messages: Boolean(row.messages) } : { calls: true, messages: true };
}
async function saveNotificationPreferences(userId, values) {
    await (0, database_1.getDatabase)().run(`INSERT INTO notification_preferences (user_id, calls, messages) VALUES (?, ?, ?)
    ON DUPLICATE KEY UPDATE calls = VALUES(calls), messages = VALUES(messages)`, [userId, values.calls, values.messages]);
    return values;
}
