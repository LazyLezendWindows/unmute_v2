import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { PLANS, SubscriptionService } from '../services/subscriptionService';
import { BillingService } from '../services/billingService';

export class SubscriptionController {
  static async status(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try { res.json({ success: true, data: { ...await SubscriptionService.status(req.user!.userId), plans: PLANS, paymentsAvailable: BillingService.mode() !== 'off', paymentMode: BillingService.mode() } }); }
    catch (err) { next(err); }
  }
}
