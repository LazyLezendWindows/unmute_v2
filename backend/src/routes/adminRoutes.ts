import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { validateBody, validateParams } from '../middleware/validate';
import { idParamsSchema } from '../validators/common';
import { AppError } from '../middleware/errorHandler';
import { UserRepository } from '../repositories/userRepository';
import { VerificationService } from '../services/verificationService';

/** Moderator tools (accounts listed in ADMIN_EMAILS): reviewing photo and ID verifications. */
const router = Router();
router.use(requireAuth);
router.use(async (req: AuthRequest, _res: Response, next: NextFunction) => {
  try {
    const user = await UserRepository.findById(req.user!.userId);
    if (!VerificationService.isAdmin(user?.email)) throw new AppError('Not found', 404);
    next();
  } catch (err) {
    next(err);
  }
});

router.get('/verifications', async (_req, res, next) => {
  try {
    res.json({ success: true, data: await VerificationService.queue() });
  } catch (err) {
    next(err);
  }
});

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
  async (req: AuthRequest, res, next) => {
    try {
      await VerificationService.decide(req.user!.userId, req.params.id, req.body.approve, req.body.reason);
      res.json({ success: true });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
