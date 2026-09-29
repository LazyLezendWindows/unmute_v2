<template>
  <div class="admin-page">
    <PageHeader title="Verifications" subtitle="Compare each submission with the member's profile photos" back="/settings" />

    <p v-if="error" class="text-danger" role="alert">{{ error }}</p>
    <p v-else-if="loading" class="u-text-muted">Loading…</p>
    <UEmptyState v-else-if="!items.length" title="All caught up" description="No selfies or IDs are waiting for review.">
      <template #icon><i class="ri-shield-check-line fs-2"></i></template>
    </UEmptyState>

    <article v-for="item in items" :key="item.id" class="review">
      <header class="review-head">
        <UAvatar :src="item.user.avatarUrl" :name="item.user.displayName" size="md" />
        <div class="min-w-0 flex-grow-1">
          <strong>{{ item.user.displayName }}, {{ item.user.age }}</strong>
          <span>{{ item.kind === 'selfie' ? 'Selfie' : 'Government ID' }} · {{ when(item.submittedAt) }}</span>
        </div>
      </header>

      <p v-if="item.gesture" class="gesture"><i class="ri-hand" aria-hidden="true"></i>Asked to: {{ item.gesture }}</p>

      <div class="images">
        <figure>
          <img :src="`/api/v1/admin/verifications/${item.id}/image`" :alt="item.kind === 'selfie' ? 'Submitted selfie' : 'Submitted ID'" />
          <figcaption>Submitted</figcaption>
        </figure>
        <figure v-for="(url, i) in [item.user.avatarUrl, ...item.user.photos].filter(Boolean).slice(0, 3)" :key="url + i">
          <img :src="mediaUrl(url)" alt="Profile photo" />
          <figcaption>Profile photo</figcaption>
        </figure>
      </div>

      <div class="decide">
        <input v-model="reasons[item.id]" type="text" maxlength="200" class="reason" placeholder="Reason if rejecting (shown to the member)" :aria-label="`Reason for ${item.user.displayName}`" />
        <UButton variant="secondary" size="md" :loading="busy === item.id" @click="decide(item.id, false)">Reject</UButton>
        <UButton variant="primary" size="md" :loading="busy === item.id" @click="decide(item.id, true)">Approve</UButton>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import PageHeader from '../components/layout/PageHeader.vue';
import UAvatar from '../components/ui/UAvatar.vue';
import UButton from '../components/ui/UButton.vue';
import UEmptyState from '../components/ui/UEmptyState.vue';
import { api } from '../services/api';
import { mediaUrl } from '../services/media';
import { useToastStore } from '../stores/toast';

interface Item {
  id: string;
  kind: 'selfie' | 'id';
  gesture: string | null;
  submittedAt: string;
  user: { id: string; displayName: string; age: number; avatarUrl: string; photos: string[] };
}

const items = ref<Item[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);
const busy = ref<string | null>(null);
const reasons = reactive<Record<string, string>>({});

async function load() {
  try {
    items.value = (await api.get('/admin/verifications')).data.data;
  } catch (err: any) {
    error.value = err.status === 404 ? 'This page is for moderators only.' : err.message;
  } finally {
    loading.value = false;
  }
}

async function decide(id: string, approve: boolean) {
  busy.value = id;
  try {
    await api.post(`/admin/verifications/${id}/decision`, { approve, ...(approve ? {} : { reason: reasons[id]?.trim() || undefined }) });
    items.value = items.value.filter((i) => i.id !== id);
    useToastStore().success(approve ? 'Approved.' : 'Rejected.');
  } catch (err: any) {
    useToastStore().error(err.message);
  } finally {
    busy.value = null;
  }
}

function when(iso: string) {
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

onMounted(load);
</script>

<style scoped lang="scss">
.admin-page {
  width: 100%;
  max-width: 48rem;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.review {
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  padding: 1rem;
  border-radius: 1.4rem;
  background: var(--unmute-surface);
  box-shadow: var(--unmute-shadow-sm);
}

.review-head {
  display: flex;
  align-items: center;
  gap: 0.75rem;

  div { display: flex; flex-direction: column; }
  strong { color: var(--unmute-text-heading); }
  span { font-size: 0.82rem; color: var(--unmute-text-muted); }
}

.gesture {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0;
  padding: 0.55rem 0.8rem;
  border-radius: 0.9rem;
  background: #fbe9f5;
  font-size: 0.88rem;
  font-weight: 600;

  i { color: var(--unmute-cta); }
}

.images {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.6rem;

  figure { margin: 0; }

  img {
    width: 100%;
    aspect-ratio: 3 / 4;
    object-fit: cover;
    border-radius: 0.9rem;
    background: #f3effc;
  }

  figure:first-child img { outline: 3px solid var(--unmute-cta); }

  figcaption {
    margin-top: 0.25rem;
    font-size: 0.75rem;
    color: var(--unmute-text-muted);
    text-align: center;
  }
}

.decide {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.reason {
  flex: 1 1 12rem;
  min-height: 2.6rem;
  padding: 0 0.9rem;
  border: 1px solid var(--unmute-input-border);
  border-radius: var(--unmute-radius-pill);
  background: var(--unmute-input-bg);
  color: var(--unmute-text-primary);
}
</style>
