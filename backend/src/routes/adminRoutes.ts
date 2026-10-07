import { Router, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { idParamsSchema } from '../validators/common';
import { AppError } from '../middleware/errorHandler';
import { AdminAuthService, AdminRequest, requireAdmin } from '../services/adminAuthService';
import { AdminService, UserFilter } from '../services/adminService';
import { VerificationService } from '../services/verificationService';

/** The admin panel's API (/api/v1/admin): its own sign-in, then full access to members. */
const router = Router();

const handle = (fn: (req: AdminRequest, res: Response) => Promise<unknown>) => async (req: AdminRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: (await fn(req, res)) ?? null });
  } catch (err) {
    next(err);
  }
};

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: Number(process.env.AUTH_RATE_LIMIT) || 20, standardHeaders: true, legacyHeaders: false });

router.post(
  '/login',
  loginLimiter,
  validateBody(z.object({ email: z.string().email('Enter your admin email'), password: z.string().min(1).max(200) }).strict()),
  handle((req, res) => AdminAuthService.login(req.body.email, req.body.password, res))
);
router.post('/logout', handle(async (req, res) => { await AdminAuthService.logout(req, res); }));
router.get('/session', handle(async (req) => ({
  admin: await AdminAuthService.resolve(req),
  needsSetup: (await AdminAuthService.count()) === 0,
  setupRequiresCode: AdminAuthService.setupRequiresCode(),
})));

const adminFields = {
  email: z.string().email('Enter a valid email').max(255),
  name: z.string().trim().min(2, 'Enter a name').max(100),
  password: z.string().min(10, 'Admin passwords need at least 10 characters').max(200),
};

router.post(
  '/setup',
  loginLimiter,
  validateBody(z.object({ ...adminFields, code: z.string().max(20).optional() }).strict()),
  handle((req, res) => AdminAuthService.createFirstAdmin(req.body.email, req.body.name, req.body.password, req.body.code, res))
);

router.use(requireAdmin);

router.get('/stats', handle(() => AdminService.stats()));

// Admin accounts
router.get('/admins', handle(async (req) => (await AdminAuthService.list()).map((a) => ({
  id: a.id, email: a.email, name: a.name, createdAt: a.created_at, lastLoginAt: a.last_login_at, isYou: a.id === req.admin!.id,
}))));
router.post(
  '/admins',
  validateBody(z.object(adminFields).strict()),
  handle(async (req) => {
    try {
      const id = await AdminAuthService.createAdmin(req.body.email, req.body.name, req.body.password);
      await AdminService.logAdmin(req.admin!.id, 'admin_created', req.body.email);
      return { id };
    } catch (err: any) {
      if (err?.code === 'ER_DUP_ENTRY') throw new AppError('An admin with that email already exists.', 409);
      throw err;
    }
  })
);
router.delete('/admins/:id', validateParams(idParamsSchema), handle(async (req) => {
  await AdminAuthService.remove(req.admin!.id, req.params.id);
  await AdminService.logAdmin(req.admin!.id, 'admin_removed', req.params.id);
}));

const FILTERS = ['all', 'active', 'disabled', 'verified', 'unverified', 'paid', 'trial', 'reported'] as const;
router.get(
  '/users',
  validateQuery(z.object({ q: z.string().max(100).optional(), filter: z.enum(FILTERS).optional(), page: z.coerce.number().int().min(1).max(10000).optional() })),
  handle((req) => AdminService.listUsers(String(req.query.q ?? ''), (req.query.filter as UserFilter) ?? 'all', Number(req.query.page ?? 1)))
);
router.get('/users/:id', validateParams(idParamsSchema), handle((req) => AdminService.userDetail(req.params.id)));
router.post(
  '/users/:id/status',
  validateParams(idParamsSchema),
  validateBody(z.object({ active: z.boolean(), reason: z.string().max(200).optional() }).strict()),
  handle((req) => AdminService.setActive(req.admin!.id, req.params.id, req.body.active, req.body.reason))
);
router.post(
  '/users/:id/verified',
  validateParams(idParamsSchema),
  validateBody(z.object({ verified: z.boolean() }).strict()),
  handle((req) => AdminService.setVerified(req.admin!.id, req.params.id, req.body.verified))
);
router.get(
  '/reports',
  validateQuery(z.object({ status: z.enum(['pending', 'resolved', 'all']).optional(), page: z.coerce.number().int().min(1).max(10000).optional() })),
  handle((req) => AdminService.listReports((req.query.status as 'pending' | 'resolved' | 'all') ?? 'pending', Number(req.query.page ?? 1)))
);
router.post(
  '/users/:id/ban',
  validateParams(idParamsSchema),
  validateBody(z.object({ reason: z.string().max(200).optional() }).strict()),
  handle((req) => AdminService.ban(req.admin!.id, req.params.id, req.body.reason))
);
router.post(
  '/users/:id/photos/remove',
  validateParams(idParamsSchema),
  validateBody(z.object({ url: z.string().min(1).max(500) }).strict()),
  handle((req) => AdminService.removePhoto(req.admin!.id, req.params.id, req.body.url))
);
router.delete('/users/:id/ban', validateParams(idParamsSchema), handle((req) => AdminService.unban(req.admin!.id, req.params.id)));
router.post('/reports/:id/resolve', validateParams(idParamsSchema), handle((req) => AdminService.resolveReport(req.admin!.id, req.params.id)));

// Selfie and ID reviews
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
  validateParams(idParamsSchema),
  validateBody(z.object({ approve: z.boolean(), reason: z.string().trim().max(200).optional() }).strict()),
  handle(async (req) => {
    await VerificationService.decide(req.admin!.id, req.params.id, req.body.approve, req.body.reason);
    await AdminService.logDecision(req.admin!.id, req.params.id, req.body.approve);
  })
);

export default router;
