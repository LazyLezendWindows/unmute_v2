import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { api } from '../services/api';

export interface PremiumOverview {
  isPremium: boolean;
  superLikes: { limit: number; usedToday: number };
  boost: { activeUntil: string | null; nextAvailableAt: string | null; minutes: number };
  travel: { placeId: string; label: string } | null;
}

/** Premium extras for paid plans: badge, Boost, more Super Likes, priority likes, advanced filters, Travel mode. */
export const usePremiumStore = defineStore('premium', () => {
  const overview = ref<PremiumOverview | null>(null);
  const isPremium = computed(() => Boolean(overview.value?.isPremium));

  async function load() {
    try {
      overview.value = (await api.get('/users/me/premium', { silent: true })).data.data;
    } catch {
      // Without it the app simply shows the free options.
    }
    return overview.value;
  }

  async function boost() {
    overview.value = (await api.post('/users/me/premium/boost')).data.data;
  }

  async function setTravel(placeId: string) {
    overview.value = (await api.put('/users/me/premium/travel', { placeId })).data.data;
  }

  async function clearTravel() {
    overview.value = (await api.delete('/users/me/premium/travel')).data.data;
  }

  function reset() {
    overview.value = null;
  }

  return { overview, isPremium, load, boost, setTravel, clearTravel, reset };
});
