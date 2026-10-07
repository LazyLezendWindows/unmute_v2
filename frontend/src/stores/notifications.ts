import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '../services/api';
import { getSocket, onReconnect } from '../services/socket';
import { useChatStore } from './chat';
import { useToastStore } from './toast';
import { AppNotification } from '../types';

const PAGE_SIZE = 30;

/** The activity feed: likes received, new matches and messages, with a live unread count. */
export const useNotificationStore = defineStore('notifications', () => {
  const items = ref<AppNotification[]>([]);
  const unreadCount = ref(0);
  const loading = ref(false);
  const loaded = ref(false);
  const hasMore = ref(false);
  let generation = 0;

  async function load() {
    const attempt = generation;
    loading.value = true;
    try {
      const res = await api.get('/notifications', { params: { limit: PAGE_SIZE } });
      if (attempt !== generation) return;
      items.value = res.data.data.items;
      unreadCount.value = res.data.data.unreadCount;
      hasMore.value = items.value.length === PAGE_SIZE;
      loaded.value = true;
    } catch (err: any) {
      if (attempt === generation) useToastStore().error(`Couldn't load your notifications. ${err.message}`);
    } finally {
      if (attempt === generation) loading.value = false;
    }
  }

  async function loadMore() {
    if (loading.value || !hasMore.value) return;
    const attempt = generation;
    loading.value = true;
    try {
      const res = await api.get('/notifications', { params: { limit: PAGE_SIZE, offset: items.value.length } });
      if (attempt !== generation) return;
      const page: AppNotification[] = res.data.data.items;
      items.value = [...items.value, ...page.filter((n) => !items.value.some((i) => i.id === n.id))];
      unreadCount.value = res.data.data.unreadCount;
      hasMore.value = page.length === PAGE_SIZE;
    } catch (err: any) {
      if (attempt === generation) useToastStore().error(`Couldn't load more notifications. ${err.message}`);
    } finally {
      if (attempt === generation) loading.value = false;
    }
  }

  /** Just the badge, for screens that don't show the feed. */
  async function refreshCount() {
    const attempt = generation;
    try {
      const res = await api.get('/notifications/unread-count', { silent: true });
      if (attempt === generation) unreadCount.value = res.data.data.unreadCount;
    } catch {
      // The badge keeps its last value.
    }
  }

  async function markRead(notification: AppNotification) {
    if (notification.read) return;
    const attempt = generation;
    notification.read = true;
    unreadCount.value = Math.max(0, unreadCount.value - 1);
    try {
      const res = await api.post(`/notifications/${notification.id}/read`, null, { silent: true });
      if (attempt === generation) unreadCount.value = res.data.data.unreadCount;
    } catch {
      // Stays read on screen; the server catches up on the next load.
    }
  }

  async function markAllRead() {
    const attempt = generation;
    const previous = new Map(items.value.map((n) => [n.id, n.read]));
    items.value.forEach((n) => (n.read = true));
    const before = unreadCount.value;
    unreadCount.value = 0;
    try {
      await api.post('/notifications/read-all');
    } catch (err: any) {
      if (attempt !== generation) return;
      items.value.forEach((n) => { if (previous.has(n.id)) n.read = previous.get(n.id)!; });
      unreadCount.value = Math.max(before, unreadCount.value);
      void refreshCount();
      useToastStore().error(err.message);
    }
  }

  async function remove(notification: AppNotification) {
    const attempt = generation;
    const index = items.value.indexOf(notification);
    items.value = items.value.filter((n) => n.id !== notification.id);
    try {
      const res = await api.delete(`/notifications/${notification.id}`, { silent: true });
      if (attempt === generation) unreadCount.value = res.data.data.unreadCount;
    } catch (err: any) {
      if (attempt !== generation) return;
      if (!items.value.some((n) => n.id === notification.id)) items.value.splice(Math.max(0, index), 0, notification);
      useToastStore().error(err.message);
    }
  }

  /** Opening a conversation reads its message entry on the server; mirror that here. */
  function conversationOpened(conversationId: string) {
    for (const n of items.value) {
      if (n.type === 'message' && n.conversationId === conversationId && !n.read) {
        n.read = true;
        unreadCount.value = Math.max(0, unreadCount.value - 1);
      }
    }
  }

  function onNotification({ notification, unreadCount: count }: { notification: AppNotification; unreadCount: number }) {
    // A message entry is updated in place on the server, so it moves to the top here.
    items.value = [notification, ...items.value.filter((n) => n.id !== notification.id)];
    unreadCount.value = count;

    if (notification.read) return;
    // Already looking at that chat: nothing to announce.
    if (notification.type === 'message' && useChatStore().activeConversationId === notification.conversationId) {
      markRead(notification);
      return;
    }
    if (window.location.pathname !== '/notifications') {
      useToastStore().info(announcement(notification));
    }
  }

  /** Listens on the current socket; safe to call again after a reconnect or re-login. */
  function bindSocket() {
    const socket = getSocket();
    if (!socket) return;
    socket.off('notification', onNotification);
    socket.on('notification', onNotification);
    onReconnect(catchUp);
  }

  /** Anything sent while the socket was down is only in the database; fetch it. */
  function catchUp() {
    if (loaded.value) load();
    else refreshCount();
  }

  function reset() {
    generation++;
    items.value = [];
    unreadCount.value = 0;
    loaded.value = false;
    hasMore.value = false;
    loading.value = false;
  }

  return {
    items,
    unreadCount,
    loading,
    loaded,
    hasMore,
    load,
    loadMore,
    refreshCount,
    markRead,
    markAllRead,
    remove,
    conversationOpened,
    bindSocket,
    reset,
  };
});

/** One line describing a notification, shared by the feed and the in-app toast. */
export function describeNotification(n: AppNotification): string {
  const name = n.actor?.displayName ?? 'Someone';
  switch (n.type) {
    case 'like':
      return 'Someone new likes you. Keep swiping to find out who.';
    case 'match':
      return `It's a match! You and ${name} liked each other.`;
    case 'message':
      return n.count > 1 ? `${name} sent you ${n.count} messages` : `${name} sent you a message`;
    case 'plan':
      return n.preview ?? 'Your plan is ending. Renew to continue.';
  }
}

function announcement(n: AppNotification): string {
  if (n.type === 'message' && n.preview) return `${n.actor?.displayName ?? 'New message'}: ${n.preview}`;
  return describeNotification(n);
}
