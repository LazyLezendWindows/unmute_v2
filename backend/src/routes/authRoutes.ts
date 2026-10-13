import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { PasswordResetService } from '../services/passwordResetService';
import { validateBody } from '../middleware/validate';
import { authRateLimiter, phoneVerifyRateLimiter, smsRateLimiter, totpVerifyRateLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';
import {
  registerSchema,
  loginSchema,
  googleAuthSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  phoneLinkSchema,
  phoneStartSchema,
  phoneVerifySchema,
  changePasswordSchema,
  totpEnableSchema,
  totpVerifyLoginSchema,
  totpReauthSchema,
} from '../validators/authValidator';
import { AccountService } from '../services/accountService';
import { AuthRequest } from '../middleware/auth';

const router = Router();

router.post('/register', authRateLimiter, validateBody(registerSchema), AuthController.register);
router.post('/login', authRateLimiter, validateBody(loginSchema), AuthController.login);
router.post('/google', authRateLimiter, validateBody(googleAuthSchema), AuthController.googleAuth);
router.post('/phone/start', smsRateLimiter, validateBody(phoneStartSchema), AuthController.phoneStart);
router.post('/phone/verify', phoneVerifyRateLimiter, validateBody(phoneVerifySchema), AuthController.phoneVerify);
router.post('/phone/link', requireAuth, phoneVerifyRateLimiter, validateBody(phoneLinkSchema), AuthController.phoneLink);
router.get('/2fa/status', requireAuth, AuthController.twoFactorStatus);
router.post('/2fa/setup', requireAuth, authRateLimiter, AuthController.twoFactorSetup);
router.post('/2fa/enable', requireAuth, totpVerifyRateLimiter, validateBody(totpEnableSchema), AuthController.twoFactorEnable);
router.post('/2fa/verify', totpVerifyRateLimiter, validateBody(totpVerifyLoginSchema), AuthController.twoFactorVerify);
router.post('/2fa/disable', requireAuth, totpVerifyRateLimiter, validateBody(totpReauthSchema), AuthController.twoFactorDisable);
router.post(
  '/2fa/recovery-codes/regenerate',
  requireAuth,
  totpVerifyRateLimiter,
  validateBody(totpReauthSchema),
  AuthController.twoFactorRegenerateRecovery
);
router.post('/password/forgot', smsRateLimiter, validateBody(forgotPasswordSchema), async (req, res, next) => {
  try {
    res.status(200).json({ success: true, data: await PasswordResetService.start(req.body.email) });
  } catch (err) {
    next(err);
  }
});
router.post('/password/reset', phoneVerifyRateLimiter, validateBody(resetPasswordSchema), async (req, res, next) => {
  try {
    await PasswordResetService.finish(req.body.email, req.body.code, req.body.password);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});
// Signed in: change the password (or set a first one); other devices are signed out.
router.post('/password/change', requireAuth, authRateLimiter, validateBody(changePasswordSchema), async (req: AuthRequest, res, next) => {
  try {
    await AccountService.changePassword(req.user!.userId, req.user!.sessionId, req.body);
    res.status(200).json({ success: true });
  } catch (err) {
    next(err);
  }
});
router.post('/logout', AuthController.logout);
router.get('/config', AuthController.config);
router.get('/session', AuthController.session);
router.get('/me', requireAuth, AuthController.me);

export default router;
