import { ref } from 'vue';
import { api } from './api';

/**
 * Alerts while Unmute is closed (a call ringing, a missed call, a new message), through the
 * browser's push service. Needs https (or localhost) and, on iPhone, the app added to the Home Screen.
 */
export const pushState = ref<'unsupported' | 'default' | 'granted' | 'denied'>(currentState());

function currentState() {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
}

async function register(): Promise<boolean> {
  const key: string | null = (await api.get('/notifications/push-key')).data.data.publicKey;
  if (!key) return false;
  const registration = await navigator.serviceWorker.ready;
  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(key) });
  }
  await api.post('/notifications/push-subscriptions', subscription.toJSON());
  return true;
}

/** Asks for permission (call from a tap) and turns alerts on; resolves with whether they're on. */
export async function enablePush(): Promise<boolean> {
  if (pushState.value === 'unsupported') return false;
  const permission = await Notification.requestPermission();
  pushState.value = permission;
  if (permission !== 'granted') return false;
  try {
    const enabled = await register();
    if (enabled) { try { localStorage.removeItem('unmute.push.disabled'); } catch { /* Optional persistence. */ } }
    return enabled;
  } catch {
    return false;
  }
}

/** On app start: keeps this device registered to whoever is signed in, if alerts were allowed before. */
export async function syncPush(): Promise<void> {
  pushState.value = currentState();
  if (pushState.value !== 'granted') return;
  try { if (localStorage.getItem('unmute.push.disabled') === 'true') return; } catch { /* Storage can be unavailable. */ }
  await register().catch(() => undefined);
}

/** Turns alerts off for this device (the browser permission itself stays as it is). */
export async function disablePush(): Promise<void> {
  try { localStorage.setItem('unmute.push.disabled', 'true'); } catch { /* Optional persistence. */ }
  await unregisterPush();
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);
  await (await registration?.pushManager.getSubscription())?.unsubscribe().catch(() => undefined);
}

/** Whether this device is currently subscribed. */
export async function pushSubscribed(): Promise<boolean> {
  if (pushState.value !== 'granted') return false;
  const registration = await navigator.serviceWorker.getRegistration().catch(() => undefined);
  return Boolean(await registration?.pushManager.getSubscription());
}

/** Before signing out, so the next person on this device doesn't get your calls. */
export async function unregisterPush(): Promise<void> {
  if (pushState.value === 'unsupported') return;
  try {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager.getSubscription();
    if (subscription) await api.delete('/notifications/push-subscriptions', { data: { endpoint: subscription.endpoint } });
  } catch {
    // Signing out still goes ahead.
  }
}
