"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const common_1 = require("../validators/common");
const errorHandler_1 = require("../middleware/errorHandler");
const userRepository_1 = require("../repositories/userRepository");
const verificationService_1 = require("../services/verificationService");
/** Moderator tools (accounts listed in ADMIN_EMAILS): reviewing photo and ID verifications. */
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.use(async (req, _res, next) => {
    try {
        const user = await userRepository_1.UserRepository.findById(req.user.userId);
        if (!verificationService_1.VerificationService.isAdmin(user?.email))
            throw new errorHandler_1.AppError('Not found', 404);
        next();
    }
    catch (err) {
        next(err);
    }
});
router.get('/verifications', async (_req, res, next) => {
    try {
        res.json({ success: true, data: await verificationService_1.VerificationService.queue() });
    }
    catch (err) {
        next(err);
    }
});
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
router.post('/verifications/:id/decision', (0, validate_1.validateParams)(common_1.idParamsSchema), (0, validate_1.validateBody)(zod_1.z.object({ approve: zod_1.z.boolean(), reason: zod_1.z.string().trim().max(200).optional() }).strict()), async (req, res, next) => {
    try {
        await verificationService_1.VerificationService.decide(req.user.userId, req.params.id, req.body.approve, req.body.reason);
        res.json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
exports.default = router;
