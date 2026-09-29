import express, { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validate';
import { idParamsSchema } from '../validators/common';
import { VerificationService } from '../services/verificationService';

/** The member's own checks, under /users/me/verification (signed-in, with access). */
const router = Router();
const images = express.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' });
const codeLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: Number(process.env.SMS_RATE_LIMIT) || 10, standardHeaders: true, legacyHeaders: false });

const handle =
  (fn: (req: AuthRequest) => Promise<unknown>, status = 200) =>
  async (req: AuthRequest, res: express.Response, next: express.NextFunction) => {
    try {
      res.status(status).json({ success: true, data: (await fn(req)) ?? null });
    } catch (err) {
      next(err);
    }
  };

router.get('/', handle((req) => VerificationService.status(req.user!.userId)));
router.post(
  '/email/start',
  codeLimiter,
  validateBody(z.object({ email: z.string().email('Please enter a valid email address').max(255).optional() }).strict()),
  handle((req) => VerificationService.startEmail(req.user!.userId, req.body.email))
);
router.post(
  '/email/confirm',
  validateBody(z.object({ email: z.string().email().max(255), code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the email') }).strict()),
  handle(async (req) => {
    await VerificationService.confirmEmail(req.user!.userId, req.body.email, req.body.code);
    return VerificationService.status(req.user!.userId);
  })
);
router.post('/selfie/start', handle((req) => VerificationService.startSelfie(req.user!.userId)));
router.post('/selfie/:id', validateParams(idParamsSchema), images, handle((req) => VerificationService.submitSelfie(req.user!.userId, req.params.id, req.body), 201));
router.post('/id', images, handle((req) => VerificationService.submitId(req.user!.userId, req.body), 201));

export default router;
