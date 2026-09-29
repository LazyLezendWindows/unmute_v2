import { Router } from 'express';
import { InteractionController } from '../controllers/interactionController';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { interactionSchema, likeSchema } from '../validators/interactionValidator';

const router = Router();

router.use(requireAuth);

router.get('/liked', InteractionController.getLiked);
router.get('/likes-received', InteractionController.getLikesReceived);
router.post('/like', validateBody(likeSchema), InteractionController.like);
router.post('/pass', validateBody(interactionSchema), InteractionController.pass);
router.delete('/pass', validateBody(interactionSchema), InteractionController.undoPass);

export default router;
