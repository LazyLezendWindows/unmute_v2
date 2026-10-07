import { Router } from 'express';
import { ChatController } from '../controllers/chatController';
import { requireAuth } from '../middleware/auth';
import { validateBody, validateParams, validateQuery } from '../middleware/validate';
import { idParamsSchema, paginationSchema } from '../validators/common';
import { messageParamsSchema, reactionSchema, sendMessageSchema } from '../validators/chatValidator';
import { AuthRequest } from '../middleware/auth';
import { ChatService } from '../services/chatService';
import { NextFunction, Response } from 'express';
import { z } from 'zod';
import { GifService } from '../services/gifService';

async function handleGifs(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    res.json({ success: true, data: await GifService.search(String(req.query.q ?? '')) });
  } catch (err) {
    next(err);
  }
}

const router = Router();

router.use(requireAuth);

router.get('/', ChatController.getConversations);
router.get('/call-config', ChatController.iceServers);
// GIF picker: search Giphy (trending when q is empty). The key stays on the server.
router.get(
  '/gifs',
  validateQuery(z.object({ q: z.string().max(50).optional() })),
  handleGifs
);
router.get(
  '/:id/messages',
  validateParams(idParamsSchema),
  validateQuery(paginationSchema(50, 100)),
  ChatController.getMessages
);
router.post('/:id/messages', validateParams(idParamsSchema), validateBody(sendMessageSchema), ChatController.sendMessage);

const handle = (fn: (req: AuthRequest) => Promise<unknown>) => async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    res.json({ success: true, data: await fn(req) });
  } catch (err) {
    next(err);
  }
};
// React to a message (emoji: null removes the reaction).
router.put(
  '/:id/messages/:messageId/reaction',
  validateParams(messageParamsSchema),
  validateBody(reactionSchema),
  handle((req) => ChatService.react(req.params.id, req.user!.userId, req.params.messageId, req.body.emoji))
);
// Unsend your own message.
router.delete(
  '/:id/messages/:messageId',
  validateParams(messageParamsSchema),
  handle((req) => ChatService.deleteMessage(req.params.id, req.user!.userId, req.params.messageId))
);

export default router;
