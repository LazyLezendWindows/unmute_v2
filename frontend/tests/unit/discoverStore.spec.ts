import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';

const get = vi.fn(async (_url: string, _config?: any) => ({ data: { data: [] } }));
vi.mock('../../src/services/api', () => ({ api: { get, post: vi.fn() }, onUnauthorized: vi.fn(), ApiError: Error }));
vi.mock('../../src/services/socket', () => ({ connectSocket: vi.fn(), disconnectSocket: vi.fn() }));
vi.mock('../../src/composables/useGoogleIdentity', () => ({ useGoogleIdentity: () => ({ disableAutoSelect: vi.fn() }) }));

const { useDiscoverStore, emptyFilters } = await import('../../src/stores/discover');
const { useAuthStore } = await import('../../src/stores/auth');

function signIn(profile: Record<string, unknown> = {}) {
  const auth = useAuthStore();
  auth.user = { id: 'viewer-1', email: 'v@example.com', profile: { location: null, education: null, ...profile } as any };
}

describe('discover store filters', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    localStorage.clear();
    get.mockClear();
  });

  it('orders remaining profiles without bringing reviewed people back', async () => {
    signIn();
    get.mockResolvedValueOnce({ data: { data: [
      { id: 'reviewed', distanceKm: 1, commonInterestsCount: 9 },
      { id: 'unknown', distanceKm: null, commonInterestsCount: 1 },
      { id: 'near', distanceKm: 2, commonInterestsCount: 2 },
      { id: 'shared', distanceKm: 8, commonInterestsCount: 5 },
    ] as any } });
    const store = useDiscoverStore();
    await store.loadFeed();
    store.currentIndex = 1;
    store.setSort('distance');
    expect(store.feed.map(person => person.id)).toEqual(['reviewed', 'near', 'shared', 'unknown']);
    store.setSort('interests');
    expect(store.currentCandidate?.id).toBe('shared');
    store.setSort('recommended');
    expect(store.currentCandidate?.id).toBe('unknown');
    expect(store.currentIndex).toBe(1);
  });

  it('keeps people without a distance after the rest when sorting by distance', async () => {
    signIn();
    get.mockResolvedValueOnce({ data: { data: [
      { id: 'unknown-a', distanceKm: null, commonInterestsCount: 0 },
      { id: 'far', distanceKm: 50, commonInterestsCount: 0 },
      { id: 'unknown-b', distanceKm: null, commonInterestsCount: 0 },
      { id: 'near', distanceKm: 5, commonInterestsCount: 0 },
    ] as any } });
    const store = useDiscoverStore();
    await store.loadFeed();
    store.setSort('distance');
    expect(store.feed.map(person => person.id)).toEqual(['near', 'far', 'unknown-a', 'unknown-b']);
  });

  it('sends only filters the viewer can use', async () => {
    signIn();
    const store = useDiscoverStore();
    await store.setFilters({ ...emptyFilters(), radiusKm: 25, sameInstitution: true, minAge: 21 });
    // No area and no college: distance and "my college" are dropped instead of failing server-side.
    expect(get.mock.calls.at(-1)?.[1]).toEqual({ params: { minAge: 21 } });

    signIn({ location: { source: 'place' }, education: { institutionId: 'i' } });
    await store.loadFeed();
    expect(get.mock.calls.at(-1)?.[1]).toEqual({ params: { radiusKm: 25, sameInstitution: true, minAge: 21 } });
    expect(store.activeFilterCount).toBe(3);
  });

  it('remembers filters per viewer and survives unavailable storage', async () => {
    signIn();
    await useDiscoverStore().setFilters({ ...emptyFilters(), maxAge: 30 });

    setActivePinia(createPinia());
    signIn();
    const again = useDiscoverStore();
    await again.loadFeed();
    expect(again.filters.maxAge).toBe(30);

    setActivePinia(createPinia());
    signIn();
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const blocked = useDiscoverStore();
    await expect(blocked.loadFeed()).resolves.toBeUndefined();
    expect(blocked.filters).toEqual(emptyFilters());
    vi.restoreAllMocks();
  });
});
