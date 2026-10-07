import { SubscriptionService } from '../services/subscriptionService';
import { ReferralService } from '../services/referralService';
import { GifService } from '../services/gifService';
import { config } from '../config/env';
import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/authService';
import { PhoneAuthService } from '../services/phoneAuthService';
import { smsAvailable } from '../services/auth/smsSender';
import { SessionService } from '../services/sessionService';
import { AuthRequest } from '../middleware/auth';
import { getSocketServer } from '../sockets/chatSocket';

/** Opens a server-side session for `userId`, sets the HttpOnly cookie and returns the user. */
async function startSession(req: Request, res: Response, userId: string) {
  await SubscriptionService.startTrial(userId, req, res);
  const { token, expiresAt } = await SessionService.create(userId, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  SessionService.setCookie(res, token, expiresAt);
  return AuthService.getCurrentUser(userId);
}

/** A bad referral code stops sign-up before the account exists, so the member can fix it. */
async function checkReferralCode(body: { referralCode?: string; displayName?: string; dateOfBirth?: string }) {
  if (body.referralCode?.trim()) await ReferralService.findReferrer(body.referralCode);
}

async function applyReferral(userId: string, code?: string) {
  if (!code?.trim()) return;
  try {
    await ReferralService.apply(userId, code);
  } catch (err) {
    console.warn('[Referral] Not applied:', (err as Error).message);
  }
}

export class AuthController {
  static async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      await checkReferralCode(req.body);
      const userId = await AuthService.register(req.body);
      if (typeof userId !== 'string') {
        res.status(200).json({ success: true, data: userId });
        return;
      }
      await startSession(req, res, userId);
      await applyReferral(userId, req.body.referralCode);
      const user = await AuthService.getCurrentUser(userId);
      console.info(`[Auth] Registered user ${userId} (password)`);
      res.status(201).json({ success: true, data: { user } });
    } catch (err) {
      next(err);
    }
  }

  static async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = await AuthService.login(req.body);
      const user = await startSession(req, res, userId);
      res.status(200).json({ success: true, data: { user } });
    } catch (err) {
      next(err);
    }
  }

  static async googleAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.body.dateOfBirth) await checkReferralCode(req.body);
      const result = await AuthService.googleAuth(req.body);
      if (result.requiresDob) {
        res.status(200).json({ success: true, data: result });
        return;
      }
      let user = await startSession(req, res, result.userId);
      if (result.isNewUser && req.body.referralCode) {
        await applyReferral(result.userId, req.body.referralCode);
        user = await AuthService.getCurrentUser(result.userId);
      }
      res.status(200).json({
        success: true,
        data: { requiresDob: false, isNewUser: result.isNewUser, user },
      });
    } catch (err) {
      next(err);
    }
  }

  /** Texts a one-time sign-in code to the number. */
  static async phoneStart(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await PhoneAuthService.start(req.body);
      res.status(200).json({ success: true, data: result });
    } catch (err) {
      next(err);
    }
  }

  /** Checks the code; a new number is asked for a name and date of birth before an account exists. */
  static async phoneVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (req.body.displayName) await checkReferralCode(req.body);
      const result = await PhoneAuthService.verify(req.body);
      if (result.requiresProfile) {
        res.status(200).json({ success: true, data: { requiresProfile: true } });
        return;
      }
      let user = await startSession(req, res, result.userId);
      if (result.isNewUser && req.body.referralCode) {
        await applyReferral(result.userId, req.body.referralCode);
        user = await AuthService.getCurrentUser(result.userId);
      }
      res.status(200).json({ success: true, data: { requiresProfile: false, isNewUser: result.isNewUser, user } });
    } catch (err) {
      next(err);
    }
  }

  /** Adds a confirmed phone number to the signed-in account. */
  static async phoneLink(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      await PhoneAuthService.link(req.user!.userId, req.body);
      // A verified number unlocks a pending referral reward.
      await ReferralService.rewardIfReady(req.user!.userId).catch((err) => console.warn('[Referral] Reward failed:', err.message));
      const user = await AuthService.getCurrentUser(req.user!.userId);
      res.status(200).json({ success: true, data: { user } });
    } catch (err) {
      next(err);
    }
  }

  static async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sessionId = await SessionService.revoke(SessionService.tokenFromRequest(req));
      if (sessionId) {
        // Drop realtime connections that were authenticated by the revoked session.
        getSocketServer()?.in(`session:${sessionId}`).disconnectSockets(true);
      }
      SessionService.clearCookie(res);
      res.status(200).json({ success: true, message: 'Logged out successfully' });
    } catch (err) {
      next(err);
    }
  }

  /** Session restoration: always 200 so an anonymous visit is not reported as an error. */
  /**
   * Public sign-in settings for the client. A Google OAuth client ID is public by design (it is
   * embedded in every page that shows the button); only the backend verifies tokens against it.
   */
  static config(_req: Request, res: Response): void {
    res.status(200).json({
      success: true,
      data: { googleClientId: config.googleClientId || null, phoneSignIn: smsAvailable(), gifs: GifService.enabled() },
    });
  }

  static async session(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = SessionService.tokenFromRequest(req);
      const session = await SessionService.resolve(token);
      if (!session) {
        if (token) SessionService.clearCookie(res);
        res.status(200).json({ success: true, data: { authenticated: false, user: null } });
        return;
      }
      await SubscriptionService.startTrial(session.userId, req, res);
      const user = await AuthService.getCurrentUser(session.userId);
      res.status(200).json({ success: true, data: { authenticated: true, user } });
    } catch (err) {
      next(err);
    }
  }

  static async me(req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await AuthService.getCurrentUser(req.user!.userId);
      res.status(200).json({ success: true, data: user });
    } catch (err) {
      next(err);
    }
  }
}
