import subscriptionRoutes from './subscriptionRoutes';
import { requireAuth } from '../middleware/auth';
import { requireAccess } from '../middleware/requireAccess';
import { Router } from 'express';
import authRoutes from './authRoutes';
import profileRoutes from './profileRoutes';
import discoverRoutes from './discoverRoutes';
import interactionRoutes from './interactionRoutes';
import matchRoutes from './matchRoutes';
import chatRoutes from './chatRoutes';
import safetyRoutes from './safetyRoutes';
import locationRoutes from './locationRoutes';
import educationRoutes from './educationRoutes';
import notificationRoutes from './notificationRoutes';

const apiRouter = Router();

apiRouter.use('/auth', authRoutes);
apiRouter.use('/subscriptions', subscriptionRoutes);
apiRouter.use('/safety', safetyRoutes);
apiRouter.use(['/users', '/discover', '/interactions', '/matches', '/conversations', '/locations', '/education', '/notifications'], requireAuth, requireAccess);
apiRouter.use('/users', profileRoutes);
apiRouter.use('/discover', discoverRoutes);
apiRouter.use('/interactions', interactionRoutes);
apiRouter.use('/matches', matchRoutes);
apiRouter.use('/conversations', chatRoutes);
apiRouter.use('/locations', locationRoutes);
apiRouter.use('/education', educationRoutes);
apiRouter.use('/notifications', notificationRoutes);

export default apiRouter;
