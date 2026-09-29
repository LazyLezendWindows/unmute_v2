import { Response, NextFunction } from 'express';
import { NotificationService } from '../services/notificationService';
import { PushService } from '../services/pushService';
import { AuthRequest } from '../middleware/auth';
import { Pagination } from '../validators/common';

export class NotificationController {
  /** The public key browsers need to subscribe; null when push isn't set up on this server. */
  static pushKey(_req: AuthRequest, res: Response): void {
    res.status(200).json({ success: true, data: { publicKey: PushService.publicKey() } });
  }

  static async subscribe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await PushService.subscribe(req.user!.userId, req.body);
      res.status(201).json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  static async unsubscribe(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await PushService.unsubscribe(req.user!.userId, req.body.endpoint);
      res.status(200).json({ success: true });
    } catch (err) {
      next(err);
    }
  }

  static async list(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { limit, offset } = req.query as unknown as Pagination;
      const data = await NotificationService.list(req.user!.userId, limit, offset);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async unreadCount(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await NotificationService.unreadCount(req.user!.userId);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async markRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await NotificationService.markRead(req.user!.userId, req.params.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async markAllRead(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await NotificationService.markAllRead(req.user!.userId);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }

  static async remove(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await NotificationService.remove(req.user!.userId, req.params.id);
      res.status(200).json({ success: true, data });
    } catch (err) {
      next(err);
    }
  }
}
