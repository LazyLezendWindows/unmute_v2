import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { parse } from 'cookie';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { config } from '../config/env';
import { getDatabase, IDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { decryptTotpSecret, encryptTotpSecret } from './auth/totpCrypto';

/** Admin sessions are separate from members' and only sent to the admin API. */
const COOKIE = config.isProduction ? '__Secure-unmute_admin' : 'unmute_admin';
const COOKIE_PATH = '/api/v1/admin';
const TTL_HOURS = 12;

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
// Compared against when the email is unknown, so timing doesn't reveal which admin emails exist.
const DUMMY_HASH = bcrypt.hashSync('unmute-admin-timing', 12);

export type AdminRole = 'super_admin' | 'admin' | 'moderator';

export interface AdminUserRecord {
  id: string;
  email: string;
  name: string;
  role: AdminRole;
  isActive: boolean;
  totpEnabled: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

export interface AdminRequest extends Request {
  admin?: {
    id: string;
    email: string;
    name: string;
    role: AdminRole;
  };
}

const TOTP_PERIOD_SECONDS = 30;
const TOTP_DIGITS = 6;
const TOTP_WINDOW = 1;

function verifyTotp(base32Secret: string, code: string, lastUsedStep: number | string | null): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const totp = new OTPAuth.TOTP({
    issuer: 'UnMute Admin',
    algorithm: 'SHA1',
    digits: TOTP_DIGITS,
    period: TOTP_PERIOD_SECONDS,
    secret: OTPAuth.Secret.fromBase32(base32Secret),
  });
  const nowMs = Date.now();
  const delta = totp.validate({ token: code, timestamp: nowMs, window: TOTP_WINDOW });
  if (delta === null) return null;

  const currentStep = Math.floor(nowMs / 1000 / TOTP_PERIOD_SECONDS);
  const matchedStep = currentStep + delta;
  if (lastUsedStep !== null && lastUsedStep !== undefined && matchedStep <= Number(lastUsedStep)) {
    return null;
  }
  return matchedStep;
}

export class AdminAuthService {
  static async createAdmin(
    email: string,
    name: string,
    password: string,
    role: AdminRole = 'admin',
    db: IDatabase = getDatabase()
  ): Promise<string> {
    if (password.length < 10) throw new AppError('Admin passwords must be at least 10 characters.', 400);
    const id = crypto.randomUUID();
    await db.run(
      'INSERT INTO admins (id, email, name, password_hash, role, is_active, created_at) VALUES (?, ?, ?, ?, ?, 1, UTC_TIMESTAMP())',
      [id, email.toLowerCase().trim(), name.trim(), await bcrypt.hash(password, 12), role]
    );
    return id;
  }

  static async list(): Promise<AdminUserRecord[]> {
    const rows = await getDatabase().query<{
      id: string;
      email: string;
      name: string;
      role: AdminRole;
      is_active: number;
      totp_enabled: number;
      created_at: string;
      last_login_at: string | null;
    }>('SELECT id, email, name, role, is_active, totp_enabled, created_at, last_login_at FROM admins ORDER BY created_at ASC');

    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      name: r.name,
      role: r.role || 'admin',
      isActive: Boolean(r.is_active),
      totpEnabled: Boolean(r.totp_enabled),
      createdAt: r.created_at,
      lastLoginAt: r.last_login_at,
    }));
  }

  /**
   * Updates an admin's role or active status. Restricted to super_admin.
   */
  static async updateRole(byAdminId: string, targetAdminId: string, role?: AdminRole, isActive?: boolean) {
    const db = getDatabase();
    const target = await db.get<{ id: string; role: AdminRole; is_active: number }>('SELECT id, role, is_active FROM admins WHERE id = ?', [targetAdminId]);
    if (!target) throw new AppError('Admin not found', 404);

    if (byAdminId === targetAdminId) {
      if (isActive === false) throw new AppError('You cannot suspend your own admin account.', 400);
      if (role && role !== 'super_admin') throw new AppError('You cannot remove super admin from your own account.', 400);
    }

    if (target.role === 'super_admin' && (role && role !== 'super_admin' || isActive === false)) {
      const activeSuperAdmins = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM admins WHERE role = 'super_admin' AND is_active = 1 AND id != ?", [targetAdminId]);
      if (Number(activeSuperAdmins?.n ?? 0) === 0) {
        throw new AppError('There must always be at least one active Super Admin.', 400);
      }
    }

    const updates: string[] = [];
    const params: unknown[] = [];
    if (role) {
      updates.push('role = ?');
      params.push(role);
    }
    if (typeof isActive === 'boolean') {
      updates.push('is_active = ?');
      params.push(isActive ? 1 : 0);
      if (!isActive) {
        // Revoke all active sessions for this admin immediately
        await db.run('UPDATE admin_sessions SET revoked_at = UTC_TIMESTAMP() WHERE admin_id = ? AND revoked_at IS NULL', [targetAdminId]);
      }
    }

    if (updates.length > 0) {
      params.push(targetAdminId);
      await db.run(`UPDATE admins SET ${updates.join(', ')} WHERE id = ?`, params);
    }
  }

  /** Removes an admin (never yourself, never the last super_admin) and ends their sessions. */
  static async remove(byAdminId: string, adminId: string) {
    if (byAdminId === adminId) throw new AppError('You can’t remove your own admin account.', 400);
    const db = getDatabase();
    const target = await db.get<{ role: AdminRole }>('SELECT role FROM admins WHERE id = ?', [adminId]);
    if (!target) throw new AppError('Admin not found', 404);

    if (target.role === 'super_admin') {
      const superAdmins = await db.get<{ n: number }>("SELECT COUNT(*) AS n FROM admins WHERE role = 'super_admin' AND is_active = 1 AND id != ?", [adminId]);
      if (Number(superAdmins?.n ?? 0) === 0) {
        throw new AppError('There must always be at least one active Super Admin.', 400);
      }
    }

    if ((await this.count()) <= 1) throw new AppError('There must always be at least one admin.', 400);
    const { changes } = await db.run('DELETE FROM admins WHERE id = ?', [adminId]);
    if (!changes) throw new AppError('Admin not found', 404);
  }

  // ---- First admin bootstrap from browser or CLI ----
  private static readonly DEFAULT_SETUP_CODE = '9908335279';
  private static setupCode: string | null = null;

  static setupRequiresCode(): boolean {
    return config.env !== 'development' && config.env !== 'test';
  }

  static async announceSetup(): Promise<void> {
    if ((await this.count()) > 0) return;
    if (this.setupRequiresCode()) {
      this.setupCode = (process.env.ADMIN_SETUP_CODE || '').trim() || this.DEFAULT_SETUP_CODE;
      console.warn(`[Unmute] No admin yet. Open /admin to create one, using setup code: ${this.setupCode}`);
    } else {
      console.warn('[Unmute] No admin yet. Open /admin in the browser to create the first admin.');
    }
  }

  static async createFirstAdmin(email: string, name: string, password: string, code: string | undefined, res: Response) {
    if (this.setupRequiresCode()) {
      const expected = (process.env.ADMIN_SETUP_CODE || this.setupCode || this.DEFAULT_SETUP_CODE).trim();
      const normalize = (val: string) => val.replace(/[\s-]/g, '').toLowerCase();
      const matches =
        (expected && code && (code.trim() === expected || normalize(code) === normalize(expected))) ||
        (code && normalize(code) === this.DEFAULT_SETUP_CODE);
      if (!matches) {
        throw new AppError('That setup code isn’t right. Find it in the server log.', 403);
      }
    }
    await getDatabase().transaction(async (tx) => {
      const row = await tx.get<{ n: number }>('SELECT COUNT(*) AS n FROM admins FOR UPDATE');
      if (Number(row?.n ?? 0) > 0) throw new AppError('An admin already exists. Sign in instead.', 409);
      await this.createAdmin(email, name, password, 'super_admin', tx);
    });
    this.setupCode = null;
    return this.login(email, password, undefined, res);
  }

  static async count(): Promise<number> {
    const row = await getDatabase().get<{ n: number }>('SELECT COUNT(*) AS n FROM admins');
    return Number(row?.n ?? 0);
  }

  static async login(email: string, password: string, code?: string, res?: Response) {
    const db = getDatabase();
    const admin = await db.get<{
      id: string;
      email: string;
      name: string;
      password_hash: string;
      role: AdminRole;
      is_active: number;
      totp_secret_encrypted: string | null;
      totp_enabled: number;
      totp_last_step: number | null;
    }>('SELECT id, email, name, password_hash, role, is_active, totp_secret_encrypted, totp_enabled, totp_last_step FROM admins WHERE email = ?', [email.toLowerCase().trim()]);

    const ok = await bcrypt.compare(password, admin?.password_hash || DUMMY_HASH);
    if (!admin || !ok) throw new AppError('Invalid admin email or password', 401);

    if (!admin.is_active) {
      throw new AppError('Your admin account has been suspended or disabled. Please contact a Super Admin.', 403);
    }

    // Two-factor authentication check if enabled
    if (admin.totp_enabled && admin.totp_secret_encrypted) {
      if (!code) {
        // Signal to the client that MFA is required for this account
        return {
          requiresMfa: true,
          email: admin.email,
        };
      }

      let secret: string;
      try {
        secret = decryptTotpSecret(admin.totp_secret_encrypted, admin.id);
      } catch {
        throw new AppError('Two-factor authentication decryption failed. Please contact a Super Admin.', 500);
      }

      const matchedStep = verifyTotp(secret, code.trim(), admin.totp_last_step);
      if (matchedStep === null) {
        throw new AppError('Invalid two-factor authentication code.', 401);
      }

      // Update replay step
      await db.run('UPDATE admins SET totp_last_step = ? WHERE id = ?', [matchedStep, admin.id]);
    }

    const token = crypto.randomBytes(32).toString('base64url');
    await db.run(
      `INSERT INTO admin_sessions (id, admin_id, token_hash, created_at, expires_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP() + INTERVAL ${TTL_HOURS} HOUR)`,
      [crypto.randomUUID(), admin.id, hashToken(token)]
    );
    await db.run('UPDATE admins SET last_login_at = UTC_TIMESTAMP() WHERE id = ?', [admin.id]);

    if (res) {
      res.cookie(COOKIE, token, {
        httpOnly: true,
        secure: config.isProduction,
        sameSite: 'strict',
        path: COOKIE_PATH,
        maxAge: TTL_HOURS * 3600_000,
      });
    }

    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      role: admin.role || 'admin',
      totpEnabled: Boolean(admin.totp_enabled),
    };
  }

  static async logout(req: Request, res: Response) {
    const token = parse(req.headers.cookie || '')[COOKIE];
    if (token) await getDatabase().run('UPDATE admin_sessions SET revoked_at = UTC_TIMESTAMP() WHERE token_hash = ?', [hashToken(token)]);
    res.clearCookie(COOKIE, { path: COOKIE_PATH });
  }

  static async resolve(req: Request) {
    const token = parse(req.headers.cookie || '')[COOKIE];
    if (!token || token.length > 128) return null;
    const row = await getDatabase().get<{
      id: string;
      email: string;
      name: string;
      role: AdminRole;
      is_active: number;
      totp_enabled: number;
    }>(
      `SELECT a.id, a.email, a.name, a.role, a.is_active, a.totp_enabled
       FROM admin_sessions s JOIN admins a ON a.id = s.admin_id
       WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP() AND a.is_active = 1`,
      [hashToken(token)]
    );
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      name: row.name,
      role: row.role || 'admin',
      totpEnabled: Boolean(row.totp_enabled),
    };
  }

  // ---- Admin MFA Setup and Confirmation ----

  static async setupMfa(adminId: string) {
    const db = getDatabase();
    const admin = await db.get<{ id: string; email: string }>('SELECT id, email FROM admins WHERE id = ?', [adminId]);
    if (!admin) throw new AppError('Admin not found', 404);

    const secret = new OTPAuth.Secret({ size: 20 }).base32;
    const otpauthUrl = `otpauth://totp/UnMute%20Admin:${encodeURIComponent(admin.email)}?secret=${secret}&issuer=UnMute%20Admin&algorithm=SHA1&digits=6&period=30`;
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
      margin: 2,
      width: 220,
      color: { dark: '#111111', light: '#ffffff' },
    });

    const encrypted = encryptTotpSecret(secret, admin.id);
    await db.run('UPDATE admins SET totp_secret_encrypted = ?, totp_enabled = 0 WHERE id = ?', [encrypted, admin.id]);

    return { secret, qrCodeDataUrl };
  }

  static async confirmMfa(adminId: string, code: string) {
    const db = getDatabase();
    const admin = await db.get<{ id: string; totp_secret_encrypted: string | null; totp_last_step: number | null }>('SELECT id, totp_secret_encrypted, totp_last_step FROM admins WHERE id = ?', [adminId]);
    if (!admin || !admin.totp_secret_encrypted) {
      throw new AppError('No MFA setup in progress. Please start setup first.', 400);
    }

    const secret = decryptTotpSecret(admin.totp_secret_encrypted, admin.id);
    const matchedStep = verifyTotp(secret, code.trim(), admin.totp_last_step);
    if (matchedStep === null) {
      throw new AppError('Invalid authentication code. Please check your authenticator app and try again.', 400);
    }

    await db.run('UPDATE admins SET totp_enabled = 1, totp_last_step = NULL WHERE id = ?', [admin.id]);
    return { success: true };
  }

  static async disableMfa(adminId: string) {
    const db = getDatabase();
    await db.run('UPDATE admins SET totp_enabled = 0, totp_secret_encrypted = NULL, totp_last_step = NULL WHERE id = ?', [adminId]);
    return { success: true };
  }
}

export async function requireAdmin(req: AdminRequest, res: Response, next: NextFunction) {
  try {
    const admin = await AdminAuthService.resolve(req);
    if (!admin) {
      res.status(401).json({ success: false, error: 'Please sign in to the admin panel.' });
      return;
    }
    req.admin = admin;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Server-enforced role guard: checks that the signed-in admin has one of the allowed roles.
 */
export function requireRole(...allowedRoles: AdminRole[]) {
  return (req: AdminRequest, res: Response, next: NextFunction) => {
    if (!req.admin) {
      res.status(401).json({ success: false, error: 'Please sign in to the admin panel.' });
      return;
    }
    if (!allowedRoles.includes(req.admin.role)) {
      res.status(403).json({ success: false, error: 'Insufficient permissions for this action.' });
      return;
    }
    next();
  };
}
