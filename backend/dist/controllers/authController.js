"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthController = void 0;
const subscriptionService_1 = require("../services/subscriptionService");
const env_1 = require("../config/env");
const authService_1 = require("../services/authService");
const phoneAuthService_1 = require("../services/phoneAuthService");
const smsSender_1 = require("../services/auth/smsSender");
const sessionService_1 = require("../services/sessionService");
const chatSocket_1 = require("../sockets/chatSocket");
/** Opens a server-side session for `userId`, sets the HttpOnly cookie and returns the user. */
async function startSession(req, res, userId) {
    await subscriptionService_1.SubscriptionService.startTrial(userId, req, res);
    const { token, expiresAt } = await sessionService_1.SessionService.create(userId, {
        ip: req.ip,
        userAgent: req.get('user-agent'),
    });
    sessionService_1.SessionService.setCookie(res, token, expiresAt);
    return authService_1.AuthService.getCurrentUser(userId);
}
class AuthController {
    static async register(req, res, next) {
        try {
            const userId = await authService_1.AuthService.register(req.body, () => subscriptionService_1.SubscriptionService.assertNewDevice(req));
            if (typeof userId !== 'string') {
                res.status(200).json({ success: true, data: userId });
                return;
            }
            const user = await startSession(req, res, userId);
            console.info(`[Auth] Registered user ${userId} (password)`);
            res.status(201).json({ success: true, data: { user } });
        }
        catch (err) {
            next(err);
        }
    }
    static async login(req, res, next) {
        try {
            const userId = await authService_1.AuthService.login(req.body);
            const user = await startSession(req, res, userId);
            res.status(200).json({ success: true, data: { user } });
        }
        catch (err) {
            next(err);
        }
    }
    static async googleAuth(req, res, next) {
        try {
            const result = await authService_1.AuthService.googleAuth(req.body, () => subscriptionService_1.SubscriptionService.assertNewDevice(req));
            if (result.requiresDob) {
                res.status(200).json({ success: true, data: result });
                return;
            }
            const user = await startSession(req, res, result.userId);
            res.status(200).json({
                success: true,
                data: { requiresDob: false, isNewUser: result.isNewUser, user },
            });
        }
        catch (err) {
            next(err);
        }
    }
    /** Texts a one-time sign-in code to the number. */
    static async phoneStart(req, res, next) {
        try {
            const result = await phoneAuthService_1.PhoneAuthService.start(req.body);
            res.status(200).json({ success: true, data: result });
        }
        catch (err) {
            next(err);
        }
    }
    /** Checks the code; a new number is asked for a name and date of birth before an account exists. */
    static async phoneVerify(req, res, next) {
        try {
            const result = await phoneAuthService_1.PhoneAuthService.verify(req.body, () => subscriptionService_1.SubscriptionService.assertNewDevice(req));
            if (result.requiresProfile) {
                res.status(200).json({ success: true, data: { requiresProfile: true } });
                return;
            }
            const user = await startSession(req, res, result.userId);
            res.status(200).json({ success: true, data: { requiresProfile: false, isNewUser: result.isNewUser, user } });
        }
        catch (err) {
            next(err);
        }
    }
    /** Adds a confirmed phone number to the signed-in account. */
    static async phoneLink(req, res, next) {
        try {
            await phoneAuthService_1.PhoneAuthService.link(req.user.userId, req.body);
            const user = await authService_1.AuthService.getCurrentUser(req.user.userId);
            res.status(200).json({ success: true, data: { user } });
        }
        catch (err) {
            next(err);
        }
    }
    static async logout(req, res, next) {
        try {
            const sessionId = await sessionService_1.SessionService.revoke(sessionService_1.SessionService.tokenFromRequest(req));
            if (sessionId) {
                // Drop realtime connections that were authenticated by the revoked session.
                (0, chatSocket_1.getSocketServer)()?.in(`session:${sessionId}`).disconnectSockets(true);
            }
            sessionService_1.SessionService.clearCookie(res);
            res.status(200).json({ success: true, message: 'Logged out successfully' });
        }
        catch (err) {
            next(err);
        }
    }
    /** Session restoration: always 200 so an anonymous visit is not reported as an error. */
    /**
     * Public sign-in settings for the client. A Google OAuth client ID is public by design (it is
     * embedded in every page that shows the button); only the backend verifies tokens against it.
     */
    static config(_req, res) {
        res.status(200).json({
            success: true,
            data: { googleClientId: env_1.config.googleClientId || null, phoneSignIn: (0, smsSender_1.smsAvailable)() },
        });
    }
    static async session(req, res, next) {
        try {
            const token = sessionService_1.SessionService.tokenFromRequest(req);
            const session = await sessionService_1.SessionService.resolve(token);
            if (!session) {
                if (token)
                    sessionService_1.SessionService.clearCookie(res);
                res.status(200).json({ success: true, data: { authenticated: false, user: null } });
                return;
            }
            await subscriptionService_1.SubscriptionService.startTrial(session.userId, req, res);
            const user = await authService_1.AuthService.getCurrentUser(session.userId);
            res.status(200).json({ success: true, data: { authenticated: true, user } });
        }
        catch (err) {
            next(err);
        }
    }
    static async me(req, res, next) {
        try {
            const user = await authService_1.AuthService.getCurrentUser(req.user.userId);
            res.status(200).json({ success: true, data: user });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.AuthController = AuthController;
