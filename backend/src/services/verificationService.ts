import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env';
import { getDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { imageExtension } from './mediaService';
import { EmailCodeService } from './emailCodeService';
import { AuthAccountRepository } from '../repositories/authAccountRepository';
import { ProfileRepository } from '../repositories/profileRepository';
import { toPublicProfile } from '../mappers/profileMapper';

export type VerificationKind = 'selfie' | 'id';

/** Poses asked for in the live selfie, so an old or someone else's photo can't be used. */
export const GESTURES = [
  'Hold up two fingers (peace sign) next to your face',
  'Give a thumbs up next to your face',
  'Touch your nose with one finger',
  'Hold your open palm next to your face',
  'Point to your ear with one finger',
  'Make an OK sign with your hand next to your face',
];

interface RequestRow {
  id: string;
  user_id: string;
  kind: VerificationKind;
  file_name: string | null;
  gesture: string | null;
  status: 'draft' | 'pending' | 'approved' | 'rejected';
  reason: string | null;
  created_at: string;
}

async function writePrivate(userId: string, body: unknown): Promise<string> {
  if (!Buffer.isBuffer(body) || body.length === 0) throw new AppError('Choose a photo to upload.', 400);
  const ext = imageExtension(body);
  if (!ext) throw new AppError('Photos must be JPG, PNG or WebP images.', 415);
  const name = `${userId}-${crypto.randomUUID()}.${ext}`;
  await fs.mkdir(config.privateUploadDir, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(config.privateUploadDir, name), body, { flag: 'wx', mode: 0o600 });
  return name;
}

async function removePrivate(name: string | null) {
  if (name) await fs.unlink(path.join(config.privateUploadDir, path.basename(name))).catch(() => undefined);
}

export class VerificationService {
  static isAdmin(email: string | null | undefined): boolean {
    return Boolean(email && config.adminEmails.includes(email.toLowerCase()));
  }

  /** Everything the Verify screen shows. */
  static async status(userId: string) {
    const db = getDatabase();
    const user = await db.get<{ email: string | null; email_verified_at: string | null; is_verified: number; id_verified: number }>(
      `SELECT u.email, u.email_verified_at, p.is_verified, p.id_verified
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`,
      [userId]
    );
    const latest = async (kind: VerificationKind) =>
      db.get<RequestRow>(
        `SELECT * FROM verification_requests WHERE user_id = ? AND kind = ? AND status <> 'draft' ORDER BY created_at DESC LIMIT 1`,
        [userId, kind]
      );
    const [selfie, id, phone] = await Promise.all([latest('selfie'), latest('id'), AuthAccountRepository.phoneOf(userId)]);
    const state = (verified: boolean, row: RequestRow | null) =>
      verified ? { status: 'verified' as const, reason: null } : row ? { status: row.status, reason: row.status === 'rejected' ? row.reason : null } : { status: 'none' as const, reason: null };
    return {
      email: { address: user?.email ?? null, verified: Boolean(user?.email_verified_at) },
      phone: { number: phone, verified: Boolean(phone) },
      selfie: state(Boolean(user?.is_verified), selfie),
      id: state(Boolean(user?.id_verified), id),
    };
  }

  // ---- Email ----

  /** Sends a code to the account's email, or to a new address the member wants to add. */
  static async startEmail(userId: string, email?: string) {
    const current = await getDatabase().get<{ email: string | null }>('SELECT email FROM users WHERE id = ?', [userId]);
    const target = (email || current?.email || '').toLowerCase();
    if (!target) throw new AppError('Add an email address to verify.', 400);
    if (target !== current?.email) {
      const owner = await getDatabase().get<{ id: string }>('SELECT id FROM users WHERE email = ?', [target]);
      if (owner) throw new AppError('This email address belongs to another account.', 409);
    }
    return EmailCodeService.send(target, 'verify');
  }

  static async confirmEmail(userId: string, email: string, code: string) {
    const target = email.toLowerCase();
    await getDatabase().transaction(async (tx) => {
      const owner = await tx.get<{ id: string }>('SELECT id FROM users WHERE email = ?', [target]);
      if (owner && owner.id !== userId) throw new AppError('This email address belongs to another account.', 409);
      await EmailCodeService.consume(tx, target, 'verify', code);
      await tx.run('UPDATE users SET email = ?, email_verified_at = UTC_TIMESTAMP() WHERE id = ?', [target, userId]);
    });
  }

  // ---- Selfie and ID (reviewed by moderators) ----

  /** Starts a selfie check: the pose the member must copy in their live photo. */
  static async startSelfie(userId: string) {
    const gesture = GESTURES[crypto.randomInt(0, GESTURES.length)];
    const id = crypto.randomUUID();
    const db = getDatabase();
    await db.run("DELETE FROM verification_requests WHERE user_id = ? AND kind = 'selfie' AND status = 'draft'", [userId]);
    await db.run(
      "INSERT INTO verification_requests (id, user_id, kind, gesture, status, created_at) VALUES (?, ?, 'selfie', ?, 'draft', UTC_TIMESTAMP())",
      [id, userId, gesture]
    );
    return { requestId: id, gesture };
  }

  static async submitSelfie(userId: string, requestId: string, body: unknown) {
    const db = getDatabase();
    const draft = await db.get<RequestRow>(
      "SELECT * FROM verification_requests WHERE id = ? AND user_id = ? AND kind = 'selfie' AND status = 'draft' AND created_at > UTC_TIMESTAMP() - INTERVAL 15 MINUTE",
      [requestId, userId]
    );
    if (!draft) throw new AppError('This selfie check has expired. Start again.', 400);
    const name = await writePrivate(userId, body);
    await this.replacePending(userId, 'selfie');
    await db.run("UPDATE verification_requests SET file_name = ?, status = 'pending', created_at = UTC_TIMESTAMP() WHERE id = ?", [name, requestId]);
    return this.status(userId);
  }

  static async submitId(userId: string, body: unknown) {
    const name = await writePrivate(userId, body);
    await this.replacePending(userId, 'id');
    await getDatabase().run(
      "INSERT INTO verification_requests (id, user_id, kind, file_name, status, created_at) VALUES (?, ?, 'id', ?, 'pending', UTC_TIMESTAMP())",
      [crypto.randomUUID(), userId, name]
    );
    return this.status(userId);
  }

  /** A new submission replaces one still waiting for review. */
  private static async replacePending(userId: string, kind: VerificationKind) {
    const db = getDatabase();
    const old = await db.query<RequestRow>("SELECT * FROM verification_requests WHERE user_id = ? AND kind = ? AND status = 'pending'", [userId, kind]);
    for (const row of old) {
      await removePrivate(row.file_name);
      await db.run('DELETE FROM verification_requests WHERE id = ?', [row.id]);
    }
  }

  // ---- Moderators ----

  static async queue() {
    const rows = await getDatabase().query<RequestRow>(
      "SELECT * FROM verification_requests WHERE status = 'pending' ORDER BY created_at ASC LIMIT 100"
    );
    const profiles = await ProfileRepository.findByUserIds([...new Set(rows.map((r) => r.user_id))]);
    return rows.map((r) => {
      const person = toPublicProfile(r.user_id, profiles.get(r.user_id));
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
  static async imagePath(requestId: string): Promise<string> {
    const row = await getDatabase().get<RequestRow>("SELECT * FROM verification_requests WHERE id = ? AND status = 'pending'", [requestId]);
    if (!row?.file_name) throw new AppError('Not found', 404);
    return path.join(config.privateUploadDir, path.basename(row.file_name));
  }

  /** Approves or rejects; the image is deleted either way. */
  static async decide(moderatorId: string, requestId: string, approve: boolean, reason?: string) {
    const db = getDatabase();
    const row = await db.get<RequestRow>("SELECT * FROM verification_requests WHERE id = ? AND status = 'pending'", [requestId]);
    if (!row) throw new AppError('This request was already reviewed.', 404);
    await db.transaction(async (tx) => {
      await tx.run(
        'UPDATE verification_requests SET status = ?, reason = ?, reviewed_at = UTC_TIMESTAMP(), reviewed_by = ?, file_name = NULL WHERE id = ?',
        [approve ? 'approved' : 'rejected', approve ? null : (reason || 'The photo didn’t meet the requirements.').slice(0, 200), moderatorId, requestId]
      );
      if (approve) {
        await tx.run(`UPDATE profiles SET ${row.kind === 'selfie' ? 'is_verified' : 'id_verified'} = 1 WHERE user_id = ?`, [row.user_id]);
      }
    });
    await removePrivate(row.file_name);
  }
}
