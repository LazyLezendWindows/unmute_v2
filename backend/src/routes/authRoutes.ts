import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { PasswordResetService } from '../services/passwordResetService';
import { validateBody } from '../middleware/validate';
import { authRateLimiter, phoneVerifyRateLimiter, smsRateLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';
import { registerSchema, loginSchema, googleAuthSchema, forgotPasswordSchema, resetPasswordSchema, phoneLinkSchema, phoneStartSchema, phoneVerifySchema } from '../validators/authValidator';

const router = Router();

router.post('/register', authRateLimiter, validateBody(registerSchema), AuthController.register);
router.post('/login', authRateLimiter, validateBody(loginSchema), AuthController.login);
router.post('/google', authRateLimiter, validateBody(googleAuthSchema), AuthController.googleAuth);
router.post('/phone/start', smsRateLimiter, validateBody(phoneStartSchema), AuthController.phoneStart);
router.post('/phone/verify', phoneVerifyRateLimiter, validateBody(phoneVerifySchema), AuthController.phoneVerify);
router.post('/phone/link', requireAuth, phoneVerifyRateLimiter, validateBody(phoneLinkSchema), AuthController.phoneLink);
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
router.post('/logout', AuthController.logout);
router.get('/config', AuthController.config);
router.get('/session', AuthController.session);
router.get('/me', requireAuth, AuthController.me);

export default router;
