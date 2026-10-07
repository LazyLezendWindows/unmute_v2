<template>
  <div class="chat-page" :class="{ 'in-thread': activeConversationId }">
    <!-- Conversation list -->
    <section class="chat-list" :class="{ 'd-none d-lg-flex': activeConversationId }" aria-label="Conversations">
      <ScreenBar back>
        <template #actions>
          <button type="button" class="round-btn" aria-label="Chat settings" @click="$router.push('/settings')">
            <i class="ri-more-fill" aria-hidden="true"></i>
          </button>
        </template>
      </ScreenBar>

      <h1 class="list-title">Messages</h1>
      <p class="list-sub">Your conversations</p>

      <AlertsPrompt />

      <label class="list-search">
        <i class="ri-search-line" aria-hidden="true"></i>
        <input v-model="search" type="search" placeholder="Search messages..." aria-label="Search messages" />
      </label>

      <div class="pill-tabs" role="group" aria-label="Conversation views">
        <button
          v-for="tab in listTabs"
          :key="tab.value"
          type="button"
          :aria-pressed="listView === tab.value"
          @click="listView = tab.value"
        >
          {{ tab.label }}<span v-if="tab.count" class="tab-count">{{ tab.count }}</span>
        </button>
      </div>

      <div class="conv-scroll">
        <div v-if="chatStore.conversationsLoading && chatStore.conversations.length === 0" class="d-flex flex-column gap-2" aria-busy="true">
          <USkeleton v-for="n in 4" :key="n" type="card" height="5.2rem" class="conv-skeleton" />
        </div>
        <p v-else-if="chatStore.conversations.length === 0" class="list-empty">
          No conversations yet. Match with someone to start talking!
        </p>
        <p v-else-if="visibleConversations.length === 0" class="list-empty">
          {{ search.trim() ? `No conversations match "${search}".` : emptyViewText }}
        </p>

        <button
          v-for="conv in visibleConversations"
          :key="conv.id"
          type="button"
          class="conv-card"
          :class="{ 'is-active': activeConversationId === conv.id }"
          @click="selectConversation(conv.id)"
        >
          <span class="conv-avatar">
            <UAvatar :src="conv.otherUser.avatarUrl" :name="conv.otherUser.displayName" size="lg" />
            <span class="presence" :class="{ 'is-online': conv.otherUser.isOnline }" :aria-label="conv.otherUser.isOnline ? 'Online' : 'Offline'"></span>
          </span>
          <span class="conv-body">
            <span class="conv-name">
              {{ conv.otherUser.displayName }}
              <i v-if="conv.otherUser.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i><PremiumBadge v-if="conv.otherUser.isPremium" :plan="conv.otherUser.premiumPlan" />
            </span>
            <span class="conv-preview">
              <template v-if="conv.lastMessage">
                <template v-if="conv.lastMessage.kind === 'call'"><i :class="conv.lastMessage.call?.mode === 'video' ? 'ri-vidicon-line' : 'ri-phone-line'" aria-hidden="true"></i> {{ callLabel(conv.lastMessage) }}</template>
                <template v-else-if="conv.lastMessage.deleted"><i class="ri-forbid-line" aria-hidden="true"></i> Message deleted</template>
                <template v-else><template v-if="conv.lastMessage.senderId === authStore.user?.id">You: </template>{{ conv.lastMessage.kind === 'image' ? '📷 Photo' : conv.lastMessage.kind === 'voice' ? '🎤 Voice message' : conv.lastMessage.kind === 'gif' ? 'GIF' : conv.lastMessage.content }}</template>
              </template>
              <template v-else>New match · say hello 👋</template>
            </span>
          </span>
          <span class="conv-meta">
            <span v-if="conv.lastMessageAt" class="conv-time" :class="{ 'is-unread': conv.unreadCount > 0 }">{{ formatListTime(conv.lastMessageAt) }}</span>
            <span v-if="conv.unreadCount > 0" class="unread-count" :aria-label="`${conv.unreadCount} unread`">{{ conv.unreadCount }}</span>
          </span>
        </button>
      </div>
    </section>

    <!-- Open conversation -->
    <section v-if="activeConversationId" class="thread" aria-label="Conversation">
      <ScreenBar back="/chat">
        <template #actions>
          <button type="button" class="round-btn" aria-label="Report or block" @click="isSafetyOpen = true">
            <i class="ri-more-fill" aria-hidden="true"></i>
          </button>
        </template>
      </ScreenBar>

      <header v-if="activeOtherUser" class="thread-head">
        <router-link :to="`/people/${activeOtherUser.id}`" class="thread-avatar" :aria-label="`View ${activeOtherUser.displayName}'s profile`">
          <UAvatar :src="activeOtherUser.avatarUrl" :name="activeOtherUser.displayName" size="xl" />
          <span class="presence" :class="{ 'is-online': activeOtherUser.isOnline }"></span>
        </router-link>
        <div class="min-w-0 flex-grow-1">
          <h2 class="thread-name">
            <span class="thread-name-text">{{ activeOtherUser.displayName }}, {{ activeOtherUser.age }}</span>
            <i v-if="activeOtherUser.isVerified" class="ri-verified-badge-fill verified-badge" aria-label="Verified"></i><PremiumBadge v-if="activeOtherUser.isPremium" :plan="activeOtherUser.premiumPlan" />
          </h2>
          <p class="thread-status">
            <template v-if="otherTyping"><span class="typing-dots" aria-hidden="true"><i></i><i></i><i></i></span>typing…</template>
            <template v-else>
              <span class="online-dot" :class="{ 'is-off': !activeOtherUser.isOnline }" aria-hidden="true"></span>
              {{ activeOtherUser.isOnline ? 'Online now' : 'Offline' }}
            </template>
          </p>
        </div>
        <router-link :to="`/chat/${activeConversationId}/call?mode=voice`" class="call-btn" aria-label="Voice call">
          <i class="ri-phone-fill" aria-hidden="true"></i>
        </router-link>
        <router-link :to="`/chat/${activeConversationId}/call?mode=video`" class="call-btn" aria-label="Video call">
          <i class="ri-vidicon-fill" aria-hidden="true"></i>
        </router-link>
      </header>

      <div ref="messagesContainer" class="messages">
        <div v-if="chatStore.loading" class="d-flex flex-column gap-3" aria-busy="true" aria-label="Loading conversation">
          <USkeleton type="text" width="55%" height="2.6rem" class="bubble-skeleton" />
          <USkeleton type="text" width="45%" height="2.6rem" class="bubble-skeleton align-self-end" />
        </div>

        <div v-else-if="chatStore.activeMessages.length === 0" class="thread-empty">
          <p class="mb-1">This is the beginning of your conversation with {{ activeOtherUser?.displayName }}.</p>
          <p class="mb-0">Not sure what to say? Tap an idea to start.</p>
          <div class="starters" role="group" aria-label="Conversation starters">
            <button v-for="idea in starters" :key="idea" type="button" class="starter" @click="useStarter(idea)">
              <i class="ri-lightbulb-flash-line" aria-hidden="true"></i>{{ idea }}
            </button>
          </div>
        </div>

        <template v-for="(msg, index) in chatStore.activeMessages" :key="msg.id">
          <div v-if="startsNewDay(index)" class="day-pill"><span>{{ formatDay(msg.createdAt) }}</span></div>
          <!-- A call: a centred line with a call-back button -->
          <div v-if="msg.kind === 'call' && msg.call" class="call-row">
            <router-link
              :to="`/chat/${activeConversationId}/call?mode=${msg.call.mode}`"
              class="call-pill"
              :class="{ 'is-missed': msg.call.outcome !== 'completed' }"
              :aria-label="`${callLabel(msg)}. Call back`"
            >
              <span class="call-icon" aria-hidden="true">
                <i :class="callIcon(msg)"></i>
              </span>
              <span class="call-text">
                <strong>{{ callLabel(msg) }}</strong>
                <span>{{ formatMessageTime(msg.createdAt) }}<template v-if="msg.call.outcome === 'completed'"> · {{ formatSeconds(msg.call.seconds) }}</template></span>
              </span>
              <i class="ri-phone-line call-back" aria-hidden="true"></i>
            </router-link>
          </div>
          <div v-else class="message-row" :class="{ 'is-mine': isMine(msg) }">
            <UAvatar v-if="!isMine(msg)" :src="activeOtherUser?.avatarUrl" :name="activeOtherUser?.displayName" size="md" class="message-avatar" />
            <div :id="`msg-${msg.id}`" class="message-col">
              <!-- The message this one answers -->
              <button v-if="msg.replyTo" type="button" class="reply-quote" @click="jumpTo(msg.replyTo.id)">
                <strong>{{ msg.replyTo.senderId === authStore.user?.id ? 'You' : activeOtherUser?.displayName }}</strong>
                <span>{{ quoteText(msg.replyTo) }}</span>
              </button>
              <div v-if="msg.deleted" class="bubble is-deleted"><i class="ri-forbid-line" aria-hidden="true"></i>This message was deleted</div>
              <div v-else-if="msg.kind === 'gif'" class="bubble is-photo is-gif">
                <img :src="msg.content" alt="GIF" loading="lazy" @load="nearBottomScroll" />
              </div>
              <a v-else-if="msg.kind === 'image'" :href="mediaUrl(msg.content)" target="_blank" rel="noopener" class="bubble is-photo" aria-label="Photo, open full size">
                <img :src="mediaUrl(msg.content)" alt="Photo" loading="lazy" @load="nearBottomScroll" />
              </a>
              <div v-else-if="msg.kind === 'voice'" class="bubble is-voice">
                <i class="ri-mic-fill" aria-hidden="true"></i>
                <audio :src="mediaUrl(msg.content)" controls preload="metadata" aria-label="Voice message"></audio>
              </div>
              <div v-else class="bubble">{{ msg.content }}</div>
              <!-- Reactions: one emoji per person; tap yours to remove it -->
              <div v-if="msg.reactions?.length" class="reactions">
                <button
                  v-for="group in groupReactions(msg)"
                  :key="group.emoji"
                  type="button"
                  class="reaction"
                  :class="{ 'is-mine': group.mine }"
                  :aria-label="`${group.emoji} ${group.count}${group.mine ? ', your reaction. Tap to remove' : ''}`"
                  @click="react(msg, group.emoji)"
                >{{ group.emoji }}<span v-if="group.count > 1">{{ group.count }}</span></button>
              </div>
              <div class="message-meta">
                <span>{{ formatMessageTime(msg.createdAt) }}</span>
                <i v-if="isMine(msg)" class="ri-check-double-line" :class="{ 'is-read': msg.status === 'read' }" :aria-label="msg.status === 'read' ? 'Read' : 'Sent'"></i>
                <button
                  v-if="!msg.deleted"
                  type="button"
                  class="msg-more"
                  :aria-expanded="menuFor === msg.id"
                  aria-label="Message options: react, reply or delete"
                  @click="menuFor = menuFor === msg.id ? null : msg.id"
                >
                  <i class="ri-more-fill" aria-hidden="true"></i>
                </button>
              </div>
              <div v-if="menuFor === msg.id" class="msg-menu" role="group" aria-label="Message options">
                <div class="msg-menu-emoji">
                  <button
                    v-for="emoji in REACTIONS"
                    :key="emoji"
                    type="button"
                    :aria-pressed="myReaction(msg) === emoji"
                    :aria-label="`React ${emoji}`"
                    @click="react(msg, emoji)"
                  >{{ emoji }}</button>
                </div>
                <div class="msg-menu-actions">
                  <button type="button" @click="startReply(msg)"><i class="ri-reply-line" aria-hidden="true"></i>Reply</button>
                  <button v-if="isMine(msg)" type="button" class="is-danger" @click="unsend(msg)"><i class="ri-delete-bin-6-line" aria-hidden="true"></i>Delete for everyone</button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div v-if="replyingTo" class="reply-bar" role="status">
        <i class="ri-reply-line" aria-hidden="true"></i>
        <span class="reply-bar-text">
          <strong>Replying to {{ replyingTo.senderId === authStore.user?.id ? 'yourself' : activeOtherUser?.displayName }}</strong>
          <span>{{ quoteText(replyingTo) }}</span>
        </span>
        <button type="button" aria-label="Cancel reply" @click="replyingTo = null"><i class="ri-close-line" aria-hidden="true"></i></button>
      </div>
      <GifPicker v-if="gifOpen" @pick="sendGif" @close="gifOpen = false" />
      <div v-if="emojiOpen" class="emoji-row" role="group" aria-label="Emoji">
        <button v-for="emoji in EMOJIS" :key="emoji" type="button" @click="addEmoji(emoji)">{{ emoji }}</button>
      </div>
      <p v-if="!voiceSupported" class="small px-3 u-text-muted" role="status">Voice messages are not available in this browser. You can still send text and photos.</p>
      <!-- Recording a voice message -->
      <div v-if="recording" class="composer is-recording" role="group" aria-label="Recording voice message">
        <button type="button" class="composer-round is-cancel" aria-label="Cancel recording" @click="stopRecording(false)">
          <i class="ri-delete-bin-6-line" aria-hidden="true"></i>
        </button>
        <span class="rec-status" role="status"><span class="rec-dot" aria-hidden="true"></span>Recording… {{ recordLabel }}</span>
        <button type="button" class="composer-round is-send" aria-label="Send voice message" @click="stopRecording(true)">
          <i class="ri-send-plane-fill" aria-hidden="true"></i>
        </button>
      </div>
      <form v-else class="composer" @submit.prevent="handleSend">
        <button type="button" class="composer-round" aria-label="Send a photo" :disabled="uploading" @click="photoInput?.click()">
          <span v-if="uploading" class="spinner-border spinner-border-sm" aria-hidden="true"></span>
          <i v-else class="ri-image-add-line" aria-hidden="true"></i>
        </button>
        <button v-if="appConfig?.gifs" type="button" class="composer-round is-gif" :aria-pressed="gifOpen" aria-label="Send a GIF" @click="gifOpen = !gifOpen; emojiOpen = false">
          <span aria-hidden="true">GIF</span>
        </button>
        <input ref="photoInput" type="file" accept="image/jpeg,image/png,image/webp" class="d-none" @change="pickPhoto" />
        <label class="composer-field">
          <input ref="messageInput" v-model="inputContent" type="text" placeholder="Type a message..." aria-label="Message" @input="chatStore.notifyTyping()" />
          <button type="button" class="emoji-btn" :aria-pressed="emojiOpen" aria-label="Emoji" @click="emojiOpen = !emojiOpen">
            <i class="ri-emotion-happy-line" aria-hidden="true"></i>
          </button>
        </label>
        <button v-if="inputContent.trim()" type="submit" class="composer-round is-send" aria-label="Send" :disabled="chatStore.sending">
          <i class="ri-send-plane-fill" aria-hidden="true"></i>
        </button>
        <button v-else type="button" class="composer-round is-send" aria-label="Record a voice message" :disabled="uploading || startingRecording || !voiceSupported || chatStore.loading" @click="startRecording">
          <i class="ri-mic-fill" aria-hidden="true"></i>
        </button>
      </form>
    </section>

    <!-- Web, nothing open yet -->
    <section v-else class="thread-placeholder d-none d-lg-flex">
      <i class="ri-chat-smile-2-line" aria-hidden="true"></i>
      <p class="mb-0">Select a conversation to start chatting</p>
    </section>

    <UModal :is-open="Boolean(photoPreview)" title="Send photo" max-width="sm" @close="clearPhoto">
      <img v-if="photoPreview" :src="photoPreview" alt="Photo preview before sending" class="w-100 rounded" />
      <p v-if="photoError" role="alert" class="text-danger mt-2">{{ photoError }}</p>
      <template #footer>
        <UButton variant="secondary" :disabled="uploading" @click="clearPhoto">Cancel</UButton>
        <UButton :loading="uploading" @click="confirmPhoto">Send photo</UButton>
      </template>
    </UModal>
    <SafetyModal
      v-if="activeOtherUser"
      :is-open="isSafetyOpen"
      :target-user-id="activeOtherUser.id"
      :target-name="activeOtherUser.displayName"
      :match-id="activeMatchId"
      @close="isSafetyOpen = false"
      @action-completed="onSafetyCompleted"
    />
  </div>
