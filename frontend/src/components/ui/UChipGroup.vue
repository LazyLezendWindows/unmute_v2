<template>
  <div
    class="u-chip-group d-flex flex-wrap gap-2"
    role="radiogroup"
    :aria-label="label"
    :aria-disabled="disabled || undefined"
    @keydown="onKeydown"
  >
    <button
      v-for="(option, index) in options"
      :key="String(option.value)"
      ref="buttons"
      type="button"
      role="radio"
      :aria-checked="option.value === modelValue"
      :tabindex="index === focusIndex ? 0 : -1"
      :disabled="disabled || option.disabled"
      :title="option.title"
      class="chip user-select-none"
      :class="{ 'chip-selected': option.value === modelValue }"
      @click="choose(option.value)"
    >
      {{ option.label }}
    </button>
  </div>
</template>

<script setup lang="ts" generic="V extends string | number | null">
import { computed, ref } from 'vue';

export interface ChipOption<Value> {
  value: Value;
  label: string;
  title?: string;
  disabled?: boolean;
}

const props = defineProps<{
  modelValue: V;
  options: ChipOption<V>[];
  /** Accessible name for the group. */
  label: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{ (e: 'update:modelValue', value: V): void }>();

const buttons = ref<HTMLButtonElement[]>([]);

// Roving tabindex: the group is one tab stop; arrow keys move between options.
const focusIndex = computed(() => {
  const selected = props.options.findIndex((o) => o.value === props.modelValue);
  return selected >= 0 ? selected : 0;
});

function choose(value: V) {
  if (value !== props.modelValue) emit('update:modelValue', value);
}

function onKeydown(event: KeyboardEvent) {
  const delta = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0;
  if (!delta) return;
  event.preventDefault();
  const enabled = props.options.map((o, i) => ({ o, i })).filter(({ o }) => !o.disabled);
  if (!enabled.length) return;
  const current = enabled.findIndex(({ i }) => i === focusIndex.value);
  const next = enabled[(current + delta + enabled.length) % enabled.length];
  choose(next.o.value);
  buttons.value[next.i]?.focus();
}
</script>
