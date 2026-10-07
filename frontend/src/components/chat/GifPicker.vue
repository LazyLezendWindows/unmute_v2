<template>
  <div class="gif-picker" role="dialog" aria-label="Choose a GIF">
    <div class="gif-search">
      <i class="ri-search-line" aria-hidden="true"></i>
      <input ref="input" v-model="query" type="search" placeholder="Search GIFs" aria-label="Search GIFs" @input="debounced" />
      <button type="button" class="gif-close" aria-label="Close GIFs" @click="$emit('close')"><i class="ri-close-line" aria-hidden="true"></i></button>
    </div>
    <p v-if="error" class="gif-status" role="alert">{{ error }}</p>
    <p v-else-if="loading && !gifs.length" class="gif-status">Loading…</p>
    <p v-else-if="!gifs.length" class="gif-status">No GIFs found. Try another word.</p>
    <div class="gif-grid">
      <button v-for="gif in gifs" :key="gif.id" type="button" class="gif-cell" :aria-label="`Send GIF: ${gif.title}`" @click="$emit('pick', gif.url)">
        <img :src="gif.previewUrl" :alt="gif.title" loading="lazy" />
      </button>
    </div>
    <p class="gif-credit">Powered by GIPHY</p>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../../services/api';

defineEmits<{ (e: 'pick', url: string): void; (e: 'close'): void }>();

interface Gif { id: string; url: string; previewUrl: string; title: string }

const query = ref('');
const gifs = ref<Gif[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const input = ref<HTMLInputElement | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;
let request = 0;

async function load() {
  const mine = ++request;
  loading.value = true;
  error.value = null;
  try {
    const res = await api.get('/conversations/gifs', { params: { q: query.value.trim() || undefined }, silent: true });
    if (mine === request) gifs.value = res.data.data;
  } catch (err: any) {
    if (mine === request) error.value = err.message || 'Couldn’t load GIFs.';
  } finally {
    if (mine === request) loading.value = false;
  }
}

function debounced() {
  clearTimeout(timer);
  timer = setTimeout(load, 350);
}

onMounted(() => {
  load();
  input.value?.focus();
});
onBeforeUnmount(() => clearTimeout(timer));
</script>

<style scoped lang="scss">
.gif-picker {
  margin: 0 0.75rem 0.5rem;
  padding: 0.6rem;
  border-radius: 1.1rem;
  background: #fff;
  box-shadow: 0 12px 30px -18px rgba(117, 48, 170, 0.6);
}

.gif-search {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0 0.4rem 0 0.8rem;
  min-height: 2.6rem;
  border-radius: 9999px;
  background: #f5f1fc;
  color: #6c70b8;

  input { flex: 1; min-width: 0; border: 0; outline: none; background: transparent; color: #10106b; }
}

.gif-close { border: 0; background: transparent; color: #6c70b8; font-size: 1.2rem; }

.gif-status { margin: 0.75rem 0; text-align: center; color: #6c70b8; font-size: 0.88rem; }

.gif-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
  max-height: 14rem;
  margin-top: 0.5rem;
  overflow-y: auto;
}

.gif-cell {
  padding: 0;
  border: 0;
  border-radius: 0.6rem;
  overflow: hidden;
  background: #f5f1fc;
  aspect-ratio: 1;

  img { width: 100%; height: 100%; object-fit: cover; display: block; }
}

.gif-credit { margin: 0.35rem 0 0; text-align: right; font-size: 0.65rem; color: #9a96b8; }
</style>
