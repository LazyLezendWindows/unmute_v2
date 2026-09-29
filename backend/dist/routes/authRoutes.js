"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const passwordResetService_1 = require("../services/passwordResetService");
const validate_1 = require("../middleware/validate");
const rateLimiter_1 = require("../middleware/rateLimiter");
const auth_1 = require("../middleware/auth");
const authValidator_1 = require("../validators/authValidator");
const router = (0, express_1.Router)();
router.post('/register', rateLimiter_1.authRateLimiter, (0, validate_1.validateBody)(authValidator_1.registerSchema), authController_1.AuthController.register);
router.post('/login', rateLimiter_1.authRateLimiter, (0, validate_1.validateBody)(authValidator_1.loginSchema), authController_1.AuthController.login);
router.post('/google', rateLimiter_1.authRateLimiter, (0, validate_1.validateBody)(authValidator_1.googleAuthSchema), authController_1.AuthController.googleAuth);
router.post('/phone/start', rateLimiter_1.smsRateLimiter, (0, validate_1.validateBody)(authValidator_1.phoneStartSchema), authController_1.AuthController.phoneStart);
router.post('/phone/verify', rateLimiter_1.phoneVerifyRateLimiter, (0, validate_1.validateBody)(authValidator_1.phoneVerifySchema), authController_1.AuthController.phoneVerify);
router.post('/phone/link', auth_1.requireAuth, rateLimiter_1.phoneVerifyRateLimiter, (0, validate_1.validateBody)(authValidator_1.phoneLinkSchema), authController_1.AuthController.phoneLink);
router.post('/password/forgot', rateLimiter_1.smsRateLimiter, (0, validate_1.validateBody)(authValidator_1.forgotPasswordSchema), async (req, res, next) => {
    try {
        res.status(200).json({ success: true, data: await passwordResetService_1.PasswordResetService.start(req.body.email) });
    }
    catch (err) {
        next(err);
    }
});
router.post('/password/reset', rateLimiter_1.phoneVerifyRateLimiter, (0, validate_1.validateBody)(authValidator_1.resetPasswordSchema), async (req, res, next) => {
    try {
        await passwordResetService_1.PasswordResetService.finish(req.body.email, req.body.code, req.body.password);
        res.status(200).json({ success: true });
    }
    catch (err) {
        next(err);
    }
});
router.post('/logout', authController_1.AuthController.logout);
router.get('/config', authController_1.AuthController.config);
router.get('/session', authController_1.AuthController.session);
router.get('/me', auth_1.requireAuth, authController_1.AuthController.me);
exports.default = router;
