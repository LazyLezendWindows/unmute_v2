import { Request, Response, NextFunction } from 'express';
import { BillingService, verifySignature } from '../services/billingService';
import { AppError } from '../middleware/errorHandler';

export async function billingWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, req.get('x-razorpay-signature') || '', process.env.RAZORPAY_WEBHOOK_SECRET || '')) {
      throw new AppError('Invalid webhook signature.', 400);
    }
    let event;
    try { event = JSON.parse(req.body.toString('utf8')); }
    catch { throw new AppError('Invalid webhook payload.', 400); }
    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const payment = event.payload?.payment?.entity;
      if (!payment?.id || !payment?.order_id) throw new AppError('Missing payment.', 400);
      await BillingService.fulfill(payment);
    }
    res.json({ success: true });
  } catch (err) { next(err); }
}
