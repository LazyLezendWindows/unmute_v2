import { Router } from 'express';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { recordHeartbeat } from '../sockets/presence';

const router = Router();

/**
 * Authenticated heartbeat endpoint:
 * Allows web clients to keep their online presence active every 30-45s
 * even if WebSockets are temporarily disconnected or unsupported.
 */
router.post('/heartbeat', requireAuth, (req: AuthRequest, res) => {
  const userId = req.user?.userId || (req.user as any)?.id;
  if (userId) {
    recordHeartbeat(userId);
  }
  res.json({ success: true, online: true, timestamp: Date.now() });
});

export default router;
