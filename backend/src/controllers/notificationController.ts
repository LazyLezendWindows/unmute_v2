import { Response, NextFunction } from 'express';
import { NotificationService } from '../services/notificationService';
import { AuthRequest } from '../middleware/auth';
import { Pagination } from '../validators/common';

export class NotificationController {
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
