"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NotificationController = void 0;
const notificationService_1 = require("../services/notificationService");
const pushService_1 = require("../services/pushService");
class NotificationController {
    /** The public key browsers need to subscribe; null when push isn't set up on this server. */
    static pushKey(_req, res) {
        res.status(200).json({ success: true, data: { publicKey: pushService_1.PushService.publicKey() } });
    }
    static async subscribe(req, res, next) {
        try {
            await pushService_1.PushService.subscribe(req.user.userId, req.body);
            res.status(201).json({ success: true });
        }
        catch (err) {
            next(err);
        }
    }
    static async unsubscribe(req, res, next) {
        try {
            await pushService_1.PushService.unsubscribe(req.user.userId, req.body.endpoint);
            res.status(200).json({ success: true });
        }
        catch (err) {
            next(err);
        }
    }
    static async list(req, res, next) {
        try {
            const { limit, offset } = req.query;
            const data = await notificationService_1.NotificationService.list(req.user.userId, limit, offset);
            res.status(200).json({ success: true, data });
        }
        catch (err) {
            next(err);
        }
    }
    static async unreadCount(req, res, next) {
        try {
            const data = await notificationService_1.NotificationService.unreadCount(req.user.userId);
            res.status(200).json({ success: true, data });
        }
        catch (err) {
            next(err);
        }
    }
    static async markRead(req, res, next) {
        try {
            const data = await notificationService_1.NotificationService.markRead(req.user.userId, req.params.id);
            res.status(200).json({ success: true, data });
        }
        catch (err) {
            next(err);
        }
    }
    static async markAllRead(req, res, next) {
        try {
            const data = await notificationService_1.NotificationService.markAllRead(req.user.userId);
            res.status(200).json({ success: true, data });
        }
        catch (err) {
            next(err);
        }
    }
    static async remove(req, res, next) {
        try {
            const data = await notificationService_1.NotificationService.remove(req.user.userId, req.params.id);
            res.status(200).json({ success: true, data });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.NotificationController = NotificationController;
