"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const validate_1 = require("../middleware/validate");
const common_1 = require("../validators/common");
const premiumService_1 = require("../services/premiumService");
/** Premium extras, under /users/me/premium (signed in, with access). */
const router = (0, express_1.Router)();
const handle = (fn) => async (req, res, next) => {
    try {
        res.json({ success: true, data: await fn(req) });
    }
    catch (err) {
        next(err);
    }
};
router.get('/', handle((req) => premiumService_1.PremiumService.overview(req.user.userId)));
router.post('/boost', handle((req) => premiumService_1.PremiumService.boost(req.user.userId)));
router.put('/travel', (0, validate_1.validateBody)(zod_1.z.object({ placeId: common_1.idSchema }).strict()), handle((req) => premiumService_1.PremiumService.setTravel(req.user.userId, req.body.placeId)));
router.delete('/travel', handle((req) => premiumService_1.PremiumService.clearTravel(req.user.userId)));
exports.default = router;