</template>

<script setup lang="ts">
import PremiumBadge from '../components/premium/PremiumBadge.vue';
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import UModal from '../components/ui/UModal.vue';
import UButton from '../components/ui/UButton.vue';
import SafetyModal from '../components/safety/SafetyModal.vue';
import AlertsPrompt from '../components/layout/AlertsPrompt.vue';
import ScreenBar from '../components/layout/ScreenBar.vue';
import UAvatar from '../components/ui/UAvatar.vue';
import USkeleton from '../components/ui/USkeleton.vue';
import { useAuthStore } from '../stores/auth';
import { useChatStore } from '../stores/chat';
import { useToastStore } from '../stores/toast';
import { mediaUrl, photoProblem, uploadPhoto, uploadVoice } from '../services/media';
import { Message } from '../types';
import { PROMPT_QUESTIONS } from '../content/profileOptions';
import GifPicker from '../components/chat/GifPicker.vue';
import { useAppConfig } from '../composables/useAppConfig';

const EMOJIS = ['😊', '😂', '❤️', '😍', '👋', '👍', '🙏', '✨', '☕', '✈️'];
/** The reactions the server accepts (backend mappers/messageMapper.ts). */
const REACTIONS = ['❤️', '😂', '😮', '😢', '👍', '🔥'];

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();
const chatStore = useChatStore();

