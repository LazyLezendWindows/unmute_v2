import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import type { Conversation, Message } from '../../src/types';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), emit: vi.fn(), opened: vi.fn(),
  handlers: new Map<string, (...args: any[]) => void>(),
}));
vi.mock('../../src/services/api', () => ({ api: { get: mocks.get, post: mocks.post } }));
vi.mock('../../src/services/socket', () => ({
  getSocket: () => ({ emit: mocks.emit, off: vi.fn(), on: (name: string, handler: (...args: any[]) => void) => mocks.handlers.set(name, handler) }),
  onReconnect: vi.fn(),
}));
vi.mock('../../src/stores/auth', () => ({ useAuthStore: () => ({ user: { id: 'me' } }) }));
vi.mock('../../src/stores/notifications', () => ({ useNotificationStore: () => ({ conversationOpened: mocks.opened }) }));
vi.mock('../../src/stores/toast', () => ({ useToastStore: () => ({ error: vi.fn() }) }));
import { useChatStore } from '../../src/stores/chat';

function deferred() {
  let resolve!: (value: any) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<any>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const response = (data: unknown) => ({ data: { data } });
const message = (conversationId: string, id = 'message', senderId = 'them'): Message => ({
  id, conversationId, senderId, content: id, createdAt: '2026-01-01T00:00:00.000Z', status: 'sent',
});
const conversation = (id: string): Conversation => ({ id, unreadCount: 0, lastMessage: null } as Conversation);
const history = (id: string) => response({ conversationId: id, messages: [message(id)], otherUser: { id: `${id}-person` } });

beforeEach(() => {
  setActivePinia(createPinia());
  vi.clearAllMocks();
  mocks.handlers.clear();
});

describe('chat navigation and realtime updates', () => {
  it('ignores an older history response when another conversation opens', async () => {
    const first = deferred();
    const second = deferred();
    mocks.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const chat = useChatStore();
    const a = chat.openConversation('a');
    const b = chat.openConversation('b');
    second.resolve(history('b')); await b;
    first.resolve(history('a')); await a;
    expect(chat.activeConversationId).toBe('b');
    expect(chat.activeOtherUser.id).toBe('b-person');
    expect(chat.activeMessages.map((m) => m.conversationId)).toEqual(['b']);
    expect(mocks.emit).toHaveBeenCalledWith('leave_conversation', 'a');
    expect(mocks.emit).not.toHaveBeenCalledWith('join_conversation', 'a');
  });

  it('ignores an older error and invalidates a history request on leaving', async () => {
    const first = deferred(); const second = deferred();
    mocks.get.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const chat = useChatStore();
    const a = chat.openConversation('a'); const b = chat.openConversation('b');
    first.reject(new Error('Missing'));
    await expect(a).resolves.toBeUndefined();
    expect(chat.activeConversationId).toBe('b');
    chat.leaveCurrentConversation(); second.resolve(history('b')); await b;
    expect(chat.activeMessages).toEqual([]);
    expect(chat.activeOtherUser).toBeNull();
    expect(chat.loading).toBe(false);
  });

  it('keeps a sent message in its original conversation after navigation', async () => {
    const pending = deferred(); mocks.post.mockReturnValueOnce(pending.promise);
    const chat = useChatStore();
    chat.conversations = [conversation('a'), conversation('b')];
    chat.activeConversationId = 'a';
    const send = chat.sendMessage('Hello');
    chat.activeConversationId = 'b';
    pending.resolve(response(message('a', 'sent', 'me'))); await send;
    expect(chat.activeMessages).toEqual([]);
    expect(chat.conversations[0].lastMessage?.id).toBe('sent');
    expect(chat.conversations[1].lastMessage).toBeNull();
  });

  it('updates closed-chat badges once for duplicate realtime events', () => {
    const chat = useChatStore(); chat.conversations = [conversation('a')]; chat.initSocketHandlers();
    const incoming = message('a');
    mocks.handlers.get('message_notification')!({ message: incoming });
    mocks.handlers.get('new_message')!(incoming);
    expect(chat.totalUnreadCount).toBe(1);
    expect(chat.conversations[0].lastMessage?.id).toBe('message');
    mocks.handlers.get('message_notification')!({ message: message('a', 'own-call', 'me') });
    expect(chat.totalUnreadCount).toBe(1);
  });

  it('acknowledges live messages and applies receipts only to messages addressed to the reader', () => {
    const chat = useChatStore(); chat.initSocketHandlers(); chat.activeConversationId = 'a';
    chat.conversations = [conversation('a')];
    chat.activeMessages = [message('a', 'mine', 'me')];
    mocks.handlers.get('new_message')!(message('a', 'theirs'));
    expect(mocks.emit).toHaveBeenCalledWith('read_conversation', 'a');
    mocks.handlers.get('messages_read')!({ conversationId: 'a', readerId: 'me' });
    expect(chat.activeMessages.map((m) => m.status)).toEqual(['sent', 'read']);
  });

  it('does not lose a live message that arrives during history loading', async () => {
    const pending = deferred(); mocks.get.mockReturnValueOnce(pending.promise);
    const chat = useChatStore(); chat.conversations = [conversation('a')]; chat.initSocketHandlers();
    const open = chat.openConversation('a');
    mocks.handlers.get('message_notification')!({ message: message('a', 'new') });
    pending.resolve(history('a')); await open;
    expect(chat.activeMessages.map((m) => m.id)).toEqual(['message', 'new']);
  });

  it('does not restore a previous account from pending requests after reset', async () => {
    const pending = deferred(); mocks.get.mockReturnValue(pending.promise); mocks.post.mockReturnValue(pending.promise);
    const chat = useChatStore(); chat.activeConversationId = 'a';
    const requests = [chat.loadConversations(), chat.loadMatches(), chat.loadLikedProfiles(), chat.sendMessage('hello')];
    chat.reset(); pending.resolve(response([{ id: 'private-old-account' }])); await Promise.all(requests);
    expect(chat.conversations).toEqual([]); expect(chat.matches).toEqual([]);
    expect(chat.likedProfiles).toEqual([]); expect(chat.likesReceived).toEqual([]);
    expect(chat.activeMessages).toEqual([]); expect(chat.activeConversationId).toBeNull();
    expect(chat.sending).toBe(false);
  });
});
