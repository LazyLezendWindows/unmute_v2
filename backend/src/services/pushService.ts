import { getNotificationPreferences } from './notificationPreferences';
import { SubscriptionService } from './subscriptionService';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import webpush from 'web-push';
import { config } from '../config/env';
import { getDatabase } from '../config/database';
import { ProfileRepository } from '../repositories/profileRepository';
import { isOnline } from '../sockets/presence';

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

let keys: { publicKey: string; privateKey: string } | null | undefined;

/**
 * The VAPID key pair that signs pushes. From VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY; outside
 * production a pair is made once and kept in data/vapid.json so local testing just works.
 * Changing the keys invalidates every existing subscription, so keep them stable in production.
 */
function vapidKeys() {
  if (keys !== undefined) return keys;
  const { publicKey, privateKey } = config.push;
  if (publicKey && privateKey) {
    keys = { publicKey, privateKey };
  } else if (!config.isProduction && config.env !== 'test') {
    const file = path.resolve(config.uploadDir, '../vapid.json');
    try {
      keys = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      keys = webpush.generateVAPIDKeys();
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(keys), { mode: 0o600 });
    }
  } else {
    keys = null;
  }
  if (keys) webpush.setVapidDetails(config.push.subject, keys.publicKey, keys.privateKey);
  return keys;
}

async function sendTo(userId: string, payload: object, options: webpush.RequestOptions = {}) {
  const type = (payload as { type?: string }).type;
  // Plan reminders are for people whose access is ending or over, so they skip the access check.
  if (!vapidKeys() || (type !== 'plan' && !(await SubscriptionService.status(userId)).active)) return;
  const prefs = await getNotificationPreferences(userId);
  if ((type === 'call' && !prefs.calls) || (type === 'message' && !prefs.messages)) return;
  const db = getDatabase();
  const subs = await db.query<SubscriptionRow>('SELECT id, endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ?', [userId]);
  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } }, JSON.stringify(payload), options);
      } catch (err: any) {
        // The browser uninstalled the app or revoked permission: forget the subscription.
        if (err?.statusCode === 404 || err?.statusCode === 410) {
          await db.run('DELETE FROM push_subscriptions WHERE id = ?', [sub.id]);
        } else {
          console.warn('[Push] Delivery failed:', err?.statusCode ?? err?.message);
        }
      }
    })
  );
}

export class PushService {
  static publicKey(): string | null {
    return vapidKeys()?.publicKey ?? null;
  }

  static async subscribe(userId: string, sub: { endpoint: string; keys: { p256dh: string; auth: string } }) {
    // A browser's endpoint follows whoever is signed in on it now.
    await getDatabase().run(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), p256dh = VALUES(p256dh), auth = VALUES(auth)`,
      [crypto.randomUUID(), userId, sub.endpoint, sub.keys.p256dh, sub.keys.auth]
    );
  }

  static async unsubscribe(userId: string, endpoint: string) {
    await getDatabase().run('DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?', [userId, endpoint]);
  }

  /** Rings the member's phone when none of their apps are open (open apps ring on their own). */
  static async incomingCall(calleeId: string, callerId: string, conversationId: string, mode: 'voice' | 'video') {
    if (isOnline(calleeId)) return;
    const [caller] = await ProfileRepository.findByUserIds([callerId]).then((m) => [m.get(callerId)]);
    await sendTo(
      calleeId,
      {
        type: 'call',
        conversationId,
        mode,
        title: caller?.display_name || 'Your match',
        body: `Incoming ${mode} call on Unmute`,
        icon: caller?.avatar_url || '/pwa-192x192.png',
        url: `/chat/${conversationId}?incomingCall=${mode}`,
      },
      { TTL: 45, urgency: 'high', topic: `call-${conversationId.slice(0, 20)}` }
    );
  }

  /** Replaces the ringing notification with "Missed call" once the call stops ringing. */
  static async callEnded(calleeId: string, conversationId: string) {
    if (isOnline(calleeId)) return;
    await sendTo(calleeId, { type: 'call-ended', conversationId, url: `/chat/${conversationId}` }, { TTL: 3600, topic: `call-${conversationId.slice(0, 20)}` });
  }

  /** Trial or plan ending: shown even while the app is open elsewhere, since it needs action. */
  static async plan(userId: string, text: string) {
    await sendTo(userId, { type: 'plan', title: 'Unmute', body: text, url: '/upgrade' }, { TTL: 86400 });
  }

  /** A new mutual match: alerts the member so they can start chatting. */
  static async matched(userId: string, partnerName: string, conversationId: string, avatarUrl?: string | null) {
    await sendTo(
      userId,
      {
        type: 'match',
        conversationId,
        title: "It's a Match! 🎉",
        body: `You and ${partnerName} liked each other. Say hello!`,
        icon: avatarUrl || '/pwa-192x192.png',
        url: `/chat/${conversationId}`,
      },
      { TTL: 86400, urgency: 'high' }
    );
  }

  /** A new message while the member has no app open. */
  static async message(recipientId: string, senderName: string, conversationId: string, text: string) {
    if (isOnline(recipientId)) return;
    await sendTo(recipientId, { type: 'message', conversationId, title: senderName, body: text, url: `/chat/${conversationId}` }, { TTL: 86400 });
  }
}