const inputContent = ref('');
const emojiOpen = ref(false);
const search = ref('');
const listView = ref<'all' | 'matches' | 'unread'>('all');
const newMatches = computed(() => chatStore.conversations.filter((c) => !c.lastMessage));
const unreadConversations = computed(() => chatStore.conversations.filter((c) => c.unreadCount > 0));
// Badges count what needs attention (unread chats), as in the brand screen; Matches has none.
const listTabs = computed(() => [
  { value: 'all' as const, label: 'All', count: unreadConversations.value.length },
  { value: 'matches' as const, label: 'Matches', count: 0 },
  { value: 'unread' as const, label: 'Unread', count: unreadConversations.value.length },
]);
const emptyViewText = computed(() =>
  listView.value === 'matches' ? 'You have messaged all your matches.' : 'No unread conversations.'
);
const visibleConversations = computed(() => {
  const q = search.value.trim().toLowerCase();
  const conversations = { all: chatStore.conversations, matches: newMatches.value, unread: unreadConversations.value }[listView.value];
  return conversations.filter((c) => !q || c.otherUser.displayName.toLowerCase().includes(q) || (c.lastMessage?.content || '').toLowerCase().includes(q));
});

const isSafetyOpen = ref(false);
const messagesContainer = ref<HTMLElement | null>(null);
const activeConversationId = computed(() => (route.params.id as string) || null);
const activeOtherUser = computed(() => chatStore.activeOtherUser);
const activeMatchId = computed(() => chatStore.conversations.find((c) => c.id === activeConversationId.value)?.matchId ?? null);
const otherTyping = computed(() => Boolean(activeConversationId.value && chatStore.typingIn[activeConversationId.value]));
const messageInput = ref<HTMLInputElement | null>(null);

