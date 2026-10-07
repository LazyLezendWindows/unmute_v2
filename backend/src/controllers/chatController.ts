import { Response, NextFunction } from 'express';
import { ChatService } from '../services/chatService';
import { AuthRequest } from '../middleware/auth';
import { Pagination } from '../validators/common';
import { config } from '../config/env';

export class ChatController {
  /** WebRTC servers for calls; signed-in members only, since TURN credentials cost money if abused. */
  static iceServers(_req: AuthRequest, res: Response): void {
    const { stunUrls, turnUrls, turnUsername, turnCredential } = config.ice;
    const iceServers: { urls: string[]; username?: string; credential?: string }[] = [];
    if (stunUrls.length) iceServers.push({ urls: stunUrls });
    if (turnUrls.length) iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
    res.status(200).json({ success: true, data: { iceServers } });
  }

  static async getConversations(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const convs = await ChatService.getConversations(req.user!.userId);
      res.status(200).json({
        success: true,
        data: convs,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getMessages(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { limit, offset } = req.query as unknown as Pagination;
      const data = await ChatService.getMessages(id, req.user!.userId, limit, offset);
      res.status(200).json({
        success: true,
        data,
      });
    } catch (err) {
      next(err);
    }
  }

  static async sendMessage(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const { content } = req.body;
      const message = await ChatService.sendMessage(id, req.user!.userId, content, req.body.kind ?? 'text', req.body.replyToId);
      res.status(201).json({
        success: true,
        data: message,
      });
    } catch (err) {
      next(err);
    }
  }
}
