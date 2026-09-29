import { ref } from 'vue';

/**
 * Whether Unmute can reach its server. The browser's own online flag misses "connected to Wi-Fi
 * but no internet", so failed requests (no response, or timed out) also count as offline, and any
 * answer from the server counts as back online.
 */
export const serverUnreachable = ref(false);

/** True once the app had loaded while online; if not, recovering reloads it to finish starting up. */
let startedOk = false;

export function markReachable(): void {
  serverUnreachable.value = false;
  startedOk = true;
}

export function markUnreachable(): void {
  serverUnreachable.value = true;
}

export function appStartedOk(): boolean {
  return startedOk;
}