// ---- Reply, react, unsend ----
const menuFor = ref<string | null>(null);
const replyingTo = ref<Message | null>(null);

function quoteText(m: { kind?: string; content: string; deleted?: boolean }) {
  if (m.deleted) return 'Message deleted';
  if (m.kind === 'image') return '📷 Photo';
  if (m.kind === 'voice') return '🎤 Voice message';
  if (m.kind === 'gif') return 'GIF';
  return m.content;
}

function myReaction(msg: Message) {
  return msg.reactions?.find((r) => r.userId === authStore.user?.id)?.emoji ?? null;
}

function groupReactions(msg: Message) {
  const groups = new Map<string, { emoji: string; count: number; mine: boolean }>();
  for (const r of msg.reactions ?? []) {
    const g = groups.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false };
    g.count++;
    if (r.userId === authStore.user?.id) g.mine = true;
    groups.set(r.emoji, g);
  }
  return [...groups.values()];
}

async function react(msg: Message, emoji: string) {
  menuFor.value = null;
  // Someone else's emoji: tapping it adds the same one as yours.
  try {
    await chatStore.react(msg.id, emoji);
  } catch (err: any) {
    useToastStore().error(err.message || 'Could not react.');
  }
}

function startReply(msg: Message) {
  menuFor.value = null;
  replyingTo.value = msg;
  nextTick(() => messageInput.value?.focus());
}

async function unsend(msg: Message) {
  menuFor.value = null;
  if (!window.confirm('Delete this message for everyone?')) return;
  try {
    await chatStore.deleteMessage(msg.id);
    if (replyingTo.value?.id === msg.id) replyingTo.value = null;
  } catch (err: any) {
    useToastStore().error(err.message || 'Could not delete the message.');
  }
}

function jumpTo(messageId: string) {
  document.getElementById(`msg-${messageId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

// ---- GIFs (shown when the server has a Giphy key) ----
const appConfig = useAppConfig();
const gifOpen = ref(false);

async function sendGif(url: string) {
  const conversation = activeConversationId.value;
  const replyTo = replyingTo.value?.id ?? null;
  gifOpen.value = false;
  replyingTo.value = null;
  try {
    await chatStore.sendMessage(url, 'gif', conversation, replyTo);
    scrollToBottom();
  } catch (err: any) {
    useToastStore().error(`GIF not sent. ${err.message}`);
  }
}

// ---- Conversation starters (empty chat) ----
const PROMPT_REPLIES: Record<string, string> = PROMPT_QUESTIONS;
const starters = computed(() => {
  const other = activeOtherUser.value;
  if (!other) return [];
  const mine = new Set((authStore.profile?.interests || []).map((i) => i.name));
  const theirs: string[] = (other.interests || []).map((i: string | { name: string }) => (typeof i === 'string' ? i : i.name));
  const shared = theirs.filter((name) => mine.has(name));
  const ideas: string[] = [];
  const prompt = (other.prompts || []).find((p: { q: string; a: string }) => PROMPT_REPLIES[p.q] && p.a);
  if (prompt) ideas.push(`Loved your answer to "${PROMPT_REPLIES[prompt.q].replace(/…$/, '')}". Tell me more!`);
  if (shared[0]) ideas.push(`We both like ${shared[0].toLowerCase()}! What got you into it?`);
  else if (theirs[0]) ideas.push(`I see you're into ${theirs[0].toLowerCase()}. What do you enjoy most about it?`);
  if (shared[1]) ideas.push(`${shared[1]} too? Okay, we need to compare notes 😄`);
  ideas.push(`Hi ${other.displayName}! What's the best thing that happened to you this week?`);
  ideas.push('If you could travel anywhere next month, where would you go?');
  return ideas.slice(0, 3);
});

function useStarter(idea: string) {
  inputContent.value = idea;
  nextTick(() => messageInput.value?.focus());
}

function isMine(msg: Message) {
  return msg.senderId === authStore.user?.id;
}

/** Worded for whoever is reading: your missed call is their "No answer". */
function callLabel(msg: Message) {
  const kind = msg.call?.mode === 'video' ? 'video call' : 'voice call';
  const mine = isMine(msg);
  switch (msg.call?.outcome) {
    case 'completed': return mine ? `Outgoing ${kind}` : `Incoming ${kind}`;
    case 'declined': return mine ? `${capital(kind)} declined` : `You declined a ${kind}`;
    default: return mine ? `${capital(kind)} · no answer` : `Missed ${kind}`;
  }
}

function capital(text: string) {
  return text[0].toUpperCase() + text.slice(1);
}

