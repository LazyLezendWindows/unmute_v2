"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const zod_1 = require("zod");
const notificationPreferences_1 = require("../services/notificationPreferences");
const express_1 = require("express");
const notificationController_1 = require("../controllers/notificationController");
const auth_1 = require("../middleware/auth");
const validate_1 = require("../middleware/validate");
const pushValidator_1 = require("../validators/pushValidator");
const common_1 = require("../validators/common");
const router = (0, express_1.Router)();
router.use(auth_1.requireAuth);
router.get('/preferences', async (req, res, next) => {
    try {
        res.json({ success: true, data: await (0, notificationPreferences_1.getNotificationPreferences)(req.user.userId) });
    }
    catch (err) {
        next(err);
    }
});
router.put('/preferences', (0, validate_1.validateBody)(zod_1.z.object({ calls: zod_1.z.boolean(), messages: zod_1.z.boolean() }).strict()), async (req, res, next) => {
    try {
        res.json({ success: true, data: await (0, notificationPreferences_1.saveNotificationPreferences)(req.user.userId, req.body) });
    }
    catch (err) {
        next(err);
    }
});
router.get('/', (0, validate_1.validateQuery)((0, common_1.paginationSchema)(30, 100)), notificationController_1.NotificationController.list);
router.get('/unread-count', notificationController_1.NotificationController.unreadCount);
router.get('/push-key', notificationController_1.NotificationController.pushKey);
router.post('/push-subscriptions', (0, validate_1.validateBody)(pushValidator_1.pushSubscriptionSchema), notificationController_1.NotificationController.subscribe);
router.delete('/push-subscriptions', (0, validate_1.validateBody)(pushValidator_1.pushEndpointSchema), notificationController_1.NotificationController.unsubscribe);
router.post('/read-all', notificationController_1.NotificationController.markAllRead);
router.post('/:id/read', (0, validate_1.validateParams)(common_1.idParamsSchema), notificationController_1.NotificationController.markRead);
router.delete('/:id', (0, validate_1.validateParams)(common_1.idParamsSchema), notificationController_1.NotificationController.remove);
exports.default = router;
