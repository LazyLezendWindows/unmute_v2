import { Router, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { idParamsSchema } from '../validators/common';
import { AppError } from '../middleware/errorHandler';
import {
  AdminAuthService,
  AdminRequest,
  AdminRole,
  requireAdmin,
  requireRole,
} from '../services/adminAuthService';
import { AdminService, UserFilter, logAdminAction } from '../services/adminService';
import { VerificationService } from '../services/verificationService';

/** The admin panel's API (/api/v1/admin): its own sign-in, MFA, RBAC, and full management tools. */
const router = Router();

const getClientIp = (req: AdminRequest): string => {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.socket.remoteAddress || '';
};

const handle = (fn: (req: AdminRequest, res: Response) => Promise<unknown>) => async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: (await fn(req, res)) ?? null });
  } catch (err) {
    next(err);
  }
};

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT) || 20,
  standardHeaders: true,
  legacyHeaders: false,
});

router.post(
  '/login',
  loginLimiter,
  validateBody(
    z.object({
      email: z.string().email('Enter your admin email'),
      password: z.string().min(1).max(200),
      code: z.string().trim().max(10).optional(),
    }).strict()
  ),
  handle(async (req, res) => {
    const ip = getClientIp(req);
    try {
      const result = await AdminAuthService.login(req.body.email, req.body.password, req.body.code, res);
      if (!('requiresMfa' in result)) {
        await logAdminAction(result.id, null, 'login_success', `Admin signed in from ${ip}`, ip, 'auth');
      }
      return result;
    } catch (err: any) {
      await logAdminAction('system', null, 'login_failed', `Failed sign-in attempt for ${req.body.email} from ${ip}`, ip, 'auth');
      throw err;
    }
  })
);

router.post(
  '/logout',
  handle(async (req, res) => {
    const admin = await AdminAuthService.resolve(req);
    if (admin) {
      await logAdminAction(admin.id, null, 'logout', 'Admin signed out', getClientIp(req), 'auth');
    }
    await AdminAuthService.logout(req, res);
  })
);

router.get('/session', handle(async (req) => ({
  admin: await AdminAuthService.resolve(req),
  needsSetup: (await AdminAuthService.count()) === 0,
  setupRequiresCode: AdminAuthService.setupRequiresCode(),
})));

const adminFields = {
  email: z.string().email('Enter a valid email').max(255),
  name: z.string().trim().min(2, 'Enter a name').max(100),
  password: z.string().min(10, 'Admin passwords need at least 10 characters').max(200),
  role: z.enum(['super_admin', 'admin', 'moderator']).optional(),
};

router.post(
  '/setup',
  loginLimiter,
  validateBody(z.object({ ...adminFields, code: z.string().max(20).optional() }).strict()),
  handle(async (req, res) => {
    const admin = await AdminAuthService.createFirstAdmin(req.body.email, req.body.name, req.body.password, req.body.code, res);
    const adminId = 'id' in admin && typeof admin.id === 'string' ? admin.id : 'setup';
    await logAdminAction(adminId, null, 'first_admin_bootstrapped', `First Super Admin ${req.body.email} bootstrapped`, getClientIp(req), 'auth');
    return admin;
  })
);

// All routes below this middleware require an active admin session
router.use(requireAdmin);

// Dashboard overview and Live Analytics
router.get('/stats', handle(() => AdminService.stats()));
router.get(
  '/analytics',
  validateQuery(z.object({ days: z.coerce.number().int().min(7).max(90).optional() })),
  handle((req) => AdminService.getAnalytics(Number(req.query.days || 30)))
);

// MFA setup and management for the logged-in administrator
router.post('/mfa/setup', handle((req) => AdminAuthService.setupMfa(req.admin!.id)));
router.post(
  '/mfa/confirm',
  validateBody(z.object({ code: z.string().trim().length(6, 'Enter a 6-digit code') }).strict()),
  handle(async (req) => {
    const res = await AdminAuthService.confirmMfa(req.admin!.id, req.body.code);
    await logAdminAction(req.admin!.id, null, 'mfa_enabled', 'Two-factor authentication enabled', getClientIp(req), 'security');
    return res;
  })
);
router.post('/mfa/disable', handle(async (req) => {
  const res = await AdminAuthService.disableMfa(req.admin!.id);
  await logAdminAction(req.admin!.id, null, 'mfa_disabled', 'Two-factor authentication disabled', getClientIp(req), 'security');
  return res;
}));

// Role and permission management: restricted to super_admin
router.get('/roles', requireRole('super_admin'), handle(async (req) => {
  const list = await AdminAuthService.list();
  return list.map((a) => ({ ...a, isYou: a.id === req.admin!.id }));
}));

router.patch(
  '/roles/:id',
  requireRole('super_admin'),
  validateParams(idParamsSchema),
  validateBody(
    z.object({
      role: z.enum(['super_admin', 'admin', 'moderator']).optional(),
      isActive: z.boolean().optional(),
    }).strict()
  ),
  handle(async (req) => {
    await AdminAuthService.updateRole(req.admin!.id, req.params.id, req.body.role as AdminRole | undefined, req.body.isActive);
    await logAdminAction(
      req.admin!.id,
      req.params.id,
      'admin_role_updated',
      `Updated admin: ${JSON.stringify(req.body)}`,
      getClientIp(req),
      'role'
    );
    return { success: true };
  })
);

// Admin accounts management
router.get('/admins', handle(async (req) => (await AdminAuthService.list()).map((a) => ({
  id: a.id,
  email: a.email,
  name: a.name,
  role: a.role,
  isActive: a.isActive,
  totpEnabled: a.totpEnabled,
  createdAt: a.createdAt,
  lastLoginAt: a.lastLoginAt,
  isYou: a.id === req.admin!.id,
}))));

