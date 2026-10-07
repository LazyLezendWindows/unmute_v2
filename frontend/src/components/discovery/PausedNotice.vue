<template>
  <div v-if="authStore.user?.isPaused" class="paused-notice" role="status">
    <i class="ri-pause-circle-line" aria-hidden="true"></i>
    <span><strong>Your profile is paused.</strong> New people can’t see you in Discover.</span>
    <button type="button" :disabled="busy" @click="resume">Unpause</button>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useAuthStore } from '../../stores/auth';
import { useToastStore } from '../../stores/toast';

const authStore = useAuthStore();
const busy = ref(false);

async function resume() {
  busy.value = true;
  try {
    await authStore.setPaused(false);
    useToastStore().success('Your profile is visible again.');
  } catch (err: any) {
    useToastStore().error(err.message || 'Could not unpause your profile.');
  } finally {
    busy.value = false;
  }
}
</script>

<style scoped lang="scss">
.paused-notice {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  margin: 0 0 0.9rem;
  padding: 0.7rem 0.9rem;
  border-radius: 1rem;
  background: #fff4dc;
  color: #6b4500;
  font-size: 0.88rem;

  i { flex-shrink: 0; font-size: 1.4rem; }
  span { flex: 1; min-width: 0; }

  button {
    flex-shrink: 0;
    padding: 0.35rem 0.9rem;
    border: 0;
    border-radius: 9999px;
    background: #6b4500;
    color: #fff;
    font-size: 0.82rem;
    font-weight: 700;
  }
}
</style>
