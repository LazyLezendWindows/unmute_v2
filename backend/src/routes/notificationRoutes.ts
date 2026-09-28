import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { requireAuth } from '../middleware/auth';
import { validateParams, validateQuery } from '../middleware/validate';
import { idParamsSchema, paginationSchema } from '../validators/common';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(paginationSchema(30, 100)), NotificationController.list);
router.get('/unread-count', NotificationController.unreadCount);
router.post('/read-all', NotificationController.markAllRead);
router.post('/:id/read', validateParams(idParamsSchema), NotificationController.markRead);
router.delete('/:id', validateParams(idParamsSchema), NotificationController.remove);

export default router;
