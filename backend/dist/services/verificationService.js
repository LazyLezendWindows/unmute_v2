"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VerificationService = exports.GESTURES = void 0;
const crypto_1 = __importDefault(require("crypto"));
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../config/env");
const database_1 = require("../config/database");
const errorHandler_1 = require("../middleware/errorHandler");
const mediaService_1 = require("./mediaService");
const emailCodeService_1 = require("./emailCodeService");
const authAccountRepository_1 = require("../repositories/authAccountRepository");
const profileRepository_1 = require("../repositories/profileRepository");
const profileMapper_1 = require("../mappers/profileMapper");
/** Poses asked for in the live selfie, so an old or someone else's photo can't be used. */
exports.GESTURES = [
    'Hold up two fingers (peace sign) next to your face',
    'Give a thumbs up next to your face',
    'Touch your nose with one finger',
    'Hold your open palm next to your face',
    'Point to your ear with one finger',
    'Make an OK sign with your hand next to your face',
];
async function writePrivate(userId, body) {
    if (!Buffer.isBuffer(body) || body.length === 0)
        throw new errorHandler_1.AppError('Choose a photo to upload.', 400);
    const ext = (0, mediaService_1.imageExtension)(body);
    if (!ext)
        throw new errorHandler_1.AppError('Photos must be JPG, PNG or WebP images.', 415);
    const name = `${userId}-${crypto_1.default.randomUUID()}.${ext}`;
    await promises_1.default.mkdir(env_1.config.privateUploadDir, { recursive: true, mode: 0o700 });
    await promises_1.default.writeFile(path_1.default.join(env_1.config.privateUploadDir, name), body, { flag: 'wx', mode: 0o600 });
    return name;
}
async function removePrivate(name) {
    if (name)
        await promises_1.default.unlink(path_1.default.join(env_1.config.privateUploadDir, path_1.default.basename(name))).catch(() => undefined);
}
class VerificationService {
    /** Everything the Verify screen shows. */
    static async status(userId) {
        const db = (0, database_1.getDatabase)();
        const user = await db.get(`SELECT u.email, u.email_verified_at, p.is_verified, p.id_verified
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`, [userId]);
        const latest = async (kind) => db.get(`SELECT * FROM verification_requests WHERE user_id = ? AND kind = ? AND status <> 'draft' ORDER BY created_at DESC LIMIT 1`, [userId, kind]);
        const [selfie, id, phone] = await Promise.all([latest('selfie'), latest('id'), authAccountRepository_1.AuthAccountRepository.phoneOf(userId)]);
        const state = (verified, row) => verified ? { status: 'verified', reason: null }
            // A previous approval does not restore a badge that an admin subsequently removed.
            : row && row.status !== 'approved' ? { status: row.status, reason: row.status === 'rejected' ? row.reason : null }
                : { status: 'none', reason: null };
        return {
            email: { address: user?.email ?? null, verified: Boolean(user?.email_verified_at) },
            phone: { number: phone, verified: Boolean(phone) },
            selfie: state(Boolean(user?.is_verified), selfie),
            id: state(Boolean(user?.id_verified), id),
            /** False until an admin account exists (npm run admin:create); submissions wait until then. */
            reviewersAvailable: Number((await db.get('SELECT COUNT(*) AS n FROM admins'))?.n ?? 0) > 0,
        };
    }
    // ---- Email ----
    /** Sends a code to the account's email, or to a new address the member wants to add. */
    static async startEmail(userId, email) {
        const current = await (0, database_1.getDatabase)().get('SELECT email FROM users WHERE id = ?', [userId]);
        const target = (email || current?.email || '').toLowerCase();
        if (!target)
            throw new errorHandler_1.AppError('Add an email address to verify.', 400);
        if (target !== current?.email) {
            const owner = await (0, database_1.getDatabase)().get('SELECT id FROM users WHERE email = ?', [target]);
            if (owner)
                throw new errorHandler_1.AppError('This email address belongs to another account.', 409);
        }
        return emailCodeService_1.EmailCodeService.send(target, 'verify');
    }
    static async confirmEmail(userId, email, code) {
        const target = email.toLowerCase();
        await (0, database_1.getDatabase)().transaction(async (tx) => {
            const owner = await tx.get('SELECT id FROM users WHERE email = ?', [target]);
            if (owner && owner.id !== userId)
                throw new errorHandler_1.AppError('This email address belongs to another account.', 409);
            await emailCodeService_1.EmailCodeService.consume(tx, target, 'verify', code);
            await tx.run('UPDATE users SET email = ?, email_verified_at = UTC_TIMESTAMP() WHERE id = ?', [target, userId]);
        });
    }
    // ---- Selfie and ID (reviewed by moderators) ----
    /** Starts a selfie check: the pose the member must copy in their live photo. */
    static async startSelfie(userId) {
        const gesture = exports.GESTURES[crypto_1.default.randomInt(0, exports.GESTURES.length)];
        const id = crypto_1.default.randomUUID();
        const db = (0, database_1.getDatabase)();
        await db.run("DELETE FROM verification_requests WHERE user_id = ? AND kind = 'selfie' AND status = 'draft'", [userId]);
        await db.run("INSERT INTO verification_requests (id, user_id, kind, gesture, status, created_at) VALUES (?, ?, 'selfie', ?, 'draft', UTC_TIMESTAMP())", [id, userId, gesture]);
        return { requestId: id, gesture };
    }
    static async submitSelfie(userId, requestId, body) {
        const db = (0, database_1.getDatabase)();
        const draft = await db.get("SELECT * FROM verification_requests WHERE id = ? AND user_id = ? AND kind = 'selfie' AND status = 'draft' AND created_at > UTC_TIMESTAMP() - INTERVAL 15 MINUTE", [requestId, userId]);
        if (!draft)
            throw new errorHandler_1.AppError('This selfie check has expired. Start again.', 400);
        const name = await writePrivate(userId, body);
        await this.replacePending(userId, 'selfie');
        await db.run("UPDATE verification_requests SET file_name = ?, status = 'pending', created_at = UTC_TIMESTAMP() WHERE id = ?", [name, requestId]);
        return this.status(userId);
    }
    static async submitId(userId, body) {
        const name = await writePrivate(userId, body);
        await this.replacePending(userId, 'id');
        await (0, database_1.getDatabase)().run("INSERT INTO verification_requests (id, user_id, kind, file_name, status, created_at) VALUES (?, ?, 'id', ?, 'pending', UTC_TIMESTAMP())", [crypto_1.default.randomUUID(), userId, name]);
        return this.status(userId);
    }
    /** A new submission replaces one still waiting for review. */
    static async replacePending(userId, kind) {
        const db = (0, database_1.getDatabase)();
        const old = await db.query("SELECT * FROM verification_requests WHERE user_id = ? AND kind = ? AND status = 'pending'", [userId, kind]);
        for (const row of old) {
            await removePrivate(row.file_name);
            await db.run('DELETE FROM verification_requests WHERE id = ?', [row.id]);
        }
    }
    // ---- Moderators ----
    static async queue() {
        const rows = await (0, database_1.getDatabase)().query("SELECT * FROM verification_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100");
        const profiles = await profileRepository_1.ProfileRepository.findByUserIds([...new Set(rows.map((r) => r.user_id))]);
        return rows.map((r) => {
            const person = (0, profileMapper_1.toPublicProfile)(r.user_id, profiles.get(r.user_id));
            return {
                id: r.id,
                kind: r.kind,
                gesture: r.gesture,
                submittedAt: r.created_at,
                user: { id: person.id, displayName: person.displayName, age: person.age, avatarUrl: person.avatarUrl, photos: person.photos },
            };
        });
    }
    /** The private image of a pending request, for moderators only. */
    static async imagePath(requestId) {
        const row = await (0, database_1.getDatabase)().get("SELECT * FROM verification_requests WHERE id = ? AND status = 'pending'", [requestId]);
        if (!row?.file_name)
            throw new errorHandler_1.AppError('Not found', 404);
        return path_1.default.join(env_1.config.privateUploadDir, path_1.default.basename(row.file_name));
    }
    /** Approves or rejects; the image is deleted either way. */
    static async decide(moderatorId, requestId, approve, reason) {
        const db = (0, database_1.getDatabase)();
        const fileName = await db.transaction(async (tx) => {
            const row = await tx.get("SELECT * FROM verification_requests WHERE id = ? AND status = 'pending' FOR UPDATE", [requestId]);
            if (!row)
                throw new errorHandler_1.AppError('This request was already reviewed.', 404);
            await tx.run('UPDATE verification_requests SET status = ?, reason = ?, reviewed_at = UTC_TIMESTAMP(), reviewed_by = ?, file_name = NULL WHERE id = ?', [approve ? 'approved' : 'rejected', approve ? null : (reason || 'The photo didn’t meet the requirements.').slice(0, 200), moderatorId, requestId]);
            if (approve) {
                await tx.run(`UPDATE profiles SET ${row.kind === 'selfie' ? 'is_verified' : 'id_verified'} = 1 WHERE user_id = ?`, [row.user_id]);
            }
            return row.file_name;
        });
        await removePrivate(fileName);
    }
}
exports.VerificationService = VerificationService;
