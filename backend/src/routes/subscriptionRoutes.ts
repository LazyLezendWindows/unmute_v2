import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { AuthRequest, requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { BillingService } from '../services/billingService';
import { SubscriptionController } from '../controllers/subscriptionController';

const router = Router();
router.use(requireAuth);
router.get('/', SubscriptionController.status);
router.use(rateLimit({ windowMs: 60000, limit: 10, standardHeaders: true, legacyHeaders: false }));
router.post('/orders', validateBody(z.object({ planId: z.string().max(20) })), async (req: AuthRequest, res, next) => {
  try { res.json({ success: true, data: await BillingService.createOrder(req.user!.userId, req.body.planId) }); }
  catch (err) { next(err); }
});
router.post('/verify', validateBody(z.object({
  razorpay_order_id: z.string().regex(/^order_[a-zA-Z0-9]+$/).max(64),
  razorpay_payment_id: z.string().regex(/^pay_[a-zA-Z0-9]+$/).max(64),
  razorpay_signature: z.string().regex(/^[a-f0-9]{64}$/),
})), async (req: AuthRequest, res, next) => {
  try { res.json({ success: true, data: await BillingService.verify(req.user!.userId, req.body.razorpay_order_id, req.body.razorpay_payment_id, req.body.razorpay_signature) }); }
  catch (err) { next(err); }
});
router.post('/test-purchase', validateBody(z.object({ planId: z.string().max(20) })), async (req: AuthRequest, res, next) => {
  try { res.json({ success: true, data: await BillingService.testPurchase(req.user!.userId, req.body.planId) }); }
  catch (err) { next(err); }
});
router.post('/reconcile', async (req: AuthRequest, res, next) => {
  try { res.json({ success: true, data: await BillingService.reconcile(req.user!.userId) }); }
  catch (err) { next(err); }
});
export default router;
