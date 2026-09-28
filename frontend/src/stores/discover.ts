import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';
import { useToastStore } from './toast';
import { useAuthStore } from './auth';
import { DiscoveryCandidate, EducationLevel, Institution, Interest, Place, ProfessionField } from '../types';

/** Discovery filters as the viewer chose them; applied by the backend, never client-side. */
export interface DiscoverFilters {
  radiusKm: number | null;
  /** Kept whole (not just the id) so the active-filter chips can name it without another request. */
  place: Place | null;
  sameInstitution: boolean;
  institution: Institution | null;
  minAge: number | null;
  maxAge: number | null;
  lookingFor: 'Relationship' | 'Friendship' | 'Casual' | null;
  showMe: 'women' | 'men' | null;
  /** Kept whole so the filter chips can name them. */
  interests: Pick<Interest, 'id' | 'name'>[];
  educationLevel: EducationLevel | null;
  professionField: ProfessionField | null;
}

export function emptyFilters(): DiscoverFilters {
  return {
    radiusKm: null,
    place: null,
    sameInstitution: false,
    institution: null,
    minAge: null,
    maxAge: null,
    lookingFor: null,
    showMe: null,
    interests: [],
    educationLevel: null,
    professionField: null,
  };
}

/** A new mutual match, with the liked card kept for the celebration screen's details. */
export interface ActiveMatch {
  conversationId: string;
  person: DiscoveryCandidate;
}

const STORAGE_PREFIX = 'unmute.discoverFilters.v1:';

// Per-viewer convenience only: storage can be unavailable (private mode, blocked site data).
function readSavedFilters(userId: string): DiscoverFilters {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + userId);
    return raw ? { ...emptyFilters(), ...JSON.parse(raw) } : emptyFilters();
  } catch {
    return emptyFilters();
  }
}

function saveFilters(userId: string, filters: DiscoverFilters): void {
  try {
    localStorage.setItem(STORAGE_PREFIX + userId, JSON.stringify(filters));
  } catch {
    // Not persisting is fine; the filters still apply for this visit.
  }
}