function callIcon(msg: Message) {
  if (msg.call?.outcome !== 'completed') return msg.call?.mode === 'video' ? 'ri-vidicon-line' : 'ri-phone-line';
  return isMine(msg) ? 'ri-arrow-right-up-line' : 'ri-arrow-left-down-line';
}

function formatSeconds(total: number) {
  const m = Math.floor(total / 60);
  const s = String(total % 60).padStart(2, '0');
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

function startsNewDay(index: number) {
  const messages = chatStore.activeMessages;
  return index === 0 || new Date(messages[index].createdAt).toDateString() !== new Date(messages[index - 1].createdAt).toDateString();
}

onMounted(async () => {
  await chatStore.loadConversations();
  if (disposed) return;
  chatStore.initSocketHandlers();
  if (route.params.id) await openFromRoute(route.params.id as string);
});

/** Opens the routed conversation; an unavailable one (removed, blocked, not yours) returns to the list. */
async function openFromRoute(id: string) {
  try {
    await chatStore.openConversation(id);
    scrollToBottom();
  } catch (err: any) {
    if (disposed || route.params.id !== id) return;
    useToastStore().error(`This conversation isn't available. ${err.message}`);
    router.replace('/chat');
  }
}

let disposed = false;
onUnmounted(() => {
  disposed = true;
  stopRecording(false);
  chatStore.leaveCurrentConversation();
});

watch(
  () => route.params.id,
  async (newId) => {
    stopRecording(false);
    inputContent.value = '';
    emojiOpen.value = false;
    if (newId) await openFromRoute(newId as string);
    else chatStore.leaveCurrentConversation();
  }
);

watch(
  () => chatStore.activeMessages.length,
  () => nextTick(scrollToBottom)
);

function selectConversation(id: string) {
  router.push(`/chat/${id}`);
}

function addEmoji(emoji: string) {
  inputContent.value += emoji;
}

// ---- Photos ----
const photoInput = ref<HTMLInputElement | null>(null);
const uploading = ref(false);

const photoPreview = ref('');
const photoError = ref('');
let selectedPhoto: File | null = null;
let photoConversation: string | null = null;
function clearPhoto() {
  if (photoPreview.value) URL.revokeObjectURL(photoPreview.value);
  photoPreview.value = ''; selectedPhoto = null; photoError.value = '';
}
function pickPhoto(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0]; input.value = '';
  if (!file) return;
  const problem = photoProblem(file);
  if (problem) return useToastStore().error(problem);
  clearPhoto(); selectedPhoto = file; photoConversation = activeConversationId.value;
  photoPreview.value = URL.createObjectURL(file);
}
async function confirmPhoto() {
  if (!selectedPhoto || uploading.value) return;
  const conversation = photoConversation;
  uploading.value = true; photoError.value = '';
  try {
    const url = await uploadPhoto(selectedPhoto);
    if (disposed || conversation !== activeConversationId.value) return;
    await chatStore.sendMessage(url, 'image', conversation);
    clearPhoto(); scrollToBottom();
  } catch (err) { photoError.value = `Photo not sent. ${(err as Error).message}`; }
  finally { uploading.value = false; }
}
onUnmounted(clearPhoto);
watch(activeConversationId, clearPhoto);
const voiceSupported = typeof MediaRecorder !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);

function nearBottomScroll() {
  const el = messagesContainer.value;
  if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 400) scrollToBottom();
}

// ---- Voice messages ----
const MAX_RECORD_SECONDS = 120;
const recording = ref(false);
const startingRecording = ref(false);
const recordSeconds = ref(0);
let recorder: MediaRecorder | null = null;
let recordChunks: Blob[] = [];
let recordTimer: ReturnType<typeof setInterval> | undefined;
let sendWhenStopped = false;
let recordingAttempt = 0;

const recordLabel = computed(() => `${Math.floor(recordSeconds.value / 60)}:${String(recordSeconds.value % 60).padStart(2, '0')}`);

async function startRecording() {
  if (startingRecording.value || recording.value || uploading.value || !activeConversationId.value) return;
  if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    return useToastStore().error('Voice messages need a newer browser.');
  }
  const conversation = activeConversationId.value;
  const attempt = ++recordingAttempt;
  startingRecording.value = true;
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch {
    if (attempt === recordingAttempt) useToastStore().error('Allow microphone access in your browser to record a voice message.');
    return;
  } finally {
    if (attempt === recordingAttempt) startingRecording.value = false;
  }
  if (disposed || attempt !== recordingAttempt || conversation !== activeConversationId.value) {
    stream.getTracks().forEach((track) => track.stop());
    return;
  }
  const type = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t));
  try {
    recorder = new MediaRecorder(stream, type ? { mimeType: type, audioBitsPerSecond: 48_000 } : undefined);
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    useToastStore().error('Voice recording is not available in this browser.');
    return;
  }
  const currentRecorder = recorder;
  sendWhenStopped = false;
  recordChunks = [];
  recorder.ondataavailable = (e) => e.data.size && recordChunks.push(e.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(recordTimer);
    recording.value = false;
    const blob = new Blob(recordChunks, { type: currentRecorder.mimeType || 'audio/webm' });
    recorder = null;
    if (!sendWhenStopped || recordSeconds.value < 1 || !blob.size) return;
    uploading.value = true;
    try {
      const url = await uploadVoice(blob);
      if (disposed || conversation !== activeConversationId.value) return;
      await chatStore.sendMessage(url, 'voice', conversation);
      scrollToBottom();
    } catch (err: any) {
      useToastStore().error(`Voice message not sent. ${err.message}`);
    } finally {
      uploading.value = false;
    }
  };
  try {
    recorder.start();
  } catch {
    stream.getTracks().forEach((track) => track.stop());
    recorder = null;
    useToastStore().error('Voice recording could not start. Please try again.');
    return;
  }
  recording.value = true;
  recordSeconds.value = 0;
  recordTimer = setInterval(() => {
    recordSeconds.value++;
    if (recordSeconds.value >= MAX_RECORD_SECONDS) stopRecording(true);
  }, 1000);
}

