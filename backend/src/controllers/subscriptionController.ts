import { Response, NextFunction } from 'express';
import { AuthRequest } from '../middleware/auth';
import { PLANS, SubscriptionService } from '../services/subscriptionService';
import { BillingService, getUpiQrCodes } from '../services/billingService';

export class SubscriptionController {
  static async status(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const [subStatus, upiData] = await Promise.all([
        SubscriptionService.status(req.user!.userId),
        getUpiQrCodes(),
      ]);
      res.json({
        success: true,
        data: {
          ...subStatus,
          plans: PLANS,
          paymentsAvailable: BillingService.mode() !== 'off',
          paymentMode: BillingService.mode(),
          ...upiData,
        },
      });
    } catch (err) {
      next(err);
    }
  }
}
