"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionRepository = exports.PLAN_PRICES_INR = void 0;
exports.resolveAccess = resolveAccess;
const crypto_1 = __importDefault(require("crypto"));
const database_1 = require("../config/database");
exports.PLAN_PRICES_INR = {
    day: 2,
    week: 10,
    month: 30,
    '2months': 50,
    '3months': 70,
    '6months': 120,
    year: 200,
};
class SubscriptionRepository {
    static get(userId) {
        return (0, database_1.getDatabase)().get('SELECT * FROM subscriptions WHERE user_id = ?', [userId]);
    }
    /** Creates the trial row on first login; idempotent. */
    static async ensureTrial(tx, userId) {
        await tx.run(`INSERT IGNORE INTO subscriptions (user_id, trial_started_at) VALUES (?, ?)`, [userId, new Date().toISOString()]);
    }
    /** Returns true if the fingerprint is already linked to a DIFFERENT user. */
    static async checkFingerprint(fingerprint, userId) {
        const row = await (0, database_1.getDatabase)().get('SELECT user_id FROM device_fingerprints WHERE fingerprint = ? AND user_id != ? LIMIT 1', [fingerprint, userId]);
        return row?.user_id ?? null;
    }
    static async recordFingerprint(userId, fingerprint) {
        const existing = await (0, database_1.getDatabase)().get('SELECT id FROM device_fingerprints WHERE fingerprint = ? AND user_id = ?', [fingerprint, userId]);
        if (!existing) {
            await (0, database_1.getDatabase)().run('INSERT INTO device_fingerprints (id, fingerprint, user_id, first_seen_at) VALUES (?, ?, ?, ?)', [crypto_1.default.randomUUID(), fingerprint, userId, new Date().toISOString()]);
        }
    }
}
exports.SubscriptionRepository = SubscriptionRepository;
/** Returns the access status for a user based on their subscription row. */
function resolveAccess(sub) {
    if (!sub)
        return { status: 'expired' };
    const now = Date.now();
    const trialEnd = new Date(sub.trial_started_at).getTime() + 7 * 86_400_000;
    if (sub.plan && sub.plan_expires_at && new Date(sub.plan_expires_at).getTime() > now) {
        return { status: 'active', planExpiresAt: sub.plan_expires_at };
    }
    if (now < trialEnd) {
        return { status: 'trial', trialEndsAt: new Date(trialEnd).toISOString() };
    }
    return { status: 'expired' };
}