function stopRecording(send: boolean) {
  recordingAttempt++;
  startingRecording.value = false;
  sendWhenStopped = send;
  if (recorder?.state === 'recording') recorder.stop();
}

async function handleSend() {
  const text = inputContent.value.trim();
  const conversation = activeConversationId.value;
  if (!text || chatStore.sending || chatStore.loading) return;
  const replyTo = replyingTo.value?.id ?? null;
  inputContent.value = '';
  emojiOpen.value = false;
  replyingTo.value = null;
  try {
    await chatStore.sendMessage(text, 'text', conversation, replyTo);
    scrollToBottom();
  } catch (err: any) {
    // Give the unsent text back rather than losing it.
    if (!disposed && conversation === activeConversationId.value && !inputContent.value) inputContent.value = text;
    useToastStore().error(`Message not sent. ${err.message}`);
  }
}

function scrollToBottom() {
  if (messagesContainer.value) messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight;
}

// The match ended (you or they unmatched): close the chat.
watch(
  () => chatStore.removedConversationId,
  (id) => {
    if (id && id === activeConversationId.value) {
      useToastStore().info('This match has ended.');
      chatStore.leaveCurrentConversation();
      router.push('/chat');
    }
  }
);
watch(activeConversationId, () => {
  replyingTo.value = null;
  menuFor.value = null;
});

function onSafetyCompleted() {
  chatStore.leaveCurrentConversation();
  chatStore.loadConversations();
  router.push('/chat');
}

function daysAgo(date: Date): number {
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  return Math.round((startOf(new Date()) - startOf(date)) / 86_400_000);
}

/** List times: the time today, then "Yesterday", then the date. */
function formatListTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ago = daysAgo(d);
  if (ago === 0) return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
  if (ago === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

function formatDay(iso: string): string {
  const d = new Date(iso);
  const ago = daysAgo(d);
  if (ago === 0) return 'Today';
  if (ago === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

function formatMessageTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}
</script>

<style scoped lang="scss">
$ink: #10106b;
$ink-soft: #3c3fa0;
$muted: #6c70b8;
$pink: #f21872;
$gradient: linear-gradient(95deg, #ff3d8b 0%, #e0149a 50%, #8a1fe0 100%);

.chat-page {
  display: flex;
  gap: 1.5rem;
  width: 100%;
  flex-grow: 1;

  @media (min-width: 992px) {
    height: calc(100vh - 4rem);
  }
}

// ---- List ----
.chat-list {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-width: 0;

  @media (min-width: 992px) {
    width: 24rem;
    flex-shrink: 0;
  }
}

.list-title {
  margin: 0;
  font-size: 2.3rem;
  font-weight: 800;
  color: $ink;
  letter-spacing: -0.02em;
}

.list-sub {
  margin-bottom: 1.1rem;
  font-size: 1.3rem;
  color: #5b4bc4;
}

.list-search {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0 1.2rem;
  height: 3.4rem;
  border-radius: var(--unmute-radius-pill);
  background: #f3effc;
  box-shadow: inset 0 0 0 1px rgba(123, 31, 214, 0.06);
  color: $ink-soft;

  i {
    font-size: 1.4rem;
  }

  input {
    flex-grow: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: $ink;
    font-size: 1.05rem;

    &::placeholder {
      color: $ink-soft;
    }
  }
}

.pill-tabs {
  display: flex;
  margin: 1rem 0;
  padding: 0.25rem;
  border-radius: var(--unmute-radius-pill);
  background: #f3effc;

  button {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    min-height: 3rem;
    border: 0;
    border-radius: var(--unmute-radius-pill);
    background: transparent;
    color: #4b3fb8;
    font-size: 1.05rem;
  }

  button[aria-pressed='true'] {
    background: $gradient;
    color: #fff;
  }
}

.tab-count {
  min-width: 1.6rem;
  height: 1.6rem;
  padding: 0 0.4rem;
  border-radius: 9999px;
  background: $pink;
  color: #fff;
  font-size: 0.85rem;
  line-height: 1.6rem;

  [aria-pressed='true'] & {
    background: rgba(255, 255, 255, 0.28);
  }
}

.conv-scroll {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;

  @media (min-width: 992px) {
    overflow-y: auto;
    padding-bottom: 1rem;
  }
}

.conv-skeleton {
  border-radius: 1.4rem;
}

.list-empty {
  padding: 2rem 1rem;
  text-align: center;
  color: $muted;
}

.conv-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 0.6rem 0.9rem 0.6rem 0.6rem;
  border: 0;
  border-radius: 1.4rem;
  background: rgba(255, 255, 255, 0.85);
  box-shadow: 0 6px 18px -12px rgba(117, 48, 170, 0.35);
  text-align: left;

  &.is-active {
    box-shadow: inset 0 0 0 2px rgba(242, 24, 114, 0.35);
  }

  :deep(.u-avatar) {
    width: 4.3rem;
    height: 4.3rem;
  }
}

.conv-avatar,
.thread-avatar {
  position: relative;
  flex-shrink: 0;
}

.presence {
  position: absolute;
  right: 0.1rem;
  bottom: 0.1rem;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: #cfc7ea;
  box-shadow: 0 0 0 3px #fff;

  &.is-online {
    background: #1fc75b;
  }
}

.conv-body {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
  flex-grow: 1;
}

.conv-name {
  font-size: 1.2rem;
  font-weight: 800;
  color: $ink;
}

.conv-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #4b3fb8;
  font-size: 1rem;
}

.conv-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  align-self: stretch;
  justify-content: space-between;
  gap: 0.4rem;
  padding: 0.4rem 0;
  flex-shrink: 0;
}

.conv-time {
  font-size: 0.85rem;
  color: #5b5fa8;

  &.is-unread {
    color: $pink;
  }
}

.unread-count {
  min-width: 1.7rem;
  height: 1.7rem;
  padding: 0 0.4rem;
  border-radius: 9999px;
  background: $pink;
  color: #fff;
  font-size: 0.9rem;
  line-height: 1.7rem;
  text-align: center;
}

