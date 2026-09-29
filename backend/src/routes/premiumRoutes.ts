import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { AuthRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { idSchema } from '../validators/common';
import { PremiumService } from '../services/premiumService';

/** Premium extras, under /users/me/premium (signed in, with access). */
const router = Router();

const handle = (fn: (req: AuthRequest) => Promise<unknown>) => async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (err) {
    next(err);
  }
};

router.get('/', handle((req) => PremiumService.overview(req.user!.userId)));
router.post('/boost', handle((req) => PremiumService.boost(req.user!.userId)));
router.put('/travel', validateBody(z.object({ placeId: idSchema }).strict()), handle((req) => PremiumService.setTravel(req.user!.userId, req.body.placeId)));
router.delete('/travel', handle((req) => PremiumService.clearTravel(req.user!.userId)));

export default router;
