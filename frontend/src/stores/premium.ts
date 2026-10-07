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
  let generation = 0;

  async function apply(request: Promise<{ data: { data: PremiumOverview } }>) {
    const requestGeneration = generation;
    const res = await request;
    if (requestGeneration === generation) overview.value = res.data.data;
  }

  async function load() {
    try {
      await apply(api.get('/users/me/premium', { silent: true }));
    } catch {
      // Without it the app simply shows the free options.
    }
    return overview.value;
  }

  async function boost() {
    await apply(api.post('/users/me/premium/boost'));
  }

  async function setTravel(placeId: string) {
    await apply(api.put('/users/me/premium/travel', { placeId }));
  }

  async function clearTravel() {
    await apply(api.delete('/users/me/premium/travel'));
  }

  function reset() {
    generation++;
    overview.value = null;
  }

  return { overview, isPremium, load, boost, setTravel, clearTravel, reset };
});
