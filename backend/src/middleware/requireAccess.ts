import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { SubscriptionService } from '../services/subscriptionService';

export async function requireAccess(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try { await SubscriptionService.requireAccess(req.user!.userId); next(); } catch (err) { next(err); }
}
