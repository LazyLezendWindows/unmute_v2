"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const sessionService_1 = require("../services/sessionService");
/** Authenticates the request from the HttpOnly session cookie; the server is the only authority. */
async function requireAuth(req, res, next) {
    try {
        const session = await sessionService_1.SessionService.resolve(sessionService_1.SessionService.tokenFromRequest(req));
        if (!session) {
            res.status(401).json({
                success: false,
                error: 'Authentication required. Please sign in.',
            });
            return;
        }
        req.user = session;
        next();
    }
    catch (err) {
        next(err);
    }
}
