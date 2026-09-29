import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { api } from '../services/api';
import { useToastStore } from './toast';
import { useAuthStore } from './auth';
import { DiscoveryCandidate, EducationLevel, HabitFrequency, Institution, Interest, Place, ProfessionField, WorkoutFrequency } from '../types';

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
  verifiedOnly: boolean;
  drinking: HabitFrequency | null;
  smoking: HabitFrequency | null;
  workout: WorkoutFrequency | null;
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
    verifiedOnly: false,
    drinking: null,
    smoking: null,
    workout: null,
  };
}

/** A new mutual match, with the liked card kept for the celebration screen's details. */
export interface ActiveMatch {
  conversationId: string;
  person: DiscoveryCandidate;
}

// v2: the older interests were merged away, so filters saved with their ids start fresh.
const STORAGE_PREFIX = 'unmute.discoverFilters.v2:';

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
  const sort = ref<'recommended' | 'distance' | 'interests' | 'online' | 'new'>('recommended');
  let recommendedOrder: string[] = [];
  function setSort(next: typeof sort.value) {
    sort.value = next;
    const remaining = feed.value.slice(currentIndex.value);
    // People with no known distance go last; MAX_VALUE (not Infinity) keeps two of them from comparing as NaN.
    remaining.sort((a, b) => next === 'distance'
      ? (a.distanceKm ?? Number.MAX_VALUE) - (b.distanceKm ?? Number.MAX_VALUE)
      : next === 'interests' ? b.commonInterestsCount - a.commonInterestsCount
      : next === 'online' ? Number(b.isOnline) - Number(a.isOnline) || recommendedOrder.indexOf(a.id) - recommendedOrder.indexOf(b.id)
      : next === 'new' ? (b.joinedOn ?? '').localeCompare(a.joinedOn ?? '') || recommendedOrder.indexOf(a.id) - recommendedOrder.indexOf(b.id)
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
      f.verifiedOnly,
      f.drinking,
      f.smoking,
      f.workout,
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
    if (f.verifiedOnly) params.verifiedOnly = true;
    if (f.drinking) params.drinking = f.drinking;
    if (f.smoking) params.smoking = f.smoking;
    if (f.workout) params.workout = f.workout;
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
   * Likes or passes anyone in the feed (the top card, or a person picked from the grid). They leave
   * the feed straight away; if the server rejects it they come back, so a failed like is never lost.
   */
  async function interact(target: DiscoveryCandidate, action: 'like' | 'pass', superLike = false): Promise<boolean> {
    const index = feed.value.findIndex((p) => p.id === target.id);
    if (index === -1) return false;
    feed.value = feed.value.filter((p) => p.id !== target.id);
    if (index < currentIndex.value) currentIndex.value--;

    try {
      const res = await api.post(`/interactions/${action}`, { targetUserId: target.id, ...(superLike ? { superLike: true } : {}) });
      if (action === 'like' && res.data.data.matched) {
        activeMatch.value = { conversationId: res.data.data.conversationId, person: target };
      }
      lastPassed.value = action === 'pass' ? target : null;
      return true;
    } catch (err: any) {
      if (!feed.value.some((p) => p.id === target.id)) {
        const at = Math.min(index, feed.value.length);
        feed.value = [...feed.value.slice(0, at), target, ...feed.value.slice(at)];
        if (index < currentIndex.value) currentIndex.value++;
      }
      useToastStore().error(
        action === 'like'
          ? `Couldn't connect with ${target.displayName}. ${err.message}`
          : `Couldn't skip ${target.displayName}. ${err.message}`
      );
      return false;
    }
  }

  const likeCurrent = () => currentCandidate.value && interact(currentCandidate.value, 'like');
  const passCurrent = () => currentCandidate.value && interact(currentCandidate.value, 'pass');
  const like = (person: DiscoveryCandidate) => interact(person, 'like');
  const pass = (person: DiscoveryCandidate) => interact(person, 'pass');
  /** A like the other person sees as special (and who it's from); limited per day by the server. */
  const superLike = (person: DiscoveryCandidate) => interact(person, 'like', true);

  /** The last person passed on, for Rewind (only passes can be taken back; a like may already be a match). */
  const lastPassed = ref<DiscoveryCandidate | null>(null);

  /** Rewind: takes back the last pass on the server and puts that card back on top. */
  const undoing = ref(false);
  async function undoPass() {
    if (undoing.value) return;
    const person = lastPassed.value;
    if (!person) return;
    undoing.value = true;
    try {
      await api.delete('/interactions/pass', { data: { targetUserId: person.id } });
      lastPassed.value = null;
      if (!feed.value.some((p) => p.id === person.id)) {
        const at = currentIndex.value;
        feed.value = [...feed.value.slice(0, at), person, ...feed.value.slice(at)];
      }
    } catch (err: any) {
      useToastStore().error(err.message);
    } finally { undoing.value = false; }
  }

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
    like,
    pass,
    superLike,
    lastPassed,
    undoPass,
    undoing,
    blockUser,
    reportUser,
    dismissMatchModal,
  };
});