// ---- Thread ----
.thread {
  display: flex;
  flex-direction: column;
  flex-grow: 1;
  min-width: 0;
  // Phones: the thread fills the screen, with the composer at the bottom.
  height: calc(100svh - 1.5rem);

  @media (min-width: 992px) {
    height: 100%;
    padding: 1rem 1.25rem;
    border-radius: 2rem;
    background: rgba(255, 255, 255, 0.55);
  }
}

.thread-head {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding-bottom: 0.8rem;
  border-bottom: 1px solid rgba(123, 31, 214, 0.08);

  .thread-avatar :deep(.u-avatar) {
    width: 5.4rem;
    height: 5.4rem;
  }

  .presence {
    width: 1.2rem;
    height: 1.2rem;
    right: 0.3rem;
    bottom: 0.3rem;
  }
}

.thread-name {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0;
  font-size: 1.55rem;
  font-weight: 800;
  color: $ink;

  > :not(.thread-name-text) { flex-shrink: 0; }
}

// One line: a long name ends in "…" rather than pushing the age onto a second line.
.thread-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

// Phones: a smaller photo, name and call buttons leave the name room for one line.
@media (max-width: 480px) {
  .thread-head {
    gap: 0.75rem;

    .thread-avatar :deep(.u-avatar) {
      width: 4.2rem;
      height: 4.2rem;
    }
  }

  .thread-name { font-size: 1.3rem; }
  .thread-status { font-size: 0.95rem; }

  .thread-head .call-btn {
    width: 2.9rem;
    height: 2.9rem;
    font-size: 1.35rem;
  }
}

.thread-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0.2rem 0 0;
  font-size: 1.05rem;
  color: #4b3fb8;

  .is-off {
    background: #cfc7ea;
  }
}

.call-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 3.4rem;
  height: 3.4rem;
  border-radius: 50%;
  background: #fce4f2;
  color: #e5147c;
  font-size: 1.6rem;
  text-decoration: none;

  @media (max-width: 380px) {
    width: 2.8rem;
    height: 2.8rem;
    font-size: 1.3rem;
  }
}

.messages {
  flex-grow: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.8rem 0.1rem;
}

.thread-empty {
  margin: auto;
  max-width: 20rem;
  text-align: center;
  color: $muted;
}

.day-pill {
  display: flex;
  justify-content: center;
  margin: 0.4rem 0;

  span {
    padding: 0.3rem 1.3rem;
    border-radius: var(--unmute-radius-pill);
    background: #ebe5fb;
    color: $ink-soft;
    font-size: 0.9rem;
  }
}

.message-row {
  display: flex;
  align-items: flex-start;
  gap: 0.7rem;
  max-width: 85%;

  &.is-mine {
    align-self: flex-end;

    .message-col {
      align-items: flex-end;
    }

    .bubble {
      background: $gradient;
      color: #fff;
      border-radius: 1.3rem;
    }
  }
}

.message-avatar :deep(.u-avatar) {
  width: 2.8rem;
  height: 2.8rem;
}

.message-col {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  min-width: 0;
}

.bubble {
  padding: 0.7rem 1.1rem;
  border-radius: 1.3rem;
  background: #fff;
  color: $ink;
  font-size: 1rem;
  line-height: 1.45;
  white-space: pre-line;
  overflow-wrap: anywhere;
  box-shadow: 0 6px 16px -12px rgba(117, 48, 170, 0.35);
}

.message-meta {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin: 0.25rem 0.2rem 0.4rem;
  font-size: 0.85rem;
  color: #6c70a8;

  i {
    font-size: 1.1rem;
    color: #b6a8d8;

    &.is-read {
      color: #e5147c;
    }
  }
}

.call-row {
  display: flex;
  justify-content: center;
  margin: 0.4rem 0;
}

.call-pill {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.5rem 0.9rem 0.5rem 0.5rem;
  border-radius: 1.2rem;
  background: #fff;
  color: $ink;
  text-decoration: none;
  box-shadow: 0 6px 16px -12px rgba(117, 48, 170, 0.35);

  &.is-missed .call-icon {
    background: #fde7e9;
    color: #e0334a;
  }

  &.is-missed strong {
    color: #e0334a;
  }
}

.call-icon {
  display: grid;
  place-items: center;
  width: 2.3rem;
  height: 2.3rem;
  border-radius: 50%;
  background: #fbe4f2;
  color: #e5147c;
  font-size: 1.15rem;
}

.call-text {
  display: flex;
  flex-direction: column;
  font-size: 0.78rem;
  color: #6c70a8;

  strong {
    font-size: 0.92rem;
    color: $ink;
  }
}

.call-back {
  margin-left: 0.4rem;
  color: #e5147c;
  font-size: 1.2rem;
}

.bubble.is-photo {
  display: block;
  padding: 0.3rem;
  background: #fff;

  img {
    display: block;
    min-width: 8rem;
    min-height: 6rem;
    max-width: min(15rem, 60vw);
    max-height: 18rem;
    background: #f3effc;
    border-radius: 1.1rem;
    object-fit: cover;
  }

  .is-mine & {
    background: $gradient;
  }
}

.bubble.is-voice {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.6rem;

  i {
    font-size: 1.2rem;
  }

  audio {
    width: min(14rem, 55vw);
    height: 2.2rem;
  }
}

.composer.is-recording {
  justify-content: space-between;
}

.composer-round.is-cancel {
  background: #f3effc;
  color: #e0334a;
}

.composer-round:disabled {
  opacity: 0.6;
}

.rec-status {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: $ink;
  font-weight: 600;
}

.rec-dot {
  width: 0.7rem;
  height: 0.7rem;
  border-radius: 50%;
  background: #e0334a;
  animation: rec-blink 1s ease-in-out infinite;
}

@keyframes rec-blink {
  50% { opacity: 0.25; }
}

.bubble-skeleton {
  border-radius: 1.2rem;
}

.emoji-row {
  display: flex;
  gap: 0.2rem;
  padding: 0.4rem;
  margin-bottom: 0.4rem;
  overflow-x: auto;
  border-radius: var(--unmute-radius-pill);
  background: #fff;

  button {
    border: 0;
    background: transparent;
    font-size: 1.5rem;
  }
}

