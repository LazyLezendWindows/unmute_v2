import { notifySubscriptionRequired } from './api';
import { io, Socket } from 'socket.io-client';
import { SOCKET_ORIGIN } from '../config';

let socket: Socket | null = null;

export function getSocket(): Socket | null {
  return socket;
}

/** Connects the realtime channel; the server authenticates it with the HttpOnly session cookie. */
export function connectSocket(): Socket {
  if (socket) {
    return socket;
  }

  // Keeps retrying (backing off to 10s) through server restarts and network drops; the default
  // attempt limit would leave the app without live updates until a reload.
  socket = io(SOCKET_ORIGIN, {
    withCredentials: true,
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
  });

  socket.on('subscription:expired', notifySubscriptionRequired);

  socket.on('connect_error', (err) => {
    // A rejected handshake (signed out) is final; network failures are retried automatically.
    if (socket?.active) console.warn('[Socket] Connection lost, retrying:', err.message);
    else console.warn('[Socket] Connection refused:', err.message);
  });

  return socket;
}

/**
 * Runs `handler` after each reconnect, when rooms must be rejoined and missed events caught up.
 * Registering the same handler again replaces it rather than adding a duplicate.
 */
export function onReconnect(handler: () => void): void {
  if (!socket) return;
  socket.io.off('reconnect', handler);
  socket.io.on('reconnect', handler);
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
