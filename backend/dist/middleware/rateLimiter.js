"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.locationRateLimiter = exports.reportRateLimiter = exports.apiRateLimiter = exports.phoneVerifyRateLimiter = exports.smsRateLimiter = exports.authRateLimiter = void 0;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
exports.authRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 50, // 50 attempts per window
    message: {
        success: false,
        error: 'Too many authentication attempts. Please try again in 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
/** Each code request sends a paid SMS, so these are capped per client well below other sign-in calls. */
exports.smsRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 10,
    message: {
        success: false,
        error: 'Too many code requests. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
/** Code checks; each code also locks after a few wrong guesses (see PhoneAuthService). */
exports.phoneVerifyRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 30,
    message: {
        success: false,
        error: 'Too many code attempts. Please try again in 15 minutes.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
exports.apiRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 300, // 300 requests per minute
    message: {
        success: false,
        error: 'Too many requests. Please slow down.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
/** Per-account cap on abuse reports (must run after requireAuth). */
exports.reportRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    keyGenerator: (req) => req.user.userId,
    message: {
        success: false,
        error: 'You have submitted many reports recently. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
/**
 * Per-account cap on changing one's area (must run after requireAuth). Moving a search origin
 * around repeatedly is how distance-based apps get trilaterated.
 */
exports.locationRateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 30,
    keyGenerator: (req) => req.user.userId,
    message: {
        success: false,
        error: 'You have changed your area many times recently. Please try again later.',
    },
    standardHeaders: true,
    legacyHeaders: false,
});
