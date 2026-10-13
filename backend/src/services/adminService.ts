import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config/env';
import { MEDIA_PATH } from './mediaService';
import { getDatabase } from '../config/database';
import { AppError } from '../middleware/errorHandler';
import { getSocketServer } from '../sockets/chatSocket';
import { getOnlineUserCount, getOnlineUserIds } from '../sockets/presence';
import { toOwnProfile } from '../mappers/profileMapper';
import { ProfileRepository } from '../repositories/profileRepository';
import { InterestRepository } from '../repositories/interestRepository';
import { AuthAccountRepository } from '../repositories/authAccountRepository';
import { freeEndSql, SubscriptionService } from './subscriptionService';
import { VerificationService } from './verificationService';
import { BanService } from './banService';

export type UserFilter = 'all' | 'active' | 'disabled' | 'verified' | 'unverified' | 'paid' | 'trial' | 'reported';

const FILTERS: Record<UserFilter, string> = {
  all: '1 = 1',
  active: 'u.is_active = 1',
  disabled: 'u.is_active = 0',
  verified: 'p.is_verified = 1',
  unverified: 'COALESCE(p.is_verified, 0) = 0',
  paid: 's.plan_expires_at > UTC_TIMESTAMP() AND s.plan_started_at <= UTC_TIMESTAMP()',
  trial: `(s.plan_expires_at IS NULL OR s.plan_expires_at <= UTC_TIMESTAMP()) AND ${freeEndSql('s.')} > UTC_TIMESTAMP()`,
  reported: 'EXISTS (SELECT 1 FROM reports r WHERE r.reported_id = u.id)',
};

export async function logAdminAction(
  adminId: string,
  targetId: string | null,
  action: string,
  detail?: string,
  ipAddress?: string,
  targetType: string = 'user'
) {
  try {
    await getDatabase().run(
      'INSERT INTO admin_actions (id, admin_id, user_id, action, detail, ip_address, target_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))',
      [crypto.randomUUID(), adminId, targetId, action, detail?.slice(0, 255) ?? null, ipAddress?.slice(0, 45) ?? null, targetType]
    );
  } catch (err) {
    console.error('[AdminAudit] Failed to log action:', err);
  }
}

export class AdminService {
  /**
   * Summary overview stats used by dashboard cards.
   */
  static async stats() {
    const db = getDatabase();
    const n = async (sql: string, params: unknown[] = []) => Number((await db.get<{ n: number }>(sql, params))?.n ?? 0);

    const [
      total,
      active,
      disabled,
      verified,
      paid,
      newThisWeek,
      pendingReviews,
      openReports,
      onlineNow,
    ] = await Promise.all([
      n('SELECT COUNT(*) AS n FROM users'),
      n('SELECT COUNT(*) AS n FROM users WHERE is_active = 1'),
      n('SELECT COUNT(*) AS n FROM users WHERE is_active = 0'),
      n('SELECT COUNT(*) AS n FROM profiles WHERE is_verified = 1'),
      n('SELECT COUNT(*) AS n FROM subscriptions WHERE plan_expires_at > UTC_TIMESTAMP() AND plan_started_at <= UTC_TIMESTAMP()'),
      n("SELECT COUNT(*) AS n FROM users WHERE created_at >= DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 7 DAY, '%Y-%m-%dT00:00:00')"),
      n("SELECT COUNT(*) AS n FROM verification_requests WHERE status = 'pending'"),
      n("SELECT COUNT(*) AS n FROM reports WHERE status = 'pending'"),
      Promise.resolve(getOnlineUserCount()),
    ]);

    return {
      total,
      active,
      disabled,
      verified,
      paid,
      newThisWeek,
      pendingReviews,
      openReports,
      onlineNow,
    };
  }

