import { Response, NextFunction } from 'express';
import { ProfileService } from '../services/profileService';
import { MediaService } from '../services/mediaService';
import { AuthRequest } from '../middleware/auth';

export class ProfileController {
  static async getMyProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await ProfileService.getProfile(req.user!.userId);
      res.status(200).json({
        success: true,
        data: profile,
      });
    } catch (err) {
      next(err);
    }
  }

  static async updateMyProfile(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const updated = await ProfileService.updateProfile(req.user!.userId, req.body);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  /** Stores the raw image body; the profile uses it once the returned URL is saved with PATCH /me. */
  static async uploadPhoto(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const url = await MediaService.savePhoto(req.user!.userId, req.body);
      res.status(201).json({ success: true, data: { url } });
    } catch (err) {
      next(err);
    }
  }

  static async getInterests(_req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const interests = await ProfileService.getAllInterests();
      res.status(200).json({
        success: true,
        data: interests,
      });
    } catch (err) {
      next(err);
    }
  }
}
