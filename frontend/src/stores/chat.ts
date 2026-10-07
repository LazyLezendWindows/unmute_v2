import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';
import { getSocket, onReconnect } from '../services/socket';
import { useToastStore } from './toast';
import { useNotificationStore } from './notifications';
import { useAuthStore } from './auth';
import { Conversation, Match, Message } from '../types';

type LikedProfile = Omit<Match['user'], 'distanceKm'> & {
  distanceKm?: number | null;
  likedAt: string;
  superLike: boolean;
};

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([]);
  const matches = ref<Match[]>([]);
  const likedProfiles = ref<LikedProfile[]>([]);
  const likedLoading = ref(false);
  /** People who liked you and are waiting for your answer. */
  const likesReceived = ref<LikedProfile[]>([]);
  const activeConversationId = ref<string | null>(null);
  const activeMessages = ref<Message[]>([]);
  const activeOtherUser = ref<any | null>(null);
  const loading = ref(false);
  const sending = ref(false);
  // Only the first load shows placeholders; later refreshes keep the current list on screen.
  const matchesLoading = ref(false);
  const conversationsLoading = ref(false);
  let generation = 0;
  let conversationRequest = 0;
  const receivedMessages = new Set<string>();

  const totalUnreadCount = computed(() =>
    conversations.value.reduce((acc, conv) => acc + (conv.unreadCount || 0), 0)
  );

  /** Loads both likes lists: who you liked, and who liked you. */
  async function loadLikedProfiles() {
    const attempt = generation;
    likedLoading.value = true;
    try {
      const [sent, received] = await Promise.all([api.get('/interactions/liked'), api.get('/interactions/likes-received')]);
      if (attempt !== generation) return;
      likedProfiles.value = sent.data.data;
      likesReceived.value = received.data.data;
    } catch (err: any) {
      if (attempt === generation) useToastStore().error(`Couldn't load liked profiles. ${err.message}`);
    } finally {
      if (attempt === generation) likedLoading.value = false;
    }
  }

  async function loadMatches() {
    const attempt = generation;
    matchesLoading.value = true;
    try {
      const res = await api.get('/matches');
      if (attempt === generation) matches.value = res.data.data;
    } catch (err: any) {
      if (attempt === generation) useToastStore().error(`Couldn't load your matches. ${err.message}`);
    } finally {
      if (attempt === generation) matchesLoading.value = false;
    }
  }

  async function loadConversations() {
    const attempt = generation;
    conversationsLoading.value = true;
    try {
      const res = await api.get('/conversations');
      if (attempt === generation) conversations.value = res.data.data;
    } catch (err: any) {
      if (attempt === generation) useToastStore().error(`Couldn't load your conversations. ${err.message}`);
    } finally {
      if (attempt === generation) conversationsLoading.value = false;
    }
  }

  async function openConversation(conversationId: string) {
    leaveCurrentConversation();
    const request = ++conversationRequest;
    activeConversationId.value = conversationId;
    loading.value = true;
    try {
      const res = await api.get(`/conversations/${conversationId}/messages`);
      if (request !== conversationRequest) return;
      mergeMessages(res.data.data.messages);
      activeOtherUser.value = res.data.data.otherUser;

      // Join socket conversation room
      const socket = getSocket();
      if (socket) {
        socket.emit('join_conversation', conversationId);
      }

      useNotificationStore().conversationOpened(conversationId);
      // A message may have arrived while the history request was in flight.
      socket?.emit('read_conversation', conversationId);

      // Decrement unread count locally
      const conv = conversations.value.find((c) => c.id === conversationId);
      if (conv) {
        conv.unreadCount = 0;
      }
    } catch (err: any) {
      if (request !== conversationRequest) return;
      leaveCurrentConversation();
      throw err;
    } finally {
      if (request === conversationRequest) loading.value = false;
    }
  }

  function leaveCurrentConversation() {
    conversationRequest++;
    loading.value = false;
    if (activeConversationId.value) {
      const socket = getSocket();
      if (socket) {
        socket.emit('leave_conversation', activeConversationId.value);
      }
      activeConversationId.value = null;
      activeMessages.value = [];
      activeOtherUser.value = null;
    }
  }

  /** A text message, or (`kind` image / voice) the URL of a photo or recording just uploaded. */
  async function sendMessage(content: string, kind: 'text' | 'image' | 'voice' = 'text', conversationId = activeConversationId.value) {
    if (!conversationId || !content.trim()) return;
    const attempt = generation;
    sending.value = true;
    try {
      const res = await api.post(`/conversations/${conversationId}/messages`, {
        content: content.trim(),
        ...(kind !== 'text' ? { kind } : {}),
      });
      // Append sent message if not already added by socket
      const msg = res.data.data;
      if (attempt !== generation) return;
      if (activeConversationId.value === conversationId && !activeMessages.value.some((m) => m.id === msg.id)) {
        activeMessages.value.push(msg);
      }
      // Update conversations list preview
      const conv = conversations.value.find((c) => c.id === conversationId);
      if (conv) {
        conv.lastMessage = msg;
        conv.lastMessageAt = msg.createdAt;
      }
      return msg;
    } finally {
      if (attempt === generation) sending.value = false;
    }
  }

  /** The server forgets conversation rooms when a socket drops; rejoin and catch up on anything missed. */
  function resync() {
    const socket = getSocket();
    const request = conversationRequest;
    if (activeConversationId.value && socket) {
      socket.emit('join_conversation', activeConversationId.value);
      api
        .get(`/conversations/${activeConversationId.value}/messages`, { silent: true })
        .then((res) => {
          if (request === conversationRequest && res.data.data.conversationId === activeConversationId.value) {
            mergeMessages(res.data.data.messages);
            socket.emit('read_conversation', activeConversationId.value);
          }
        })
        .catch(() => undefined);
    }
    loadConversations();
    loadMatches();
  }

  function mergeMessages(messages: Message[]) {
    const ids = new Set(messages.map((message) => message.id));
    activeMessages.value = [...messages, ...activeMessages.value.filter((message) => !ids.has(message.id))]
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  }

  function receiveMessage(message: Message) {
    // An open chat receives both the room event and the user's notification event.
    if (receivedMessages.has(message.id)) return;
    receivedMessages.add(message.id);
    if (receivedMessages.size > 1000) receivedMessages.delete(receivedMessages.values().next().value!);
    const isActive = activeConversationId.value === message.conversationId;
    const isMine = message.senderId === useAuthStore().user?.id;
    if (isActive) {
      if (!activeMessages.value.some((m) => m.id === message.id)) activeMessages.value.push(message);
      if (!isMine && !loading.value) getSocket()?.emit('read_conversation', message.conversationId);
    }
    const conv = conversations.value.find((c) => c.id === message.conversationId);
    if (!conv) {
      void loadConversations();
      return;
    }
    conv.lastMessage = message;
    conv.lastMessageAt = message.createdAt;
    if (!isActive && !isMine) conv.unreadCount = (conv.unreadCount || 0) + 1;
    conversations.value = [conv, ...conversations.value.filter((c) => c.id !== message.conversationId)];
  }

  function initSocketHandlers() {
    const socket = getSocket();
    if (!socket) return;
    onReconnect(resync);

    // Listen for new messages
    socket.off('new_message');
    socket.on('new_message', receiveMessage);
    socket.off('message_notification');
    socket.on('message_notification', ({ message }: { message: Message }) => receiveMessage(message));

    // Listen for messages read receipt
    socket.off('messages_read');
    socket.on('messages_read', ({ conversationId, readerId }: { conversationId: string; readerId: string }) => {
      if (activeConversationId.value === conversationId) {
        activeMessages.value.forEach((m) => {
          if (m.senderId !== readerId) m.status = 'read';
        });
      }
      const conv = conversations.value.find((c) => c.id === conversationId);
      if (conv?.lastMessage && conv.lastMessage.senderId !== readerId) conv.lastMessage.status = 'read';
      if (conv && readerId === useAuthStore().user?.id) conv.unreadCount = 0;
    });

    // Listen for new matches
    socket.off('new_match');
    socket.on('new_match', () => {
      loadMatches();
      loadConversations();
    });
  }

  function reset() {
    generation++;
    leaveCurrentConversation();
    conversations.value = [];
    matches.value = [];
    likedProfiles.value = [];
    likesReceived.value = [];
    likedLoading.value = false;
    matchesLoading.value = false;
    conversationsLoading.value = false;
    sending.value = false;
    receivedMessages.clear();
  }

  return {
    conversations,
    matches,
    activeConversationId,
    activeMessages,
    activeOtherUser,
    loading,
    matchesLoading,
    conversationsLoading,
    sending,
    totalUnreadCount,
    likedProfiles,
    likedLoading,
    likesReceived,
    loadLikedProfiles,
    loadMatches,
    loadConversations,
    openConversation,
    leaveCurrentConversation,
    sendMessage,
    initSocketHandlers,
    reset,
  };
});