export const useDiscoverStore = defineStore('discover', () => {
  const feed = ref<DiscoveryCandidate[]>([]);
  const currentIndex = ref(0);
  const sort = ref<'recommended' | 'distance' | 'interests' | 'online'>('recommended');
  let recommendedOrder: string[] = [];
  function setSort(next: typeof sort.value) {
    sort.value = next;
    const remaining = feed.value.slice(currentIndex.value);
    // People with no known distance go last; MAX_VALUE (not Infinity) keeps two of them from comparing as NaN.
    remaining.sort((a, b) => next === 'distance'
      ? (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE)
      : next === 'interests' ? b.commonInterestsCount - a.commonInterestsCount
      : next === 'online' ? Number(b.isOnline) - Number(a.isOnline) || recommendedOrder.indexOf(a.id) - recommendedOrder.indexOf(b.id)
      : recommendedOrder.indexOf(a.id) - recommendedOrder.indexOf(b.id));
    feed.value = [...feed.value.slice(0, currentIndex.value), ...remaining];
  }
  const loading = ref(false);
  const error = ref<string | null>(null);
  const activeMatch = ref<ActiveMatch | null>(null);

  const currentCandidate = computed<DiscoveryCandidate | null>(() => {
    if (currentIndex.value < feed.value.length) {
      return feed.value[currentIndex.value];
    }
    return null;
  });

  const hasMore = computed(() => currentIndex.value < feed.value.length);

  const filters = ref<DiscoverFilters>(emptyFilters());
  /** Free-text search (name, work, bio, interests, college, area); for this visit only, never saved. */
  const search = ref('');
  let filtersOwner: string | null = null;

  /** Loads the signed-in viewer's saved filters once, and again if a different member signs in. */
  function syncFiltersOwner() {
    const userId = useAuthStore().user?.id ?? null;
    if (userId && userId !== filtersOwner) {
      filtersOwner = userId;
      filters.value = readSavedFilters(userId);
    }
  }

  const activeFilterCount = computed(() => {
    const f = filters.value;
    return [
      f.radiusKm !== null,
      f.place,
      f.sameInstitution || f.institution,
      f.minAge !== null || f.maxAge !== null,
      f.lookingFor,
      f.showMe,
      f.interests.length,
      f.educationLevel,
      f.professionField,
    ].filter(Boolean).length;
  });

  /**
   * Query parameters for the backend. Filters the viewer can no longer use (distance without an
   * area, "my college" without one) are dropped rather than sent to fail.
   */
  function filterParams(): Record<string, string | number | boolean> {
    const f = filters.value;
    const profile = useAuthStore().profile;
    const params: Record<string, string | number | boolean> = {};
    if (f.radiusKm !== null && profile?.location) params.radiusKm = f.radiusKm;
    if (f.place) params.placeId = f.place.id;
    if (f.sameInstitution && profile?.education) params.sameInstitution = true;
    else if (f.institution) params.institutionId = f.institution.id;
    if (f.minAge !== null) params.minAge = f.minAge;
    if (f.maxAge !== null) params.maxAge = f.maxAge;
    if (f.lookingFor) params.lookingFor = f.lookingFor;
    if (f.showMe) params.showMe = f.showMe;
    if (f.educationLevel) params.educationLevel = f.educationLevel;
    if (f.professionField) params.professionField = f.professionField;
    if (f.interests.length) params.interestIds = f.interests.map((i) => i.id).join(',');
    if (search.value.trim()) params.q = search.value.trim();
    return params;
  }

  function setFilters(next: DiscoverFilters) {
    syncFiltersOwner();
    filters.value = next;
    if (filtersOwner) saveFilters(filtersOwner, next);
    return loadFeed();
  }

  function setSearch(text: string) {
    const next = text.trim().slice(0, 60);
    if (next === search.value) return Promise.resolve();
    search.value = next;
    return loadFeed();
  }

  function clearFilters() {
    return setFilters(emptyFilters());
  }

  // Typing a search fires overlapping requests; only the newest one may fill the deck.
  let feedRequest = 0;

  async function loadFeed() {
    syncFiltersOwner();
    const request = ++feedRequest;
    loading.value = true;
    error.value = null;
    try {
      const res = await api.get('/discover', { params: filterParams() });
      if (request !== feedRequest) return;
      feed.value = res.data.data;
      currentIndex.value = 0;
      recommendedOrder = feed.value.map(person => person.id);
      setSort(sort.value);
    } catch (err: any) {
      if (request === feedRequest) error.value = err.message;
    } finally {
      if (request === feedRequest) loading.value = false;
    }
  }

  /**
   * Advances optimistically; if the server rejects the action the card comes back
   * (when the user hasn't moved on further) so a failed like is never silently lost.
   */
  async function interactWithCurrent(action: 'like' | 'pass') {
    if (!currentCandidate.value) return;
    const target = currentCandidate.value;
    const index = currentIndex.value;
    currentIndex.value++;

    try {
      const res = await api.post(`/interactions/${action}`, { targetUserId: target.id });
      if (action === 'like' && res.data.data.matched) {
        activeMatch.value = { conversationId: res.data.data.conversationId, person: target };
      }
    } catch (err: any) {
      if (currentIndex.value === index + 1) currentIndex.value = index;
      useToastStore().error(
        action === 'like'
          ? `Couldn't connect with ${target.displayName}. ${err.message}`
          : `Couldn't skip ${target.displayName}. ${err.message}`
      );
    }
  }

  const likeCurrent = () => interactWithCurrent('like');
  const passCurrent = () => interactWithCurrent('pass');

  async function blockUser(targetUserId: string, reason = '') {
    await api.post('/safety/block', { targetUserId, reason });
    // Remove from feed if present
    feed.value = feed.value.filter((u) => u.id !== targetUserId);
  }

  async function reportUser(reportedUserId: string, category: string, details = '') {
    await api.post('/safety/reports', { reportedUserId, category, details });
  }

  function dismissMatchModal() {
    activeMatch.value = null;
  }

  return {
    feed,
    currentIndex,
    sort,
    loading,
    error,
    currentCandidate,
    hasMore,
    activeMatch,
    filters,
    search,
    activeFilterCount,
    setSort,
    setFilters,
    setSearch,
    clearFilters,
    loadFeed,
    likeCurrent,
    passCurrent,
    blockUser,
    reportUser,
    dismissMatchModal,
  };
});
