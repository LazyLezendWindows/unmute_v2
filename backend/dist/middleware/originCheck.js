"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireTrustedOrigin = requireTrustedOrigin;
const env_1 = require("../config/env");
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
/**
 * CSRF defence in depth alongside SameSite=Lax cookies: browsers always send `Origin` on
 * cross-site state-changing requests, so reject any whose origin is not an allowed app origin.
 * Requests without an Origin header (non-browser clients) cannot carry a victim's cookies.
 */
function requireTrustedOrigin(req, res, next) {
    const origin = req.headers.origin;
    if (SAFE_METHODS.has(req.method) || !origin || env_1.config.corsOrigins.includes(origin)) {
        next();
        return;
    }
    res.status(403).json({ success: false, error: 'Request origin not allowed' });
}
