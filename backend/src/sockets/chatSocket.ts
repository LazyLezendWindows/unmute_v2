import { SubscriptionService } from '../services/subscriptionService';
import { Server as HttpServer } from 'http';
import { Server as SocketIOServer, Socket } from 'socket.io';
import { config } from '../config/env';
import { SessionService } from '../services/sessionService';
import { ChatService } from '../services/chatService';
import { markConnected, markDisconnected } from './presence';
import { registerCallSignals } from './callSignals';

let ioInstance: SocketIOServer | null = null;

export function initSocketServer(server: HttpServer): SocketIOServer {
  ioInstance = new SocketIOServer(server, {
    cors: {
      origin: config.corsOrigins,
      methods: ['GET', 'POST'],
      credentials: true,
    },
  });

  // Authenticate the handshake with the same HttpOnly session cookie as the REST API.
  ioInstance.use(async (socket: Socket, next) => {
    try {
      const origin = socket.handshake.headers.origin;
      if (origin && !config.corsOrigins.includes(origin)) {
        return next(new Error('Origin not allowed'));
      }
      const session = await SessionService.resolve(SessionService.readToken(socket.handshake.headers.cookie));
      if (!session) {
        return next(new Error('Authentication required'));
      }
      await SubscriptionService.requireAccess(session.userId);
      socket.data.userId = session.userId;
      socket.data.sessionId = session.sessionId;
      next();
    } catch (err) {
      next(err as Error);
    }
  });

  ioInstance.on('connection', (socket: Socket) => {
    const userId: string = socket.data.userId;
    // Check each inbound action, and disconnect at expiry even if the socket stays idle.
    socket.use(async (_packet, next) => {
      try { await SubscriptionService.requireAccess(userId); next(); }
      catch { socket.emit('subscription:expired'); socket.disconnect(true); }
    });
    let expiryTimer: ReturnType<typeof setTimeout>;
    const scheduleExpiry = async () => {
      try {
        const status = await SubscriptionService.status(userId);
        if (!status.active) { socket.emit('subscription:expired'); socket.disconnect(true); return; }
        if (socket.connected) expiryTimer = setTimeout(scheduleExpiry, Math.min(2147483647, Math.max(1, Date.parse(status.expiresAt!) - Date.now())));
      } catch { socket.disconnect(true); }
    };
    void scheduleExpiry();
    socket.on('disconnect', () => clearTimeout(expiryTimer));
    socket.join(`user:${userId}`);
    // Lets logout disconnect exactly the sockets opened with the revoked session.
    socket.join(`session:${socket.data.sessionId}`);
    markConnected(userId);
    socket.on('disconnect', () => markDisconnected(userId));

    registerCallSignals(ioInstance!, socket, userId);

    socket.on('join_conversation', async (conversationId: unknown) => {
      if (typeof conversationId !== 'string' || conversationId.length > 64) return;
      try {
        if (await ChatService.canAccessConversation(conversationId, userId)) {
          socket.join(`conversation:${conversationId}`);
        }
      } catch (err) {
        console.error('[Socket] join_conversation failed:', err);
      }
    });

    socket.on('leave_conversation', (conversationId: unknown) => {
      if (typeof conversationId === 'string') socket.leave(`conversation:${conversationId}`);
    });

    socket.on('typing', (conversationId: unknown, isTyping: unknown) => {
      if (typeof conversationId !== 'string' || conversationId.length > 64 || !socket.rooms.has(`conversation:${conversationId}`)) return;
      void ChatService.typing(conversationId, userId, isTyping !== false).catch(() => undefined);
    });

    socket.on('read_conversation', async (conversationId: unknown, acknowledge?: (result: { success: boolean }) => void) => {
      if (typeof conversationId !== 'string' || conversationId.length > 64) return;
      try {
        await ChatService.readMessages(conversationId, userId);
        if (typeof acknowledge === 'function') acknowledge({ success: true });
      } catch {
        if (typeof acknowledge === 'function') acknowledge({ success: false });
      }
    });
  });

  return ioInstance;
}

export function getSocketServer(): SocketIOServer | null {
  return ioInstance;
}
