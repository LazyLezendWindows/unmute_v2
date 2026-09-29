"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatController = void 0;
const chatService_1 = require("../services/chatService");
const env_1 = require("../config/env");
class ChatController {
    /** WebRTC servers for calls; signed-in members only, since TURN credentials cost money if abused. */
    static iceServers(_req, res) {
        const { stunUrls, turnUrls, turnUsername, turnCredential } = env_1.config.ice;
        const iceServers = [];
        if (stunUrls.length)
            iceServers.push({ urls: stunUrls });
        if (turnUrls.length)
            iceServers.push({ urls: turnUrls, username: turnUsername, credential: turnCredential });
        res.status(200).json({ success: true, data: { iceServers } });
    }
    static async getConversations(req, res, next) {
        try {
            const convs = await chatService_1.ChatService.getConversations(req.user.userId);
            res.status(200).json({
                success: true,
                data: convs,
            });
        }
        catch (err) {
            next(err);
        }
    }
    static async getMessages(req, res, next) {
        try {
            const { id } = req.params;
            const { limit, offset } = req.query;
            const data = await chatService_1.ChatService.getMessages(id, req.user.userId, limit, offset);
            res.status(200).json({
                success: true,
                data,
            });
        }
        catch (err) {
            next(err);
        }
    }
    static async sendMessage(req, res, next) {
        try {
            const { id } = req.params;
            const { content } = req.body;
            const message = await chatService_1.ChatService.sendMessage(id, req.user.userId, content, req.body.kind ?? 'text');
            res.status(201).json({
                success: true,
                data: message,
            });
        }
        catch (err) {
            next(err);
        }
    }
}
exports.ChatController = ChatController;
