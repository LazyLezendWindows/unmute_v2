"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importStar(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const zod_1 = require("zod");
const validate_1 = require("../middleware/validate");
const common_1 = require("../validators/common");
const verificationService_1 = require("../services/verificationService");
/** The member's own checks, under /users/me/verification (signed-in, with access). */
const router = (0, express_1.Router)();
const images = express_1.default.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '8mb' });
const codeLimiter = (0, express_rate_limit_1.default)({ windowMs: 60 * 60 * 1000, max: Number(process.env.SMS_RATE_LIMIT) || 10, standardHeaders: true, legacyHeaders: false });
const handle = (fn, status = 200) => async (req, res, next) => {
    try {
        res.status(status).json({ success: true, data: (await fn(req)) ?? null });
    }
    catch (err) {
        next(err);
    }
};
router.get('/', handle((req) => verificationService_1.VerificationService.status(req.user.userId)));
router.post('/email/start', codeLimiter, (0, validate_1.validateBody)(zod_1.z.object({ email: zod_1.z.string().email('Please enter a valid email address').max(255).optional() }).strict()), handle((req) => verificationService_1.VerificationService.startEmail(req.user.userId, req.body.email)));
router.post('/email/confirm', (0, validate_1.validateBody)(zod_1.z.object({ email: zod_1.z.string().email().max(255), code: zod_1.z.string().regex(/^\d{6}$/, 'Enter the 6-digit code from the email') }).strict()), handle(async (req) => {
    await verificationService_1.VerificationService.confirmEmail(req.user.userId, req.body.email, req.body.code);
    return verificationService_1.VerificationService.status(req.user.userId);
}));
router.post('/selfie/start', handle((req) => verificationService_1.VerificationService.startSelfie(req.user.userId)));
router.post('/selfie/:id', (0, validate_1.validateParams)(common_1.idParamsSchema), images, handle((req) => verificationService_1.VerificationService.submitSelfie(req.user.userId, req.params.id, req.body), 201));
router.post('/id', images, handle((req) => verificationService_1.VerificationService.submitId(req.user.userId, req.body), 201));
exports.default = router;
