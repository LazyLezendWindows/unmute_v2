import { Response, NextFunction } from 'express';
import { AuthRequest } from './auth';
import { SubscriptionService } from '../services/subscriptionService';

/**
 * Still allowed once the free trial or plan has ended (everything else answers 402 and the app
 * shows Upgrade): account settings (delete, pause, email status and change), and Refer & earn,
 * which can win free time.
 */
const ALLOWED_WITHOUT_ACCESS: { method: string; path: RegExp }[] = [
  { method: 'DELETE', path: /^\/users\/me\/?$/ },
  { method: 'PUT', path: /^\/users\/me\/pause\/?$/ },
  { method: 'GET', path: /^\/users\/me\/referral\/?$/ },
  { method: 'POST', path: /^\/users\/me\/referral\/?$/ },
  { method: 'GET', path: /^\/users\/me\/verification\/?$/ },
  { method: 'POST', path: /^\/users\/me\/verification\/email\/(start|confirm)\/?$/ },
];

export async function requireAccess(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  const path = req.originalUrl.replace(/^\/api\/v1/, '').split('?')[0];
  if (ALLOWED_WITHOUT_ACCESS.some((rule) => rule.method === req.method && rule.path.test(path))) {
    next();
    return;
  }
  try { await SubscriptionService.requireAccess(req.user!.userId); next(); } catch (err) { next(err); }
}
