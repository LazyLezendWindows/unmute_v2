"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PushService = void 0;
const notificationPreferences_1 = require("./notificationPreferences");
const subscriptionService_1 = require("./subscriptionService");
const crypto_1 = __importDefault(require("crypto"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const web_push_1 = __importDefault(require("web-push"));
const env_1 = require("../config/env");
const database_1 = require("../config/database");
const profileRepository_1 = require("../repositories/profileRepository");
const presence_1 = require("../sockets/presence");
let keys;
/**
 * The VAPID key pair that signs pushes. From VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; outside
 * production a pair is made once and kept in data/vapid.json so local testing just works.
 * Changing the keys invalidates every existing subscription, so keep them stable in production.
 */
function vapidKeys() {
    if (keys !== undefined)
        return keys;
    const { publicKey, privateKey } = env_1.config.push;
    if (publicKey && privateKey) {
        keys = { publicKey, privateKey };
    }
    else if (!env_1.config.isProduction && env_1.config.env !== 'test') {
        const file = path_1.default.resolve(env_1.config.uploadDir, '../vapid.json');
        try {
            keys = JSON.parse(fs_1.default.readFileSync(file, 'utf8'));
        }
        catch {
            keys = web_push_1.default.generateVAPIDKeys();
            fs_1.default.mkdirSync(path_1.default.dirname(file), { recursive: true });
            fs_1.default.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
        }
    }
    else {
        keys = null;
    }
    if (keys)
        web_push_1.default.setVapidDetails(env_1.config.push.subject, keys.publicKey, keys.privateKey);
    return keys;
}
async function sendTo(userId, payload, options = {}) {
    const type = payload.type;
    // Plan reminders are for people whose access is ending or over, so they skip the access check.
    if (!vapidKeys() || (type !== 'plan' && !(await subscriptionService_1.SubscriptionService.status(userId)).active))
        return;
    const prefs = await (0, notificationPreferences_1.getNotificationPreferences)(userId);
    if ((type === 'call' && !prefs.calls) || (type === 'message' && !prefs.messages))
        return;
    const db = (0, database_1.getDatabase)();
    const subs = await db.query('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', [userId]);
    await Promise.all(subs.map(async (sub) => {
        try {
            await web_push_1.default.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), options);
        }
        catch (err) {
            // The browser uninstalled the app or revoked permission: forget the subscription.
            if (err?.statusCode === 404 || err?.statusCode === 410) {
                await db.run('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
            }
            else {
                console.warn('[Push] Delivery failed:', err?.statusCode ?? err?.message);
            }
        }
    }));
}
class PushService {
    static publicKey() {
        return vapidKeys()?.publicKey ?? null;
    }
    static async subscribe(userId, sub) {
        // A browser's endpoint follows whoever is signed in on it now.
        await (0, database_1.getDatabase)().run(`INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`, [crypto_1.default.randomUUID(), userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]);
    }
    static async unsubscribe(userId, endpoint) {
        await (0, database_1.getDatabase)().run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [userId, endpoint]);
    }
    /** Rings the member's phone when none of their apps are open (open apps ring on their own). */
    static async incomingCall(calleeId, callerId, conversationId, mode) {
        if ((0, presence_1.isOnline)(calleeId))
            return;
        const [caller] = await profileRepository_1.ProfileRepository.findByUserIds([callerId]).then((m) => [m.get(callerId)]);
        await sendTo(calleeId, {
            type: 'call',
            conversationId,
            mode,
            title: caller?.display_name || 'Your match',
            body: `Incoming ${mode} call on Unmute`,
            icon: caller?.avatar_url || '/pwa-192x192.png',
            url: `/chat/${conversationId}?incomingCall=${mode}`,
        }, { TTL: 45, urgency: 'high', topic: `call-${conversationId.slice(0, 20)}` });
    }
    /** Replaces the ringing notification with "Missed call" once the call stops ringing. */
    static async callEnded(calleeId, conversationId) {
        if ((0, presence_1.isOnline)(calleeId))
            return;
        await sendTo(calleeId, { type: 'call-ended', conversationId, url: `/chat/${conversationId}` }, { TTL: 3600, topic: `call-${conversationId.slice(0, 20)}` });
    }
    /** Trial or plan ending: shown even while the app is open elsewhere, since it needs action. */
    static async plan(userId, text) {
        await sendTo(userId, { type: 'plan', title: 'Unmute', body: text, url: '/upgrade' }, { TTL: 86400 });
    }
    /** A new message while the member has no app open. */
    static async message(recipientId, senderName, conversationId, text) {
        if ((0, presence_1.isOnline)(recipientId))
            return;
        await sendTo(recipientId, { type: 'message', conversationId, title: senderName, body: text, url: `/chat/${conversationId}` }, { TTL: 86400 });
    }
}
exports.PushService = PushService;
