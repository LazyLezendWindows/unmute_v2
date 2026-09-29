"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SubscriptionService = exports.PLANS = void 0;
exports.planEnd = planEnd;
const crypto_1 = __importDefault(require("crypto"));
const cookie_1 = require("cookie");
const env_1 = require("../config/env");
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
exports.PLANS = [
    { id: 'day', label: '1 day', amount: 200, days: 1, months: 0 },
    { id: 'week', label: '1 week', amount: 1000, days: 7, months: 0 },
    { id: 'month', label: '1 month', amount: 3000, days: 0, months: 1 },
    { id: '2months', label: '2 months', amount: 5000, days: 0, months: 2 },
    { id: '3months', label: '3 months', amount: 7000, days: 0, months: 3 },
    { id: '6months', label: '6 months', amount: 12000, days: 0, months: 6 },
    { id: 'year', label: '1 year', amount: 20000, days: 0, months: 12 },
];
const DEVICE_COOKIE = 'unmute_trial_device';
const duplicateMessage = 'An account has already been used on this device. Sign in to your original account and upgrade. Changing your phone number does not start a new free trial.';
function planEnd(start, plan) {
    const end = new Date(start);
    if (plan.days)
        end.setUTCDate(end.getUTCDate() + plan.days);
    else {
        const day = end.getUTCDate();
        end.setUTCDate(1);
        end.setUTCMonth(end.getUTCMonth() + plan.months);
        const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
        end.setUTCDate(Math.min(day, last));
    }
    return end;
}
class SubscriptionService {
    static deviceHash(req) {
        const token = (0, cookie_1.parse)(req.headers.cookie || '')[DEVICE_COOKIE];
        return token && /^[a-f0-9]{64}$/.test(token) ? crypto_1.default.createHash('sha256').update(token).digest('hex') : null;
    }
    static async assertNewDevice(req) {
        const hash = this.deviceHash(req);
        if (hash && await (0, database_1.getDatabase)().get('SELECT user_id FROM trial_devices WHERE token_hash = ?', [hash])) {
            throw new errorHandler_1.AppError(duplicateMessage, 409);
        }
    }
    static async startTrial(userId, req, res) {
        const token = crypto_1.default.randomBytes(32).toString('hex');
        const existingHash = this.deviceHash(req);
        const hash = existingHash || crypto_1.default.createHash('sha256').update(token).digest('hex');
        await (0, database_1.getDatabase)().transaction(async (tx) => {
            // Unique primary key plus row lock serializes simultaneous claims on this installation.
            await tx.run('INSERT IGNORE INTO trial_devices (token_hash, user_id) VALUES (?, ?)', [hash, userId]);
            const claim = await tx.get('SELECT user_id FROM trial_devices WHERE token_hash = ? FOR UPDATE', [hash]);
            if (claim.user_id !== userId)
                throw new errorHandler_1.AppError(duplicateMessage, 409);
            await tx.run('INSERT IGNORE INTO subscriptions (user_id, trial_started_at) VALUES (?, UTC_TIMESTAMP())', [userId]);
        });
        if (!existingHash)
            res.cookie(DEVICE_COOKIE, token, {
                httpOnly: true, secure: env_1.config.session.secure, sameSite: env_1.config.session.sameSite,
                path: '/', maxAge: 400 * 86400000,
            });
    }
    static async status(userId) {
        const row = await (0, database_1.getDatabase)().get(`SELECT TIMESTAMPDIFF(SECOND, '1970-01-01', DATE_ADD(trial_started_at, INTERVAL 7 DAY)) AS trialEnd,
       TIMESTAMPDIFF(SECOND, '1970-01-01', plan_expires_at) AS paidEnd, TIMESTAMPDIFF(SECOND, '1970-01-01', UTC_TIMESTAMP()) AS now, plan
       FROM subscriptions WHERE user_id = ?`, [userId]);
        if (!row)
            return { active: false, state: 'expired', expiresAt: null, trialEndsAt: null, plan: null };
        const end = Math.max(Number(row.trialEnd), Number(row.paidEnd || 0));
        return {
            active: end > Number(row.now),
            state: end <= Number(row.now) ? 'expired' : Number(row.paidEnd || 0) > Number(row.now) ? 'paid' : 'trial',
            expiresAt: new Date(end * 1000).toISOString(),
            trialEndsAt: new Date(Number(row.trialEnd) * 1000).toISOString(), plan: row.plan,
        };
    }
    static async requireAccess(userId) {
        if (!(await this.status(userId)).active)
            throw new errorHandler_1.AppError('Your free trial or plan has ended. Please upgrade to continue.', 402);
    }
}
exports.SubscriptionService = SubscriptionService;
