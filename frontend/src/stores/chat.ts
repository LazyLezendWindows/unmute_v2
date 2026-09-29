import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';
import { getSocket, onReconnect } from '../services/socket';
import { useToastStore } from './toast';
import { useNotificationStore } from './notifications';
import { Conversation, Match, Message } from '../types';

export const useChatStore = defineStore('chat', () => {
  const conversations = ref<Conversation[]>([]);
  const matches = ref<Match[]>([]);
  const likedProfiles = ref<any[]>([]);
  const likedLoading = ref(false);
  /** People who liked you and are waiting for your answer. */
  const likesReceived = ref<any[]>([]);
  const activeConversationId = ref<string | null>(null);
  const activeMessages = ref<Message[]>([]);
  const activeOtherUser = ref<any | null>(null);
  const loading = ref(false);
  const sending = ref(false);
  // Only the first load shows placeholders; later refreshes keep the current list on screen.
  const matchesLoading = ref(false);
  const conversationsLoading = ref(false);

  const totalUnreadCount = computed(() =>
    conversations.value.reduce((acc, conv) => acc + (conv.unreadCount || 0), 0)
  );

  /** Loads both likes lists: who you liked, and who liked you. */
  async function loadLikedProfiles() {
    likedLoading.value = true;
    try {
      const [sent, received] = await Promise.all([api.get('/interactions/liked'), api.get('/interactions/likes-received')]);
      likedProfiles.value = sent.data.data;
      likesReceived.value = received.data.data;
    } catch (err: any) {
      useToastStore().error(`Couldn't load liked profiles. ${err.message}`);
    } finally {
      likedLoading.value = false;
    }
  }

  async function loadMatches() {
    matchesLoading.value = true;
    try {
      const res = await api.get('/matches');
      matches.value = res.data.data;
    } catch (err: any) {
      useToastStore().error(`Couldn't load your matches. ${err.message}`);
    } finally {
      matchesLoading.value = false;
    }
  }

  async function loadConversations() {
    conversationsLoading.value = true;
    try {
      const res = await api.get('/conversations');
      conversations.value = res.data.data;
    } catch (err: any) {
      useToastStore().error(`Couldn't load your conversations. ${err.message}`);
    } finally {
      conversationsLoading.value = false;
    }
  }

  async function openConversation(conversationId: string) {
    activeConversationId.value = conversationId;
    loading.value = true;
    try {
      const res = await api.get(`/conversations/${conversationId}/messages`);
      activeMessages.value = res.data.data.messages;
      activeOtherUser.value = res.data.data.otherUser;

      // Join socket conversation room
      const socket = getSocket();
      if (socket) {
        socket.emit('join_conversation', conversationId);
      }

      useNotificationStore().conversationOpened(conversationId);

      // Decrement unread count locally
      const conv = conversations.value.find((c) => c.id === conversationId);
      if (conv) {
        conv.unreadCount = 0;
      }
    } catch (err: any) {
      activeConversationId.value = null;
      throw err;
    } finally {
      loading.value = false;
    }
  }

  function leaveCurrentConversation() {
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
  async function sendMessage(content: string, kind: 'text' | 'image' | 'voice' = 'text') {
    if (!activeConversationId.value || !content.trim()) return;
    sending.value = true;
    try {
      const res = await api.post(`/conversations/${activeConversationId.value}/messages`, {
        content: content.trim(),
        ...(kind !== 'text' ? { kind } : {}),
      });
      // Append sent message if not already added by socket
      const msg = res.data.data;
      if (!activeMessages.value.some((m) => m.id === msg.id)) {
        activeMessages.value.push(msg);
      }
      // Update conversations list preview
      const conv = conversations.value.find((c) => c.id === activeConversationId.value);
      if (conv) {
        conv.lastMessage = msg;
        conv.lastMessageAt = msg.createdAt;
      }
      return msg;
    } finally {
      sending.value = false;
    }
  }

  /** The server forgets conversation rooms when a socket drops; rejoin and catch up on anything missed. */
  function resync() {
    const socket = getSocket();
    if (activeConversationId.value && socket) {
      socket.emit('join_conversation', activeConversationId.value);
      api
        .get(`/conversations/${activeConversationId.value}/messages`, { silent: true })
        .then((res) => {
          if (res.data.data.conversationId === activeConversationId.value) activeMessages.value = res.data.data.messages;
        })
        .catch(() => undefined);
    }
    loadConversations();
    loadMatches();
  }

  function initSocketHandlers() {
    const socket = getSocket();
    if (!socket) return;
    onReconnect(resync);

    // Listen for new messages
    socket.off('new_message');
    socket.on('new_message', (message: Message) => {
      if (activeConversationId.value === message.conversationId) {
        if (!activeMessages.value.some((m) => m.id === message.id)) {
          activeMessages.value.push(message);
        }
      }
      // Update conversation preview in-place; fall back to a full reload only if not found.
      const conv = conversations.value.find((c) => c.id === message.conversationId);
      if (conv) {
        conv.lastMessage = message;
        conv.lastMessageAt = message.createdAt;
        if (activeConversationId.value !== message.conversationId) {
          conv.unreadCount = (conv.unreadCount || 0) + 1;
        }
        // Move to top
        conversations.value = [conv, ...conversations.value.filter((c) => c.id !== message.conversationId)];
      } else {
        loadConversations();
      }
    });

    // Listen for messages read receipt
    socket.off('messages_read');
    socket.on('messages_read', ({ conversationId }: { conversationId: string }) => {
      if (activeConversationId.value === conversationId) {
        activeMessages.value.forEach((m) => {
          m.status = 'read';
        });
      }
    });

    // Listen for new matches
    socket.off('new_match');
    socket.on('new_match', () => {
      loadMatches();
      loadConversations();
    });
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
  };
});