  /**
   * Comprehensive live analytics dashboard data, including real-time presence,
   * message volume, connection requests, and trend series.
   */
  static async getAnalytics(days: number = 30) {
    const db = getDatabase();
    const n = async (sql: string, params: unknown[] = []) => Number((await db.get<{ n: number }>(sql, params))?.n ?? 0);
    const timeSpan = Math.min(90, Math.max(7, days));

    const [
      totalUsers,
      activeUsers24h,
      activeUsers7d,
      newToday,
      newThisWeek,
      newThisMonth,
      activeConversations,
      messagesToday,
      messagesThisWeek,
      pendingRequests,
      pendingReports,
      suspendedUsers,
      verifiedUsers,
    ] = await Promise.all([
      n('SELECT COUNT(*) AS n FROM users'),
      n('SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE last_used_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 24 HOUR) AND revoked_at IS NULL'),
      n('SELECT COUNT(DISTINCT user_id) AS n FROM sessions WHERE last_used_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 7 DAY) AND revoked_at IS NULL'),
      n("SELECT COUNT(*) AS n FROM users WHERE created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT00:00:00')"),
      n("SELECT COUNT(*) AS n FROM users WHERE created_at >= DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 7 DAY, '%Y-%m-%dT00:00:00')"),
      n("SELECT COUNT(*) AS n FROM users WHERE created_at >= DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 30 DAY, '%Y-%m-%dT00:00:00')"),
      n("SELECT COUNT(*) AS n FROM conversations WHERE last_message_at IS NOT NULL AND last_message_at >= DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 7 DAY, '%Y-%m-%dT00:00:00')"),
      n("SELECT COUNT(*) AS n FROM messages WHERE created_at >= DATE_FORMAT(UTC_TIMESTAMP(), '%Y-%m-%dT00:00:00')"),
      n("SELECT COUNT(*) AS n FROM messages WHERE created_at >= DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL 7 DAY, '%Y-%m-%dT00:00:00')"),
      n(`SELECT COUNT(*) AS n
         FROM likes l
         LEFT JOIN passes p ON p.passer_id = l.likee_id AND p.passee_id = l.liker_id
         LEFT JOIN matches m ON (m.user_a_id = l.liker_id AND m.user_b_id = l.likee_id) OR (m.user_a_id = l.likee_id AND m.user_b_id = l.liker_id)
         WHERE m.id IS NULL AND p.id IS NULL`),
      n("SELECT COUNT(*) AS n FROM reports WHERE status = 'pending'"),
      n('SELECT COUNT(*) AS n FROM users WHERE is_active = 0'),
      n('SELECT COUNT(*) AS n FROM profiles WHERE is_verified = 1'),
    ]);

    // Trend series
    const [regRows, msgRows, activeRows] = await Promise.all([
      db.query<{ date: string; count: number }>(
        `SELECT SUBSTRING(created_at, 1, 10) AS date, COUNT(*) AS count
         FROM users
         WHERE created_at >= DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL ? DAY, '%Y-%m-%dT00:00:00')
         GROUP BY SUBSTRING(created_at, 1, 10)
         ORDER BY date ASC`,
        [timeSpan]
      ),
      db.query<{ date: string; count: number }>(
        `SELECT SUBSTRING(created_at, 1, 10) AS date, COUNT(*) AS count
         FROM messages
         WHERE created_at >= DATE_FORMAT(UTC_TIMESTAMP() - INTERVAL ? DAY, '%Y-%m-%dT00:00:00')
         GROUP BY SUBSTRING(created_at, 1, 10)
         ORDER BY date ASC`,
        [timeSpan]
      ),
      db.query<{ date: string; count: number }>(
        `SELECT DATE_FORMAT(last_used_at, '%Y-%m-%d') AS date, COUNT(DISTINCT user_id) AS count
         FROM sessions
         WHERE last_used_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
         GROUP BY DATE_FORMAT(last_used_at, '%Y-%m-%d')
         ORDER BY date ASC`,
        [timeSpan]
      ),
    ]);

    // Build contiguous date series for the last `timeSpan` days
    const regMap = new Map<string, number>(regRows.map((r) => [r.date, Number(r.count)]));
    const msgMap = new Map<string, number>(msgRows.map((r) => [r.date, Number(r.count)]));
    const activeMap = new Map<string, number>(activeRows.map((r) => [r.date, Number(r.count)]));

    const registrationTrends: { date: string; count: number }[] = [];
    const messageTrends: { date: string; count: number }[] = [];
    const activeUserTrends: { date: string; count: number }[] = [];

    const now = new Date();
    for (let i = timeSpan - 1; i >= 0; i--) {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
      const key = d.toISOString().slice(0, 10);
      registrationTrends.push({ date: key, count: regMap.get(key) ?? 0 });
      messageTrends.push({ date: key, count: msgMap.get(key) ?? 0 });
      activeUserTrends.push({ date: key, count: activeMap.get(key) ?? 0 });
    }

    return {
      metrics: {
        totalUsers,
        onlineNow: getOnlineUserCount(),
        activeUsers24h,
        activeUsers7d,
        newToday,
        newThisWeek,
        newThisMonth,
        activeConversations,
        messagesToday,
        messagesThisWeek,
        pendingRequests,
        pendingReports,
        suspendedUsers,
        verifiedUsers,
      },
      trends: {
        days: timeSpan,
        registrations: registrationTrends,
        messages: messageTrends,
        activeUsers: activeUserTrends,
      },
      updatedAt: new Date().toISOString(),
    };
  }

