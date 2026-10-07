"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const zod_1 = require("zod");
const validate_1 = require("../middleware/validate");
const common_1 = require("../validators/common");
const errorHandler_1 = require("../middleware/errorHandler");
const adminAuthService_1 = require("../services/adminAuthService");
const adminService_1 = require("../services/adminService");
const verificationService_1 = require("../services/verificationService");
/** The admin panel's API (/api/v1/admin): its own sign-in, then full access to members. */
const router = (0, express_1.Router)();
const handle = (fn) => async (req, res, next) => {
    try {
        res.json({ success: true, data: (await fn(req, res)) ?? null });
    }
    catch (err) {
        next(err);
    }
};
const loginLimiter = (0, express_rate_limit_1.default)({ windowMs: 15 * 60 * 1000, max: Number(process.env.AUTH_RATE_LIMIT) || 20, standardHeaders: true, legacyHeaders: false });
router.post('/login', loginLimiter, (0, validate_1.validateBody)(zod_1.z.object({ email: zod_1.z.string().email('Enter your admin email'), password: zod_1.z.string().min(1).max(200) }).strict()), handle((req, res) => adminAuthService_1.AdminAuthService.login(req.body.email, req.body.password, res)));
router.post('/logout', handle(async (req, res) => { await adminAuthService_1.AdminAuthService.logout(req, res); }));
router.get('/session', handle(async (req) => ({
    admin: await adminAuthService_1.AdminAuthService.resolve(req),
    needsSetup: (await adminAuthService_1.AdminAuthService.count()) === 0,
    setupRequiresCode: adminAuthService_1.AdminAuthService.setupRequiresCode(),
})));
const adminFields = {
    email: zod_1.z.string().email('Enter a valid email').max(255),
    name: zod_1.z.string().trim().min(2, 'Enter a name').max(100),
    password: zod_1.z.string().min(10, 'Admin passwords need at least 10 characters').max(200),
};
router.post('/setup', loginLimiter, (0, validate_1.validateBody)(zod_1.z.object({ ...adminFields, code: zod_1.z.string().max(20).optional() }).strict()), handle((req, res) => adminAuthService_1.AdminAuthService.createFirstAdmin(req.body.email, req.body.name, req.body.password, req.body.code, res)));
router.use(adminAuthService_1.requireAdmin);
router.get('/stats', handle(() => adminService_1.AdminService.stats()));
// Admin accounts
router.get('/admins', handle(async (req) => (await adminAuthService_1.AdminAuthService.list()).map((a) => ({
    id: a.id, email: a.email, name: a.name, createdAt: a.created_at, lastLoginAt: a.last_login_at, isYou: a.id === req.admin.id,
}))));
router.post('/admins', (0, validate_1.validateBody)(zod_1.z.object(adminFields).strict()), handle(async (req) => {
    try {
        const id = await adminAuthService_1.AdminAuthService.createAdmin(req.body.email, req.body.name, req.body.password);
        await adminService_1.AdminService.logAdmin(req.admin.id, 'admin_created', req.body.email);
        return { id };
    }
    catch (err) {
        if (err?.code === 'ER_DUP_ENTRY')
            throw new errorHandler_1.AppError('An admin with that email already exists.', 409);
        throw err;
    }
}));
router.delete('/admins/:id', (0, validate_1.validateParams)(common_1.idParamsSchema), handle(async (req) => {
    await adminAuthService_1.AdminAuthService.remove(req.admin.id, req.params.id);
    await adminService_1.AdminService.logAdmin(req.admin.id, 'admin_removed', req.params.id);
}));
const FILTERS = ['all', 'active', 'disabled', 'verified', 'unverified', 'paid', 'trial', 'reported'];
router.get('/users', (0, validate_1.validateQuery)(zod_1.z.object({ q: zod_1.z.string().max(100).optional(), filter: zod_1.z.enum(FILTERS).optional(), page: zod_1.z.coerce.number().int().min(1).max(10000).optional() })), handle((req) => adminService_1.AdminService.listUsers(String(req.query.q ?? ''), req.query.filter ?? 'all', Number(req.query.page ?? 1))));
router.get('/users/:id', (0, validate_1.validateParams)(common_1.idParamsSchema), handle((req) => adminService_1.AdminService.userDetail(req.params.id)));
router.post('/users/:id/status', (0, validate_1.validateParams)(common_1.idParamsSchema), (0, validate_1.validateBody)(zod_1.z.object({ active: zod_1.z.boolean(), reason: zod_1.z.string().max(200).optional() }).strict()), handle((req) => adminService_1.AdminService.setActive(req.admin.id, req.params.id, req.body.active, req.body.reason)));
router.post('/users/:id/verified', (0, validate_1.validateParams)(common_1.idParamsSchema), (0, validate_1.validateBody)(zod_1.z.object({ verified: zod_1.z.boolean() }).strict()), handle((req) => adminService_1.AdminService.setVerified(req.admin.id, req.params.id, req.body.verified)));
router.post('/reports/:id/resolve', (0, validate_1.validateParams)(common_1.idParamsSchema), handle((req) => adminService_1.AdminService.resolveReport(req.admin.id, req.params.id)));
// Selfie and ID reviews
router.get('/verifications', handle(() => verificationService_1.VerificationService.queue()));
router.get('/verifications/:id/image', (0, validate_1.validateParams)(common_1.idParamsSchema), async (req, res, next) => {
    try {
        const file = await verificationService_1.VerificationService.imagePath(req.params.id);
        res.setHeader('Cache-Control', 'no-store');
        res.sendFile(file, (err) => err && next(new errorHandler_1.AppError('Not found', 404)));
    }
    catch (err) {
        next(err);
    }
});
router.post('/verifications/:id/decision', (0, validate_1.validateParams)(common_1.idParamsSchema), (0, validate_1.validateBody)(zod_1.z.object({ approve: zod_1.z.boolean(), reason: zod_1.z.string().trim().max(200).optional() }).strict()), handle(async (req) => {
    await verificationService_1.VerificationService.decide(req.admin.id, req.params.id, req.body.approve, req.body.reason);
    await adminService_1.AdminService.logDecision(req.admin.id, req.params.id, req.body.approve);
}));
exports.default = router;
