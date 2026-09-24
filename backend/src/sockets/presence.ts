/**
 * Who has the app open right now: a count of live sockets per user, so a second tab closing
 * doesn't mark someone offline. In-memory, so it covers this server process only.
 */
const openSockets = new Map<string, number>();

export function markConnected(userId: string): void {
  openSockets.set(userId, (openSockets.get(userId) ?? 0) + 1);
}

export function markDisconnected(userId: string): void {
  const remaining = (openSockets.get(userId) ?? 1) - 1;
  if (remaining > 0) openSockets.set(userId, remaining);
  else openSockets.delete(userId);
}

export function isOnline(userId: string): boolean {
  return openSockets.has(userId);
}
