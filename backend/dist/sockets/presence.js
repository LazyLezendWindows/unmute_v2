"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.markConnected = markConnected;
exports.markDisconnected = markDisconnected;
exports.isOnline = isOnline;
/**
 * Who has the app open right now: a count of live sockets per user, so a second tab closing
 * doesn't mark someone offline. In-memory, so it covers this server process only.
 */
const openSockets = new Map();
function markConnected(userId) {
    openSockets.set(userId, (openSockets.get(userId) ?? 0) + 1);
}
function markDisconnected(userId) {
    const remaining = (openSockets.get(userId) ?? 1) - 1;
    if (remaining > 0)
        openSockets.set(userId, remaining);
    else
        openSockets.delete(userId);
}
function isOnline(userId) {
    return openSockets.has(userId);
}