router.post(
  '/admins',
  requireRole('super_admin', 'admin'),
  validateBody(z.object(adminFields).strict()),
  handle(async (req) => {
    try {
      const targetRole: AdminRole = req.admin!.role === 'super_admin' ? (req.body.role || 'admin') : 'admin';
      const id = await AdminAuthService.createAdmin(req.body.email, req.body.name, req.body.password, targetRole);
      await logAdminAction(req.admin!.id, id, 'admin_created', `Created admin ${req.body.email} with role ${targetRole}`, getClientIp(req), 'admin');
      return { id };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') throw new AppError('An admin with that email already exists.', 409);
      throw err;
    }
  })
);

router.delete(
  '/admins/:id',
  requireRole('super_admin'),
  validateParams(idParamsSchema),
  handle(async (req) => {
    await AdminAuthService.remove(req.admin!.id, req.params.id);
    await logAdminAction(req.admin!.id, req.params.id, 'admin_removed', `Removed admin ${req.params.id}`, getClientIp(req), 'admin');
  })
);

// Audit logs trail: accessible by super_admin and admin
router.get(
  '/audit-logs',
  requireRole('super_admin', 'admin'),
  validateQuery(
    z.object({
      page: z.coerce.number().int().min(1).max(10000).optional(),
      pageSize: z.coerce.number().int().min(1).max(100).optional(),
      action: z.string().max(50).optional(),
      q: z.string().max(100).optional(),
    })
  ),
  handle((req) =>
    AdminService.listAuditLogs(
      Number(req.query.page || 1),
      Number(req.query.pageSize || 25),
      { action: req.query.action as string | undefined, q: req.query.q as string | undefined }
    )
  )
);

// User Management
const FILTERS = ['all', 'active', 'disabled', 'verified', 'unverified', 'paid', 'trial', 'reported'] as const;
router.get(
  '/users',
  validateQuery(z.object({ q: z.string().max(100).optional(), filter: z.enum(FILTERS).optional(), page: z.coerce.number().int().min(1).max(10000).optional() })),
  handle((req) => AdminService.listUsers(String(req.query.q ?? ''), (req.query.filter as UserFilter) ?? 'all', Number(req.query.page ?? 1)))
);

router.get('/users/:id', validateParams(idParamsSchema), handle((req) => AdminService.userDetail(req.params.id)));

router.post(
  '/users/:id/status',
  requireRole('super_admin', 'admin'),
  validateParams(idParamsSchema),
  validateBody(z.object({ active: z.boolean(), reason: z.string().max(200).optional() }).strict()),
  handle((req) => AdminService.setActive(req.admin!.id, req.params.id, req.body.active, req.body.reason, getClientIp(req)))
);

router.post(
  '/users/:id/verified',
  requireRole('super_admin', 'admin', 'moderator'),
  validateParams(idParamsSchema),
  validateBody(z.object({ verified: z.boolean() }).strict()),
  handle((req) => AdminService.setVerified(req.admin!.id, req.params.id, req.body.verified, getClientIp(req)))
);

router.post(
  '/users/:id/ban',
  requireRole('super_admin', 'admin'),
  validateParams(idParamsSchema),
  validateBody(z.object({ reason: z.string().max(200).optional() }).strict()),
  handle((req) => AdminService.ban(req.admin!.id, req.params.id, req.body.reason, getClientIp(req)))
);

router.delete(
  '/users/:id/ban',
  requireRole('super_admin', 'admin'),
  validateParams(idParamsSchema),
  handle((req) => AdminService.unban(req.admin!.id, req.params.id, getClientIp(req)))
);

router.post(
  '/users/:id/photos/remove',
  requireRole('super_admin', 'admin', 'moderator'),
  validateParams(idParamsSchema),
  validateBody(z.object({ url: z.string().min(1).max(500) }).strict()),
  handle((req) => AdminService.removePhoto(req.admin!.id, req.params.id, req.body.url, getClientIp(req)))
);

// Reports Moderation Queue
router.get(
  '/reports',
  validateQuery(z.object({ status: z.enum(['pending', 'resolved', 'all']).optional(), page: z.coerce.number().int().min(1).max(10000).optional() })),
  handle((req) => AdminService.listReports((req.query.status as 'pending' | 'resolved' | 'all') ?? 'pending', Number(req.query.page ?? 1)))
);

router.post(
  '/reports/:id/resolve',
  requireRole('super_admin', 'admin', 'moderator'),
  validateParams(idParamsSchema),
  handle((req) => AdminService.resolveReport(req.admin!.id, req.params.id, getClientIp(req)))
);

// Selfie and ID Reviews
router.get('/verifications', handle(() => VerificationService.queue()));
router.get('/verifications/:id/image', validateParams(idParamsSchema), async (req, res, next) => {
  try {
    const file = await VerificationService.imagePath(req.params.id);
    res.setHeader('Cache-Control', 'no-store');
    res.sendFile(file, (err) => err && next(new AppError('Not found', 404)));
  } catch (err) {
    next(err);
  }
});

router.post(
  '/verifications/:id/decision',
  requireRole('super_admin', 'admin', 'moderator'),
  validateParams(idParamsSchema),
  validateBody(z.object({ approve: z.boolean(), reason: z.string().trim().max(200).optional() }).strict()),
  handle(async (req) => {
    await VerificationService.decide(req.admin!.id, req.params.id, req.body.approve, req.body.reason);
    await AdminService.logDecision(req.admin!.id, req.params.id, req.body.approve, getClientIp(req));
  })
);

export default router;
