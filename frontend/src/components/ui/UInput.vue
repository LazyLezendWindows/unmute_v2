<template>
  <div class="u-input-wrapper w-100 d-flex flex-column gap-1">
    <div v-if="label || $slots.label" class="d-flex align-items-center justify-content-between">
      <label v-if="label" :for="inputId" class="form-label small fw-semibold mb-0 u-text-secondary">
        {{ label }}
        <span v-if="required" class="text-danger" aria-hidden="true">*</span>
      </label>
      <slot name="label-right" />
    </div>

    <div class="position-relative d-flex align-items-center">
      <!-- Prefix Icon -->
      <div v-if="icon" class="u-input-prefix position-absolute start-0 ms-3 pe-none d-flex align-items-center justify-content-center">
        <i v-if="typeof icon === 'string'" :class="icon" aria-hidden="true"></i>
        <component :is="icon" v-else class="u-input-icon" />
      </div>

      <input
        :id="inputId"
        :type="inputType"
        :aria-label="label ? undefined : placeholder"
        :autocomplete="autocomplete"
        :value="modelValue"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :minlength="minlength"
        :maxlength="maxlength"
        :min="min"
        :max="max"
        :aria-invalid="error ? 'true' : undefined"
        :aria-describedby="error ? errorId : hint ? hintId : undefined"
        class="u-input w-100 transition-all"
        :class="[
          icon ? 'ps-5' : 'ps-3',
          type === 'password' || $slots.suffix ? 'pe-5' : 'pe-3',
          error ? 'u-input-error' : 'u-input-normal',
          { 'opacity-50 pe-none': disabled },
        ]"
        @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
        @blur="$emit('blur', $event)"
        @focus="$emit('focus', $event)"
      />

      <!-- Show / hide password -->
      <button
        v-if="type === 'password'"
        type="button"
        class="u-input-reveal position-absolute end-0 me-2"
        :aria-label="revealed ? 'Hide password' : 'Show password'"
        :aria-pressed="revealed"
        @click="revealed = !revealed"
      >
        <i :class="revealed ? 'ri-eye-off-line' : 'ri-eye-line'" aria-hidden="true"></i>
      </button>

      <!-- Suffix icon or action -->
      <div v-else-if="$slots.suffix" class="position-absolute end-0 me-3 d-flex align-items-center">
        <slot name="suffix" />
      </div>
    </div>

    <!-- Error message -->
    <p v-if="error" :id="errorId" class="small text-danger fw-medium d-flex align-items-center gap-1 mb-0 animate-fade-in">
      <span>{{ error }}</span>
    </p>

    <!-- Hint message -->
    <p v-else-if="hint" :id="hintId" class="u-input-hint small u-text-muted mb-0">
      {{ hint }}
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, useId } from 'vue';

const props = withDefaults(
  defineProps<{
    modelValue?: string | number;
    label?: string;
    placeholder?: string;
    type?: string;
    error?: string | null;
    hint?: string;
    icon?: any;
    id?: string;
    disabled?: boolean;
    required?: boolean;
    minlength?: number;
    maxlength?: number;
    min?: string | number;
    max?: string | number;
    autocomplete?: string;
  }>(),
  {
    type: 'text',
    disabled: false,
    required: false,
  }
);

const revealed = ref(false);
const inputType = computed(() => (props.type === 'password' && revealed.value ? 'text' : props.type));

// Labels, hints and errors are tied to the input so assistive tech announces them.
const autoId = useId();
const inputId = computed(() => props.id || `${autoId}-input`);
const hintId = `${autoId}-hint`;
const errorId = `${autoId}-error`;

defineEmits<{
  (e: 'update:modelValue', value: string): void;
  (e: 'blur', event: FocusEvent): void;
  (e: 'focus', event: FocusEvent): void;
}>();
</script>

<style scoped>
.u-input {
  height: 3rem;
  font-size: 0.9rem;
  border-radius: var(--unmute-radius-sm);
  background-color: var(--unmute-input-bg);
  color: var(--unmute-text-primary);
  border: 1px solid var(--unmute-input-border);
  outline: none;
}

.u-input-prefix {
  color: var(--unmute-text-muted);
  font-size: 1.1rem;
}

.u-input-reveal {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.2rem;
  height: 2.2rem;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: var(--unmute-text-muted);
  font-size: 1.1rem;
}

.u-input::placeholder {
  color: var(--unmute-text-dim);
}

.u-input-normal:hover {
  border-color: var(--unmute-glass-border-hover);
}

.u-input-normal:focus {
  border-color: var(--unmute-primary);
  box-shadow: 0 0 0 4px var(--unmute-primary-surface);
}

.u-input-error {
  border-color: var(--unmute-danger);
}

.u-input-error:focus {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--unmute-danger) 20%, transparent);
}

.u-input-icon {
  width: 1rem;
  height: 1rem;
}

.u-input-hint {
  font-size: 0.72rem;
}
</style>