  /** Every member, newest first, with search (name, email, phone) and a filter; 25 per page. */
  static async listUsers(q: string, filter: UserFilter, page: number) {
    const where = [FILTERS[filter] ?? FILTERS.all];
    const params: unknown[] = [];
    const term = q.trim();
    if (term) {
      const like = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push(`(p.display_name LIKE ? OR u.email LIKE ? OR ph.provider_account_id LIKE ?)`);
      params.push(like, like, like);
    }
    const from = `FROM users u
      LEFT JOIN profiles p ON p.user_id = u.id
      LEFT JOIN subscriptions s ON s.user_id = u.id
      LEFT JOIN auth_accounts ph ON ph.user_id = u.id AND ph.provider = 'phone'
      WHERE ${where.join(' AND ')}`;
    const db = getDatabase();
    const size = 25;
    const [rows, count] = await Promise.all([
      db.query<any>(
        `SELECT u.id, u.email, u.is_active, u.created_at, u.disabled_reason, p.display_name, p.avatar_url, p.date_of_birth, p.is_verified,
                ph.provider_account_id AS phone,
                IF(s.plan_expires_at > UTC_TIMESTAMP() AND s.plan_started_at <= UTC_TIMESTAMP(), s.plan, NULL) AS plan,
                (SELECT COUNT(*) FROM reports r WHERE r.reported_id = u.id) AS reports
         ${from} ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
        [...params, size, (Math.max(1, page) - 1) * size]
      ),
      db.get<{ n: number }>(`SELECT COUNT(*) AS n ${from}`, params),
    ]);
    const age = (dob: string | null) => {
      if (!dob) return null;
      const d = new Date(dob);
      const now = new Date();
      return now.getFullYear() - d.getFullYear() - (now < new Date(now.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0);
    };

    const onlineIds = new Set(getOnlineUserIds());

    return {
      total: Number(count?.n ?? 0),
      page: Math.max(1, page),
      pageSize: size,
      users: rows.map((r) => ({
        id: r.id,
        name: r.display_name || '(no profile)',
        email: r.email,
        phone: r.phone,
        avatarUrl: r.avatar_url || '',
        age: age(r.date_of_birth),
        isActive: Boolean(r.is_active),
        isOnline: onlineIds.has(r.id),
        disabledReason: r.disabled_reason,
        isVerified: Boolean(r.is_verified),
        plan: r.plan,
        reports: Number(r.reports),
        joinedAt: r.created_at,
      })),
    };
  }

  /** Everything about one member. */
  static async userDetail(userId: string) {
    const db = getDatabase();
    const user = await db.get<any>('SELECT id, email, is_active, paused_at, created_at, email_verified_at, disabled_reason, disabled_at FROM users WHERE id = ?', [userId]);
    if (!user) throw new AppError('User not found', 404);
    const [row, interests, phone, providers, subscription, verification, reports, counts, lastSeen, actions] = await Promise.all([
      ProfileRepository.findByUserId(userId),
      InterestRepository.forUser(userId),
      AuthAccountRepository.phoneOf(userId),
      db.query<{ provider: string }>('SELECT provider FROM auth_accounts WHERE user_id = ?', [userId]),
      SubscriptionService.status(userId),
      VerificationService.status(userId),
      db.query<any>(
        `SELECT r.id, r.reason_category, r.details, r.status, r.created_at, p.display_name AS reporter_name, r.reporter_id
         FROM reports r LEFT JOIN profiles p ON p.user_id = r.reporter_id WHERE r.reported_id = ? ORDER BY r.created_at DESC LIMIT 20`,
        [userId]
      ),
      db.get<any>(
        `SELECT (SELECT COUNT(*) FROM matches m WHERE m.user_a_id = ? OR m.user_b_id = ?) AS matches,
                (SELECT COUNT(*) FROM likes l WHERE l.likee_id = ?) AS likes_received,
                (SELECT COUNT(*) FROM likes l WHERE l.liker_id = ?) AS likes_sent,
                (SELECT COUNT(*) FROM blocks b WHERE b.blocked_id = ?) AS blocked_by,
                (SELECT COUNT(*) FROM messages m WHERE m.sender_id = ?) AS messages_sent`,
        [userId, userId, userId, userId, userId, userId]
      ),
      db.get<{ at: string | null }>('SELECT MAX(last_used_at) AS at FROM sessions WHERE user_id = ?', [userId]),
      db.query<any>(
        `SELECT x.action, x.detail, x.created_at, a.name AS admin_name FROM admin_actions x LEFT JOIN admins a ON a.id = x.admin_id
         WHERE x.user_id = ? ORDER BY x.created_at DESC LIMIT 20`,
        [userId]
      ),
    ]);
    return {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.email_verified_at),
      phone,
      signInMethods: providers.map((p) => p.provider),
      isActive: Boolean(user.is_active),
      isBanned: await BanService.isUserBanned(userId),
      referral: await db.get<any>(
        `SELECT u.referral_code AS code,
                (SELECT p.display_name FROM referrals r JOIN profiles p ON p.user_id = r.referrer_id WHERE r.referred_id = u.id) AS referredBy,
                (SELECT COUNT(*) FROM referrals r WHERE r.referrer_id = u.id) AS friendsJoined,
                (SELECT COUNT(*) FROM referrals r WHERE r.referrer_id = u.id AND r.rewarded_at IS NOT NULL) AS friendsRewarded
         FROM users u WHERE u.id = ?`,
        [userId]
      ).then((r) => ({ code: r?.code ?? null, referredBy: r?.referredBy ?? null, friendsJoined: Number(r?.friendsJoined ?? 0), friendsRewarded: Number(r?.friendsRewarded ?? 0) })),
      isPaused: Boolean(user.paused_at),
      disabledReason: user.disabled_reason,
      disabledAt: user.disabled_at,
      joinedAt: user.created_at,
      lastActiveAt: lastSeen?.at ?? null,
      profile: row ? { ...toOwnProfile(row, interests), dateOfBirth: row.date_of_birth } : null,
      subscription,
      verification,
      counts: {
        matches: Number(counts?.matches ?? 0),
        likesReceived: Number(counts?.likes_received ?? 0),
        likesSent: Number(counts?.likes_sent ?? 0),
        blockedBy: Number(counts?.blocked_by ?? 0),
        messagesSent: Number(counts?.messages_sent ?? 0),
      },
      reports: reports.map((r) => ({
        id: r.id, category: r.reason_category, details: r.details, status: r.status, createdAt: r.created_at,
        reporter: { id: r.reporter_id, name: r.reporter_name },
      })),
      adminHistory: actions.map((a) => ({ action: a.action, detail: a.detail, at: a.created_at, admin: a.admin_name })),
    };
  }

  /** Disables (signs out everywhere, hidden from everyone) or re-enables an account. */
  static async setActive(adminId: string, userId: string, active: boolean, reason?: string, ipAddress?: string) {
    const db = getDatabase();
    const { changes } = await db.run(
      active
        ? 'UPDATE users SET is_active = 1, disabled_reason = NULL, disabled_at = NULL WHERE id = ?'
        : 'UPDATE users SET is_active = 0, disabled_reason = ?, disabled_at = UTC_TIMESTAMP() WHERE id = ?',
      active ? [userId] : [reason?.trim().slice(0, 200) || null, userId]
    );
    if (!changes) throw new AppError('User not found', 404);
    if (!active) {
      await db.run('UPDATE sessions SET revoked_at = UTC_TIMESTAMP() WHERE user_id = ? AND revoked_at IS NULL', [userId]);
      getSocketServer()?.in(`user:${userId}`).disconnectSockets(true);
    }
    await logAdminAction(adminId, userId, active ? 'enabled' : 'disabled', reason, ipAddress);
    return this.userDetail(userId);
  }

  /** Gives or removes the verified badge; a pending selfie is marked approved along with it. */
  static async setVerified(adminId: string, userId: string, verified: boolean, ipAddress?: string) {
    const db = getDatabase();
    const { changes } = await db.run('UPDATE profiles SET is_verified = ? WHERE user_id = ?', [verified ? 1 : 0, userId]);
    if (!changes) throw new AppError('This member has no profile yet.', 404);
    if (verified) {
      const pending = await db.query<{ id: string }>("SELECT id FROM verification_requests WHERE user_id = ? AND kind = 'selfie' AND status = 'pending'", [userId]);
      for (const p of pending) await VerificationService.decide(adminId, p.id, true);
    }
    await logAdminAction(adminId, userId, verified ? 'verified' : 'unverified', undefined, ipAddress);
    return this.userDetail(userId);
  }

  /** The reports queue: newest first, with who reported whom and how often that person was reported. */
  static async listReports(status: 'pending' | 'resolved' | 'all', page: number) {
    const db = getDatabase();
    const pageSize = 25;
    const where = status === 'all' ? '' : 'WHERE r.status = ?';
    const params = status === 'all' ? [] : [status];
    const [rows, total] = await Promise.all([
      db.query<any>(
        `SELECT r.id, r.reason_category, r.details, r.status, r.created_at, r.reporter_id, r.reported_id,
                rp.display_name AS reporter_name, tp.display_name AS reported_name, tp.avatar_url AS reported_avatar,
                tu.is_active AS reported_active,
                (SELECT COUNT(*) FROM reports x WHERE x.reported_id = r.reported_id) AS reported_total
         FROM reports r
         LEFT JOIN profiles rp ON rp.user_id = r.reporter_id
         LEFT JOIN profiles tp ON tp.user_id = r.reported_id
         LEFT JOIN users tu ON tu.id = r.reported_id
         ${where}
         ORDER BY r.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, (page - 1) * pageSize]
      ),
      db.get<{ n: number }>(`SELECT COUNT(*) AS n FROM reports r ${where}`, params),
    ]);
    return {
      total: Number(total?.n ?? 0),
      page,
      pageSize,
      reports: rows.map((r) => ({
        id: r.id,
        category: r.reason_category,
        details: r.details,
        status: r.status,
        createdAt: r.created_at,
        reporter: { id: r.reporter_id, name: r.reporter_name },
        reported: { id: r.reported_id, name: r.reported_name, avatarUrl: r.reported_avatar || '', isActive: Boolean(r.reported_active), totalReports: Number(r.reported_total) },
      })),
    };
  }

  /**
   * Takes a photo off a member's profile and deletes the file.
   */
  static async removePhoto(adminId: string, userId: string, url: string, ipAddress?: string) {
    const db = getDatabase();
    const row = await db.get<{ avatar_url: string | null; photos: string | null }>('SELECT avatar_url, photos FROM profiles WHERE user_id = ?', [userId]);
    if (!row) throw new AppError('User not found', 404);
    let photos: string[] = [];
    try { photos = JSON.parse(row.photos || '[]'); } catch { photos = []; }
    const isAvatar = row.avatar_url === url;
    if (!isAvatar && !photos.includes(url)) throw new AppError('That photo is not on this profile.', 404);
    const remaining = photos.filter((p) => p !== url);
    const avatar = isAvatar ? remaining.shift() ?? '' : row.avatar_url ?? '';
    await db.run('UPDATE profiles SET avatar_url = ?, photos = ?, updated_at = ? WHERE user_id = ?', [avatar, JSON.stringify(remaining), new Date().toISOString(), userId]);
    if (url.startsWith(MEDIA_PATH)) await fs.unlink(path.join(config.uploadDir, path.basename(url))).catch(() => undefined);
    await logAdminAction(adminId, userId, 'photo_removed', path.basename(url), ipAddress);
    return this.userDetail(userId);
  }

  /** Disables the account and bans its email and phone number from new sign-ups. */
  static async ban(adminId: string, userId: string, reason?: string, ipAddress?: string) {
    await BanService.banUser(userId, adminId, reason);
    await this.setActive(adminId, userId, false, reason || 'Banned', ipAddress);
    await logAdminAction(adminId, userId, 'banned', reason, ipAddress);
    return this.userDetail(userId);
  }

  /** Lifts the ban and re-enables the account. */
  static async unban(adminId: string, userId: string, ipAddress?: string) {
    await BanService.unbanUser(userId);
    await logAdminAction(adminId, userId, 'unbanned', undefined, ipAddress);
    return this.setActive(adminId, userId, true, undefined, ipAddress);
  }

  static async resolveReport(adminId: string, reportId: string, ipAddress?: string) {
    const row = await getDatabase().get<{ reported_id: string }>('SELECT reported_id FROM reports WHERE id = ?', [reportId]);
    if (!row) throw new AppError('Report not found', 404);
    await getDatabase().run("UPDATE reports SET status = 'resolved' WHERE id = ?", [reportId]);
    await logAdminAction(adminId, row.reported_id, 'report_resolved', reportId, ipAddress, 'report');
  }

  static async logAdmin(adminId: string, action: string, detail?: string, ipAddress?: string, targetType: string = 'admin') {
    await logAdminAction(adminId, null, action, detail, ipAddress, targetType);
  }

  static async logDecision(adminId: string, requestId: string, approve: boolean, ipAddress?: string) {
    const row = await getDatabase().get<{ user_id: string; kind: string }>('SELECT user_id, kind FROM verification_requests WHERE id = ?', [requestId]);
    if (row) await logAdminAction(adminId, row.user_id, `${row.kind}_${approve ? 'approved' : 'rejected'}`, undefined, ipAddress, 'verification');
  }

  /**
   * Paginated audit logs query with filtering by action and search.
   */
  static async listAuditLogs(page: number = 1, pageSize: number = 25, filter?: { action?: string; q?: string }) {
    const db = getDatabase();
    const where: string[] = ['1 = 1'];
    const params: unknown[] = [];

    if (filter?.action && filter.action !== 'all') {
      where.push('x.action = ?');
      params.push(filter.action);
    }

    if (filter?.q?.trim()) {
      const term = `%${filter.q.trim().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      where.push('(a.name LIKE ? OR a.email LIKE ? OR x.detail LIKE ? OR p.display_name LIKE ? OR u.email LIKE ?)');
      params.push(term, term, term, term, term);
    }

    const whereClause = where.join(' AND ');
    const [rows, count] = await Promise.all([
      db.query<any>(
        `SELECT x.id, x.action, x.detail, x.ip_address, x.target_type, x.created_at,
                x.admin_id, a.name AS admin_name, a.email AS admin_email, a.role AS admin_role,
                x.user_id, p.display_name AS target_name, u.email AS target_email
         FROM admin_actions x
         LEFT JOIN admins a ON a.id = x.admin_id
         LEFT JOIN users u ON u.id = x.user_id
         LEFT JOIN profiles p ON p.user_id = x.user_id
         WHERE ${whereClause}
         ORDER BY x.created_at DESC
         LIMIT ? OFFSET ?`,
        [...params, pageSize, (Math.max(1, page) - 1) * pageSize]
      ),
      db.get<{ n: number }>(
        `SELECT COUNT(*) AS n
         FROM admin_actions x
         LEFT JOIN admins a ON a.id = x.admin_id
         LEFT JOIN users u ON u.id = x.user_id
         LEFT JOIN profiles p ON p.user_id = x.user_id
         WHERE ${whereClause}`,
        params
      ),
    ]);

    return {
      total: Number(count?.n ?? 0),
      page: Math.max(1, page),
      pageSize,
      logs: rows.map((r) => ({
        id: r.id,
        action: r.action,
        detail: r.detail,
        ipAddress: r.ip_address,
        targetType: r.target_type || 'user',
        createdAt: r.created_at,
        actor: {
          id: r.admin_id,
          name: r.admin_name || 'System / Unknown',
          email: r.admin_email || '',
          role: r.admin_role || 'admin',
        },
        target: r.user_id
          ? {
              id: r.user_id,
              name: r.target_name || r.target_email || r.user_id,
              email: r.target_email,
            }
          : null,
      })),
    };
  }
}
