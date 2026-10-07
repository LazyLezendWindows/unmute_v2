import { Router } from 'express';
import { MatchController } from '../controllers/matchController';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { validateParams } from '../middleware/validate';
import { idParamsSchema } from '../validators/common';
import { MatchingService } from '../services/matchingService';

const router = Router();

router.use(requireAuth);

router.get('/', MatchController.getMatches);
// Unmatch: ends the match and its chat for both people.
router.delete('/:id', validateParams(idParamsSchema), async (req: AuthRequest, res, next) => {
  try {
    await MatchingService.unmatch(req.user!.userId, req.params.id);
    res.status(200).json({ success: true, data: null });
  } catch (err) {
    next(err);
  }
});

export default router;
