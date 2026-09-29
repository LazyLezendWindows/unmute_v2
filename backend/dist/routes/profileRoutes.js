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
const verificationRoutes_1 = __importDefault(require("./verificationRoutes"));
const profileController_1 = require("../controllers/profileController");
const locationController_1 = require("../controllers/locationController");
const educationController_1 = require("../controllers/educationController");
const auth_1 = require("../middleware/auth");
const rateLimiter_1 = require("../middleware/rateLimiter");
const validate_1 = require("../middleware/validate");
const profileValidator_1 = require("../validators/profileValidator");
const locationValidator_1 = require("../validators/locationValidator");
const educationValidator_1 = require("../validators/educationValidator");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.get('/me', profileController_1.ProfileController.getMyProfile);
router.patch('/me', (0, validate_1.validateBody)(profileValidator_1.updateProfileSchema), profileController_1.ProfileController.updateMyProfile);
router.get('/interests', profileController_1.ProfileController.getInterests);
// The photo is the request body itself (no multipart), up to 5 MB; its bytes decide the type.
router.post('/me/photos', express_1.default.raw({ type: ['image/jpeg', 'image/png', 'image/webp'], limit: '5mb' }), profileController_1.ProfileController.uploadPhoto);
// A voice message recording, up to 3 MB; its bytes decide the format.
router.post('/me/voice', express_1.default.raw({ type: ['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg', 'video/webm'], limit: '3mb' }), profileController_1.ProfileController.uploadVoice);
router.use('/me/verification', verificationRoutes_1.default);
router.put('/me/location', rateLimiter_1.locationRateLimiter, (0, validate_1.validateBody)(locationValidator_1.setLocationSchema), locationController_1.LocationController.setMyLocation);
router.patch('/me/location', (0, validate_1.validateBody)(locationValidator_1.updatePrecisionSchema), locationController_1.LocationController.updateMyPrecision);
router.delete('/me/location', locationController_1.LocationController.clearMyLocation);
router.put('/me/education', (0, validate_1.validateBody)(educationValidator_1.setEducationSchema), educationController_1.EducationController.setMyEducation);
router.delete('/me/education', educationController_1.EducationController.clearMyEducation);
exports.default = router;
