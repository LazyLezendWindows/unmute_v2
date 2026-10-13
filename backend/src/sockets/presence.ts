/**
 * Online presence tracking:
 * - Defined as an authenticated heartbeat received within the previous 90 seconds (90,000 ms).
 * - Tracks unique users, regardless of open tabs, devices, or reconnections.
 * - Stored in-memory with automatic cleanup of stale presence records.
 */

export const HEARTBEAT_WINDOW_MS = 90_000; // 90 seconds

interface PresenceEntry {
  lastHeartbeat: number;
  openConnections: number;
}

const userPresence = new Map<string, PresenceEntry>();

/**
 * Record an authenticated heartbeat for a user (via socket or REST).
 */
export function recordHeartbeat(userId: string): void {
  if (!userId) return;
  const now = Date.now();
  const existing = userPresence.get(userId);
  if (existing) {
    existing.lastHeartbeat = now;
  } else {
    userPresence.set(userId, { lastHeartbeat: now, openConnections: 1 });
  }
}

/**
 * Track an opened socket connection for a user.
 */
export function markConnected(userId: string): void {
  if (!userId) return;
  const now = Date.now();
  const existing = userPresence.get(userId);
  if (existing) {
    existing.lastHeartbeat = now;
    existing.openConnections += 1;
  } else {
    userPresence.set(userId, { lastHeartbeat: now, openConnections: 1 });
  }
}

/**
 * Track a closed socket connection for a user.
 */
export function markDisconnected(userId: string): void {
  if (!userId) return;
  const existing = userPresence.get(userId);
  if (existing) {
    existing.openConnections = Math.max(0, existing.openConnections - 1);
    if (existing.openConnections === 0) {
      existing.lastHeartbeat = 0;
    }
  }
}

/**
 * Check if a user is online (heartbeat within previous 90 seconds).
 */
export function isOnline(userId: string): boolean {
  const existing = userPresence.get(userId);
  if (!existing) return false;
  return Date.now() - existing.lastHeartbeat <= HEARTBEAT_WINDOW_MS;
}

/**
 * Count unique users currently online (heartbeat within 90s).
 */
export function getOnlineUserCount(): number {
  const now = Date.now();
  let count = 0;
  for (const [, entry] of userPresence) {
    if (now - entry.lastHeartbeat <= HEARTBEAT_WINDOW_MS) {
      count++;
    }
  }
  return count;
}

/**
 * Get all online user IDs.
 */
export function getOnlineUserIds(): string[] {
  const now = Date.now();
  const ids: string[] = [];
  for (const [userId, entry] of userPresence) {
    if (now - entry.lastHeartbeat <= HEARTBEAT_WINDOW_MS) {
      ids.push(userId);
    }
  }
  return ids;
}

// Periodically clean up stale entries older than 10 minutes to prevent memory leaks
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [userId, entry] of userPresence) {
    if (entry.openConnections <= 0 && entry.lastHeartbeat < cutoff) {
      userPresence.delete(userId);
    }
  }
}, 5 * 60 * 1000).unref();
