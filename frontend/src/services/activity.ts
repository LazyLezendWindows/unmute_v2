import { computed, ref } from 'vue';

/**
 * Counts work the person is waiting on (API requests and page loads) so one global loader can show
 * while any of it is in flight. Every `begin()` must be paired with the function it returns.
 */
const pending = ref(0);

export const isBusy = computed(() => pending.value > 0);

export function begin(): () => void {
  pending.value++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    pending.value = Math.max(0, pending.value - 1);
  };
}
