import { Router } from 'express';
import { NotificationController } from '../controllers/notificationController';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { pushSubscriptionSchema, pushEndpointSchema } from '../validators/pushValidator';
import { idParamsSchema, paginationSchema } from '../validators/common';

const router = Router();

router.use(requireAuth);

router.get('/', validateQuery(paginationSchema(30, 100)), NotificationController.list);
router.get('/unread-count', NotificationController.unreadCount);
router.get('/push-key', NotificationController.pushKey);
router.post('/push-subscriptions', validateBody(pushSubscriptionSchema), NotificationController.subscribe);
router.delete('/push-subscriptions', validateBody(pushEndpointSchema), NotificationController.unsubscribe);
router.post('/read-all', NotificationController.markAllRead);
router.post('/:id/read', validateParams(idParamsSchema), NotificationController.markRead);
router.delete('/:id', validateParams(idParamsSchema), NotificationController.remove);

export default router;
