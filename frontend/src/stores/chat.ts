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
  /** Conversations where the other person is typing right now (cleared after a few seconds). */
  const typingIn = ref<Record<string, boolean>>({});
  const typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let lastTypingSent = 0;
  /** Set when a match ends (either side unmatched), so an open chat can close itself. */
  const removedConversationId = ref<string | null>(null);
  /** Matches this member just unmatched: their own socket echo shouldn't read as "the other person left". */
  const removedByMe = new Set<string>();

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
      if (attempt === generation && err.status !== 402) useToastStore().error(`Couldn't load liked profiles. ${err.message}`);
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
      if (attempt === generation && err.status !== 402) useToastStore().error(`Couldn't load your matches. ${err.message}`);
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
      if (attempt === generation && err.status !== 402) useToastStore().error(`Couldn't load your conversations. ${err.message}`);
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
  async function sendMessage(
    content: string,
    kind: 'text' | 'image' | 'voice' | 'gif' = 'text',
    conversationId = activeConversationId.value,
    replyToId?: string | null
  ) {
    if (!conversationId || !content.trim()) return;
    const attempt = generation;
    sending.value = true;
    lastTypingSent = 0;
    getSocket()?.emit('typing', conversationId, false);
    try {
      const res = await api.post(`/conversations/${conversationId}/messages`, {
        content: content.trim(),
        ...(kind !== 'text' ? { kind } : {}),
        ...(replyToId ? { replyToId } : {}),
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

  /** Tells the other person you're typing; sent at most every 3 seconds while keys are pressed. */
  function notifyTyping(conversationId = activeConversationId.value) {
    if (!conversationId) return;
    const now = Date.now();
    if (now - lastTypingSent < 3000) return;
    lastTypingSent = now;
    getSocket()?.emit('typing', conversationId, true);
  }

  function applyReactions(messageId: string, reactions: Message['reactions']) {
    const message = activeMessages.value.find((m) => m.id === messageId);
    if (message) message.reactions = reactions ?? [];
  }

  function applyDeleted(conversationId: string, messageId: string) {
    for (const m of activeMessages.value) {
      if (m.id === messageId) {
        m.deleted = true;
        m.content = '';
        m.reactions = [];
      } else if (m.replyTo?.id === messageId) {
        m.replyTo = { ...m.replyTo, deleted: true, content: '' };
      }
    }
    const conv = conversations.value.find((c) => c.id === conversationId);
    if (conv?.lastMessage?.id === messageId) conv.lastMessage = { ...conv.lastMessage, deleted: true, content: '' };
  }

  /** Your reaction to a message; the same emoji again (or null) removes it. */
  async function react(messageId: string, emoji: string | null) {
    const conversationId = activeConversationId.value;
    if (!conversationId) return;
    const mine = useAuthStore().user?.id;
    const current = activeMessages.value.find((m) => m.id === messageId)?.reactions?.find((r) => r.userId === mine)?.emoji ?? null;
    const next = emoji === current ? null : emoji;
    const res = await api.put(`/conversations/${conversationId}/messages/${messageId}/reaction`, { emoji: next });
    if (activeConversationId.value === conversationId) applyReactions(messageId, res.data.data.reactions);
  }

  /** Unsends your own message for both of you. */
  async function deleteMessage(messageId: string) {
    const conversationId = activeConversationId.value;
    if (!conversationId) return;
    await api.delete(`/conversations/${conversationId}/messages/${messageId}`);
    applyDeleted(conversationId, messageId);
  }

  /** `byOther`: the other person unmatched, so an open chat with them should close itself. */
  function dropMatch(matchId: string, conversationId: string | null, byOther = false) {
    matches.value = matches.value.filter((m) => m.matchId !== matchId);
    if (conversationId) {
      conversations.value = conversations.value.filter((c) => c.id !== conversationId);
      if (byOther && activeConversationId.value === conversationId) removedConversationId.value = conversationId;
    }
  }

  /** Ends the match for both of you: the chat is removed and you won't see each other again. */
  async function unmatch(matchId: string) {
    const conversationId = matches.value.find((m) => m.matchId === matchId)?.conversationId ?? conversations.value.find((c) => c.matchId === matchId)?.id ?? null;
    removedByMe.add(matchId);
    await api.delete(`/matches/${matchId}`);
    dropMatch(matchId, conversationId);
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

    socket.off('typing');
    socket.on('typing', ({ conversationId, isTyping }: { conversationId: string; userId: string; isTyping: boolean }) => {
      clearTimeout(typingTimers.get(conversationId));
      typingIn.value = { ...typingIn.value, [conversationId]: isTyping };
      if (isTyping) {
        typingTimers.set(conversationId, setTimeout(() => { typingIn.value = { ...typingIn.value, [conversationId]: false }; }, 5000));
      }
    });
    socket.off('message_reaction');
    socket.on('message_reaction', ({ conversationId, messageId, reactions }: { conversationId: string; messageId: string; reactions: Message['reactions'] }) => {
      if (activeConversationId.value === conversationId) applyReactions(messageId, reactions);
    });
    socket.off('message_deleted');
    socket.on('message_deleted', ({ conversationId, messageId }: { conversationId: string; messageId: string }) => applyDeleted(conversationId, messageId));
    socket.off('match_removed');
    socket.on('match_removed', ({ matchId, conversationId }: { matchId: string; conversationId: string | null }) => {
      const mine = removedByMe.delete(matchId);
      dropMatch(matchId, conversationId, !mine);
    });

    // Listen for new matches
    socket.off('new_match');
    socket.on('new_match', (data?: { conversationId?: string; matchedUser?: { id: string; displayName: string; age: number; avatarUrl?: string | null } }) => {
      loadMatches();
      loadConversations();
      if (data?.matchedUser) {
        useToastStore().success(`It's a Match! You and ${data.matchedUser.displayName} liked each other! 🎉`);
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
          new Notification("It's a Match! 🎉", {
            body: `You and ${data.matchedUser.displayName} liked each other! Tap to chat.`,
            icon: data.matchedUser.avatarUrl || '/pwa-192x192.png',
            tag: `match-${data.conversationId || 'new'}`,
          });
        }
      }
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
    typingTimers.forEach((t) => clearTimeout(t));
    typingTimers.clear();
    typingIn.value = {};
    removedConversationId.value = null;
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
    notifyTyping,
    typingIn,
    react,
    deleteMessage,
    unmatch,
    removedConversationId,
    initSocketHandlers,
    reset,
  };
});
