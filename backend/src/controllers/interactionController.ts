import { Response, NextFunction } from 'express';
import { MatchingService } from '../services/matchingService';
import { AuthRequest } from '../middleware/auth';

export class InteractionController {
  static async getLiked(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await MatchingService.getLikedProfiles(req.user!.userId);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  static async getLikesReceived(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true, data: await MatchingService.getLikesReceived(req.user!.userId) });
    } catch (err) {
      next(err);
    }
  }

  static async like(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { targetUserId } = req.body;
      const result = await MatchingService.recordLike(req.user!.userId, targetUserId, Boolean(req.body.superLike));
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async undoPass(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      res.status(200).json({ success: true, data: await MatchingService.undoPass(req.user!.userId, req.body.targetUserId) });
    } catch (err) {
      next(err);
    }
  }

  static async pass(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const { targetUserId } = req.body;
      const result = await MatchingService.recordPass(req.user!.userId, targetUserId);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
