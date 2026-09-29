<template>
  <div class="verif-page">
    <div class="page-head">
      <div>
        <h1 class="page-title">Verifications</h1>
        <p class="page-sub">Compare each submission with the member's profile photos. Images are deleted after your decision.</p>
      </div>
      <span v-if="items.length" class="pending-badge">{{ items.length }} pending</span>
    </div>

    <p v-if="error" class="error-banner" role="alert"><i class="ri-error-warning-fill"></i> {{ error }}</p>

    <div v-if="loading" class="loading-state">
      <i class="ri-loader-4-line spin" aria-hidden="true"></i> Loading…
    </div>

    <div v-else-if="!items.length" class="empty-state">
      <i class="ri-shield-check-fill" aria-hidden="true"></i>
      <p>All caught up — nothing is waiting for review.</p>
    </div>

    <article v-for="item in items" :key="item.id" class="review-card">
      <header class="review-header">
        <UAvatar :src="item.user.avatarUrl" :name="item.user.displayName" size="md" />
        <div class="review-meta">
          <router-link :to="`/admin/users/${item.user.id}`" class="review-name">
            {{ item.user.displayName }}, {{ item.user.age }}
          </router-link>
          <span class="review-sub">
            <span class="kind-badge" :class="item.kind === 'selfie' ? 'is-selfie' : 'is-id'">
              <i :class="item.kind === 'selfie' ? 'ri-camera-line' : 'ri-profile-line'" aria-hidden="true"></i>
              {{ item.kind === 'selfie' ? 'Selfie' : 'Government ID' }}
            </span>
            · {{ when(item.submittedAt) }}
          </span>
        </div>
      </header>

      <div v-if="item.gesture" class="gesture-pill">
        <i class="ri-hand-coin-line" aria-hidden="true"></i> Asked to: <strong>{{ item.gesture }}</strong>
      </div>

      <div class="images-grid">
        <figure class="img-figure is-submitted">
          <img :src="`${API_BASE_URL}/admin/verifications/${item.id}/image`" :alt="item.kind === 'selfie' ? 'Submitted selfie' : 'Submitted ID'" />
          <figcaption>Submitted</figcaption>
        </figure>
        <figure v-for="(url, i) in [item.user.avatarUrl, ...item.user.photos].filter(Boolean).slice(0, 3)" :key="url + i" class="img-figure">
          <img :src="mediaUrl(url)" alt="Profile photo" />
          <figcaption>Profile photo {{ i + 1 }}</figcaption>
        </figure>
      </div>

      <div class="decide-row">
        <input
          v-model="reasons[item.id]"
          type="text"
          maxlength="200"
          class="reason-input"
          placeholder="Reason if rejecting (shown to the member)"
          :aria-label="`Rejection reason for ${item.user.displayName}`"
        />
        <button type="button" class="decide-btn is-reject" :disabled="busy === item.id" @click="decide(item.id, false)">
          <i class="ri-close-line" aria-hidden="true"></i> Reject
        </button>
        <button type="button" class="decide-btn is-approve" :disabled="busy === item.id" @click="decide(item.id, true)">
          <i class="ri-check-line" aria-hidden="true"></i> Approve
        </button>
      </div>
    </article>
  </div>
</template>

<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import UAvatar from '../../components/ui/UAvatar.vue';
import { adminApi } from '../../services/adminApi';
import { mediaUrl } from '../../services/media';
import { API_BASE_URL } from '../../config';
import { useToastStore } from '../../stores/toast';

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
  try { items.value = (await adminApi.get('/verifications')).data.data; }
  catch (err: any) { error.value = err.message; }
  finally { loading.value = false; }
}

async function decide(id: string, approve: boolean) {
  busy.value = id;
  try {
    await adminApi.post(`/verifications/${id}/decision`, { approve, ...(approve ? {} : { reason: reasons[id]?.trim() || undefined }) });
    items.value = items.value.filter((i) => i.id !== id);
    useToastStore().success(approve ? 'Approved.' : 'Rejected.');
  } catch (err: any) { useToastStore().error(err.message); }
  finally { busy.value = null; }
}

function when(iso: string) {
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString([], { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
}

onMounted(load);
</script>

<style scoped lang="scss">
.verif-page { max-width: 64rem; }

.page-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.page-title { margin: 0; font-size: 1.75rem; font-weight: 800; color: #1d1633; }
.page-sub   { margin: 0.15rem 0 0; color: #8b8499; font-size: 0.9rem; max-width: 44rem; }

.pending-badge {
  flex-shrink: 0;
  padding: 0.35rem 0.9rem;
  border-radius: 9999px;
  background: #fbe4f2;
  color: #c00078;
  font-size: 0.82rem;
  font-weight: 700;
}

.error-banner {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 1rem;
  padding: 0.75rem 1rem;
  border-radius: 0.75rem;
  background: #fde7e9;
  color: #c62839;
  font-size: 0.9rem;
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 2rem;
  color: #8b8499;
}

.spin { animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  padding: 3rem 2rem;
  border-radius: 1.1rem;
  background: #fff;
  border: 1px solid #ece7f5;
  text-align: center;
  color: #5b5470;

  i { font-size: 2.5rem; color: #137a3a; }
  p { margin: 0; font-size: 0.95rem; }
}

.review-card {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.25rem;
  padding: 1.25rem;
  border: 1px solid #ece7f5;
  border-radius: 1.25rem;
  background: #fff;
}

.review-header {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.review-meta { display: flex; flex-direction: column; gap: 0.2rem; }
.review-name { font-weight: 800; color: #1d1633; text-decoration: none; font-size: 1.05rem; &:hover { color: #7c3aed; } }
.review-sub  { display: flex; align-items: center; gap: 0.4rem; color: #8b8499; font-size: 0.82rem; }

.kind-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;

  &.is-selfie { background: #e2effe; color: #1d6fd8; }
  &.is-id     { background: #fbe4f2; color: #c00078; }
}

.gesture-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 0.9rem;
  border-radius: 0.75rem;
  background: #fbe9f5;
  color: #5b5470;
  font-size: 0.88rem;

  i { color: #e0147c; }
}

.images-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
  gap: 0.75rem;
}

.img-figure {
  margin: 0;

  img {
    width: 100%;
    aspect-ratio: 3 / 4;
    object-fit: cover;
    border-radius: 0.9rem;
    background: #f4f0fa;
    display: block;
  }

  figcaption {
    margin-top: 0.3rem;
    font-size: 0.72rem;
    color: #8b8499;
    text-align: center;
  }

  &.is-submitted img {
    outline: 3px solid #c00078;
    outline-offset: 2px;
  }
}

.decide-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}

.reason-input {
  flex: 1 1 14rem;
  min-height: 2.6rem;
  padding: 0 1rem;
  border: 1px solid #e4dcef;
  border-radius: 0.75rem;
  background: #faf8fd;
  color: #1d1633;
  font-size: 0.88rem;
  outline: none;
  transition: border-color 0.12s;

  &:focus { border-color: #7c3aed; }
  &::placeholder { color: #b0a8c4; }
}

.decide-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.6rem 1.2rem;
  border: 0;
  border-radius: 0.75rem;
  font-weight: 700;
  font-size: 0.9rem;
  transition: opacity 0.12s;

  &:disabled { opacity: 0.55; }
  &.is-approve { background: #137a3a; color: #fff; }
  &.is-reject  { background: #fde7e9; color: #c62839; }
}
</style>