.composer {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.45rem;
  margin-bottom: env(safe-area-inset-bottom, 0px);
  border-radius: var(--unmute-radius-pill);
  background: #fff;
  box-shadow: 0 10px 30px -18px rgba(117, 48, 170, 0.5);
}

.composer-round {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 3.3rem;
  height: 3.3rem;
  border: 0;
  border-radius: 50%;
  background: linear-gradient(135deg, #ff4fa0, #d0158f);
  color: #fff;
  font-size: 1.8rem;

  &.is-send {
    width: 3.6rem;
    height: 3.6rem;
    font-size: 1.6rem;
    box-shadow: 0 0 0 4px #fbe0f0;
  }
}

.composer-field {
  display: flex;
  align-items: center;
  flex-grow: 1;
  min-width: 0;
  height: 3.3rem;
  padding: 0 0.5rem 0 1.2rem;
  border-radius: var(--unmute-radius-pill);
  background: #f3effc;

  input {
    flex-grow: 1;
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: $ink;
    font-size: 1.05rem;

    &::placeholder {
      color: #6c70a8;
    }
  }
}

.emoji-btn {
  border: 0;
  background: transparent;
  color: $ink-soft;
  font-size: 1.8rem;
  line-height: 1;
}

.thread-placeholder {
  flex-grow: 1;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: 2rem;
  background: rgba(255, 255, 255, 0.55);
  color: $muted;

  i {
    font-size: 3rem;
    color: #e5147c;
  }
}

// ---- Typing, starters, replies, reactions, unsend ----
.typing-dots {
  display: inline-flex;
  gap: 0.18rem;
  margin-right: 0.35rem;

  i {
    width: 0.38rem;
    height: 0.38rem;
    border-radius: 50%;
    background: $pink;
    animation: typing-bounce 1s infinite ease-in-out;

    &:nth-child(2) { animation-delay: 0.15s; }
    &:nth-child(3) { animation-delay: 0.3s; }
  }
}

@keyframes typing-bounce {
  0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
  40% { transform: translateY(-3px); opacity: 1; }
}

.starters {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 1rem;
}

.starter {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.65rem 0.9rem;
  border: 1px solid rgba(123, 31, 214, 0.15);
  border-radius: 1rem;
  background: #fff;
  color: $ink;
  font-size: 0.92rem;
  text-align: left;
  line-height: 1.35;

  i { flex-shrink: 0; font-size: 1.1rem; color: $pink; }
  &:hover { border-color: rgba(229, 20, 124, 0.45); }
}

.reply-quote {
  display: flex;
  flex-direction: column;
  max-width: 100%;
  margin-bottom: -0.35rem;
  padding: 0.45rem 0.8rem 0.75rem;
  border: 0;
  border-left: 3px solid $pink;
  border-radius: 0.9rem 0.9rem 0 0;
  background: rgba(242, 24, 114, 0.08);
  color: $ink-soft;
  font-size: 0.82rem;
  text-align: left;

  strong { font-size: 0.78rem; color: $pink; }
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 16rem; }
}

.bubble.is-deleted,
.message-row.is-mine .bubble.is-deleted {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  background: transparent;
  border: 1px dashed rgba(108, 112, 184, 0.45);
  box-shadow: none;
  color: $muted;
  font-style: italic;
}

.reactions {
  display: flex;
  gap: 0.25rem;
  margin-top: -0.45rem;
  padding: 0 0.4rem;
  z-index: 1;
}

.reaction {
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  padding: 0.05rem 0.45rem;
  border: 1px solid rgba(123, 31, 214, 0.12);
  border-radius: 9999px;
  background: #fff;
  font-size: 0.95rem;
  line-height: 1.5;
  box-shadow: 0 2px 6px -3px rgba(117, 48, 170, 0.4);

  span { font-size: 0.75rem; color: $muted; }
  &.is-mine { border-color: $pink; background: #fdecf5; }
}

.msg-more {
  display: inline-grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #9a8fc4;

  i { font-size: 1.1rem; color: inherit; }
  &:hover, &[aria-expanded='true'] { background: rgba(123, 31, 214, 0.08); color: $ink; }
}

.msg-menu {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  margin-bottom: 0.5rem;
  padding: 0.5rem;
  border-radius: 1rem;
  background: #fff;
  box-shadow: 0 12px 28px -16px rgba(117, 48, 170, 0.55);
}

.msg-menu-emoji {
  display: flex;
  gap: 0.15rem;

  button {
    width: 2.3rem;
    height: 2.3rem;
    border: 0;
    border-radius: 50%;
    background: transparent;
    font-size: 1.3rem;

    &:hover, &[aria-pressed='true'] { background: #fdecf5; }
  }
}

.msg-menu-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
  border-top: 1px solid rgba(123, 31, 214, 0.08);
  padding-top: 0.4rem;

  button {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.35rem 0.7rem;
    border: 0;
    border-radius: 9999px;
    background: #f5f1fc;
    color: $ink;
    font-size: 0.85rem;

    &.is-danger { background: #fde7e9; color: #c62839; }
  }
}

.reply-bar {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0.75rem 0.4rem;
  padding: 0.5rem 0.75rem;
  border-left: 3px solid $pink;
  border-radius: 0.8rem;
  background: rgba(255, 255, 255, 0.92);
  color: $ink;

  > i { color: $pink; font-size: 1.2rem; }

  button {
    border: 0;
    background: transparent;
    color: $muted;
    font-size: 1.2rem;
  }
}

.reply-bar-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
  font-size: 0.82rem;

  strong { color: $pink; }
  span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: $ink-soft; }
}

@media (prefers-reduced-motion: reduce) {
  .typing-dots i { animation: none; }
}

.composer-round.is-gif {
  width: 2.7rem;
  height: 2.7rem;
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.02em;

  &[aria-pressed='true'] { outline: 2px solid $pink; }
}

.bubble.is-gif img {
  display: block;
  max-width: 14rem;
  max-height: 14rem;
  border-radius: 1rem;
}
</style>
