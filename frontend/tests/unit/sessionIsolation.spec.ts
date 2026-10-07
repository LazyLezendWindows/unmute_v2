import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';

const mocks = vi.hoisted(() => ({
  get: vi.fn(), post: vi.fn(), patch: vi.fn(),
  unauthorized: null as (() => void) | null,
}));
vi.mock('../../src/services/api', () => ({
  api: { get: mocks.get, post: mocks.post, patch: mocks.patch },
  ApiError: Error,
  onUnauthorized: (handler: () => void) => { mocks.unauthorized = handler; },
}));
vi.mock('../../src/services/socket', () => ({ getSocket: () => null, connectSocket: vi.fn(), disconnectSocket: vi.fn(), onReconnect: vi.fn() }));
vi.mock('../../src/stores/call', () => ({ useCallStore: () => ({ reset: vi.fn() }) }));
vi.mock('../../src/composables/useGoogleIdentity', () => ({ useGoogleIdentity: () => ({ disableAutoSelect: vi.fn() }) }));
vi.mock('../../src/services/push', () => ({ unregisterPush: vi.fn() }));

import { useAuthStore } from '../../src/stores/auth';
import { useChatStore } from '../../src/stores/chat';
import { useDiscoverStore } from '../../src/stores/discover';
import { useNotificationStore } from '../../src/stores/notifications';
import { usePremiumStore } from '../../src/stores/premium';
import { useSubscriptionStore } from '../../src/stores/subscription';

const response = (data: unknown) => ({ data: { data } });
function deferred() {
  let resolve!: (value: any) => void;
  const promise = new Promise<any>(done => { resolve = done; });
  return { promise, resolve };
}
function authenticate(id = 'first') {
  const auth = useAuthStore();
  auth.status = 'AUTHENTICATED';
  auth.user = { id, email: `${id}@example.com`, profile: { displayName: id, location: null } } as any;
  return auth;
}

beforeEach(() => {
  setActivePinia(createPinia());
  vi.resetAllMocks();
  localStorage.clear();
});

describe('account isolation', () => {
  it.each(['logout', 'expired session'])('clears account data on %s', async (reason) => {
    const auth = authenticate();
    const chat = useChatStore();
    const discover = useDiscoverStore();
    const premium = usePremiumStore();
    const subscription = useSubscriptionStore();
    chat.conversations = [{ id: 'private-chat' }] as any;
    chat.matches = [{ matchId: 'private-match' }] as any;
    discover.feed = [{ id: 'private-profile' }] as any;
    discover.search = 'private search';
    discover.activeMatch = { conversationId: 'private-chat', person: { id: 'private-profile' } } as any;
    premium.overview = { isPremium: true } as any;
    subscription.access = { active: true, state: 'paid' } as any;
    if (reason === 'logout') { mocks.post.mockResolvedValue(response({})); await auth.logout(); }
    else mocks.unauthorized!();
    expect(auth.user).toBeNull();
    expect(chat.conversations).toEqual([]);
    expect(chat.matches).toEqual([]);
    expect(discover.feed).toEqual([]);
    expect(discover.search).toBe('');
    expect(discover.activeMatch).toBeNull();
    expect(premium.overview).toBeNull();
    expect(subscription.access).toBeNull();
  });

  it('ignores profile and plan responses that finish after signing into another account', async () => {
    const auth = authenticate();
    const pending = deferred();
    mocks.get.mockReturnValue(pending.promise);
    mocks.patch.mockReturnValue(pending.promise);
    const tasks = [auth.fetchMe(), auth.refreshProfile(), auth.updateProfile({ bio: 'old bio' }), usePremiumStore().load(), useSubscriptionStore().fetchStatus(), useDiscoverStore().loadFeed()];
    mocks.unauthorized!();
    authenticate('second');
    pending.resolve(response({ id: 'first', displayName: 'First', active: true, isPremium: true }));
    await Promise.all(tasks);
    expect(auth.user?.id).toBe('second');
    expect(auth.profile?.displayName).toBe('second');
    expect(usePremiumStore().overview).toBeNull();
    expect(useSubscriptionStore().access).toBeNull();
    expect(useDiscoverStore().feed).toEqual([]);
  });

  it('ignores a late match from the previous account', async () => {
    authenticate();
    const discover = useDiscoverStore();
    const person = { id: 'old-person', displayName: 'Old Person' } as any;
    discover.feed = [person];
    const pending = deferred();
    mocks.post.mockReturnValue(pending.promise);
    const like = discover.like(person);
    mocks.unauthorized!();
    authenticate('second');
    pending.resolve(response({ matched: true, conversationId: 'old-chat' }));
    await like;
    expect(discover.activeMatch).toBeNull();
    expect(discover.feed).toEqual([]);
  });

  it('does not restore notifications from an expired account', async () => {
    authenticate();
    const notifications = useNotificationStore();
    const pending = deferred();
    mocks.get.mockReturnValue(pending.promise);
    const request = notifications.load();
    mocks.unauthorized!();
    pending.resolve(response({ items: [{ id: 'old-notification' }], unreadCount: 1 }));
    await request;
    expect(notifications.unreadCount).toBe(0);
    expect(notifications.items).toEqual([]);
  });
});
