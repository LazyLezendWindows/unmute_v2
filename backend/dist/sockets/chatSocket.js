"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
exports.getSocketServer = getSocketServer;
const subscriptionService_1 = require("../services/subscriptionService");
const socket_io_1 = require("socket.io");
const env_1 = require("../config/env");
const sessionService_1 = require("../services/sessionService");
const chatService_1 = require("../services/chatService");
const presence_1 = require("./presence");
const callSignals_1 = require("./callSignals");
let ioInstance = null;
function initSocketServer(server) {
    ioInstance = new socket_io_1.Server(server, {
        cors: {
            origin: env_1.config.corsOrigins,
            methods: ['GET', 'POST'],
            credentials: true,
        },
    });
    // Authenticate the handshake with the same HttpOnly session cookie as the REST API.
    ioInstance.use(async (socket, next) => {
        try {
            const origin = socket.handshake.headers.origin;
            if (origin && !env_1.config.corsOrigins.includes(origin)) {
                return next(new Error('Origin not allowed'));
            }
            const session = await sessionService_1.SessionService.resolve(sessionService_1.SessionService.readToken(socket.handshake.headers.cookie));
            if (!session) {
                return next(new Error('Authentication required'));
            }
            await subscriptionService_1.SubscriptionService.requireAccess(session.userId);
            socket.data.userId = session.userId;
            socket.data.sessionId = session.sessionId;
            next();
        }
        catch (err) {
            next(err);
        }
    });
    ioInstance.on('connection', (socket) => {
        const userId = socket.data.userId;
        // Check each inbound action, and disconnect at expiry even if the socket stays idle.
        socket.use(async (_packet, next) => {
            try {
                await subscriptionService_1.SubscriptionService.requireAccess(userId);
                next();
            }
            catch {
                socket.emit('subscription:expired');
                socket.disconnect(true);
            }
        });
        let expiryTimer;
        const scheduleExpiry = async () => {
            try {
                const status = await subscriptionService_1.SubscriptionService.status(userId);
                if (!status.active) {
                    socket.emit('subscription:expired');
                    socket.disconnect(true);
                    return;
                }
                if (socket.connected)
                    expiryTimer = setTimeout(scheduleExpiry, Math.min(2147483647, Math.max(1, Date.parse(status.expiresAt) - Date.now())));
            }
            catch {
                socket.disconnect(true);
            }
        };
        void scheduleExpiry();
        socket.on('disconnect', () => clearTimeout(expiryTimer));
        socket.join(`user:${userId}`);
        // Lets logout disconnect exactly the sockets opened with the revoked session.
        socket.join(`session:${socket.data.sessionId}`);
        (0, presence_1.markConnected)(userId);
        socket.on('disconnect', () => (0, presence_1.markDisconnected)(userId));
        (0, callSignals_1.registerCallSignals)(ioInstance, socket, userId);
        socket.on('join_conversation', async (conversationId) => {
            if (typeof conversationId !== 'string' || conversationId.length > 64)
                return;
            try {
                if (await chatService_1.ChatService.canAccessConversation(conversationId, userId)) {
                    socket.join(`conversation:${conversationId}`);
                }
            }
            catch (err) {
                console.error('[Socket] join_conversation failed:', err);
            }
        });
        socket.on('leave_conversation', (conversationId) => {
            if (typeof conversationId === 'string')
                socket.leave(`conversation:${conversationId}`);
        });
        socket.on('read_conversation', async (conversationId, acknowledge) => {
            if (typeof conversationId !== 'string' || conversationId.length > 64)
                return;
            try {
                await chatService_1.ChatService.readMessages(conversationId, userId);
                if (typeof acknowledge === 'function')
                    acknowledge({ success: true });
            }
            catch {
                if (typeof acknowledge === 'function')
                    acknowledge({ success: false });
            }
        });
    });
    return ioInstance;
}
function getSocketServer() {
    return ioInstance;
}
