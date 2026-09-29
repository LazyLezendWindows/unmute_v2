import { Router } from 'express';
import { AuthController } from '../controllers/authController';
import { validateBody } from '../middleware/validate';
import { authRateLimiter, phoneVerifyRateLimiter, smsRateLimiter } from '../middleware/rateLimiter';
import { requireAuth } from '../middleware/auth';
import { registerSchema, loginSchema, googleAuthSchema, phoneLinkSchema, phoneStartSchema, phoneVerifySchema } from '../validators/authValidator';

const router = Router();

router.post('/register', authRateLimiter, validateBody(registerSchema), AuthController.register);
router.post('/login', authRateLimiter, validateBody(loginSchema), AuthController.login);
router.post('/google', authRateLimiter, validateBody(googleAuthSchema), AuthController.googleAuth);
router.post('/phone/start', smsRateLimiter, validateBody(phoneStartSchema), AuthController.phoneStart);
router.post('/phone/verify', phoneVerifyRateLimiter, validateBody(phoneVerifySchema), AuthController.phoneVerify);
router.post('/phone/link', requireAuth, phoneVerifyRateLimiter, validateBody(phoneLinkSchema), AuthController.phoneLink);
router.post('/logout', AuthController.logout);
router.get('/config', AuthController.config);
router.get('/session', AuthController.session);
router.get('/me', requireAuth, AuthController.me);

export default router;
