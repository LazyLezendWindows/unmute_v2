<template>
  <SectionShell>
    <template #aside><SettingsMenu /></template>
    <div class="appearance-page d-flex flex-column gap-4 w-100">
      <PageHeader title="Appearance & Theme" back="/settings" />

      <!-- Mode -->
      <div class="mode-grid" role="radiogroup" aria-label="Theme">
        <button
          v-for="option in THEME_MODES"
          :key="option.mode"
          type="button"
          role="radio"
          class="mode-card"
          :class="{ 'is-active': themeStore.mode === option.mode }"
          :aria-checked="themeStore.mode === option.mode"
          @click="themeStore.setMode(option.mode)"
        >
          <i :class="option.icon" aria-hidden="true"></i>
          <span>{{ option.label }}</span>
        </button>
      </div>

      <!-- Accent -->
      <section class="settings-card">
        <h2 class="section-heading mb-1">Accent colour</h2>
        <p class="small mb-3 u-text-muted">Used for buttons, highlights and active tabs.</p>
        <div class="swatches" role="radiogroup" aria-label="Accent colour">
          <button
            v-for="preset in themeStore.presets"
            :key="preset.id"
            type="button"
            role="radio"
            class="swatch"
            :class="{ 'is-active': themeStore.accent === preset.id }"
            :style="{ '--swatch': preset.gradient }"
            :aria-checked="themeStore.accent === preset.id"
            :aria-label="preset.name"
            :title="preset.name"
            @click="themeStore.setAccent(preset.id)"
          >
            <i v-if="themeStore.accent === preset.id" class="ri-check-line" aria-hidden="true"></i>
          </button>
        </div>
      </section>

      <!-- Preview -->
      <section class="settings-card" aria-label="Preview">
        <h2 class="section-heading">Preview</h2>
        <div class="d-flex flex-column gap-3">
          <UButton variant="primary" size="lg" block tabindex="-1">Button</UButton>
          <UInput placeholder="Input field" icon="ri-search-line" />
          <div class="d-flex flex-wrap gap-2">
            <span class="chip chip-selected">Selected</span>
            <span class="chip">Chip</span>
          </div>
        </div>
      </section>
    </div>
  </SectionShell>
</template>

<script setup lang="ts">
import PageHeader from '../components/layout/PageHeader.vue';
import SectionShell from '../components/layout/SectionShell.vue';
import SettingsMenu from '../components/settings/SettingsMenu.vue';
import UButton from '../components/ui/UButton.vue';
import UInput from '../components/ui/UInput.vue';
import { useThemeStore, ThemeMode } from '../stores/theme';

const themeStore = useThemeStore();

const THEME_MODES: { mode: ThemeMode; label: string; icon: string }[] = [
  { mode: 'light', label: 'Light', icon: 'ri-sun-line' },
  { mode: 'dark', label: 'Dark', icon: 'ri-moon-line' },
  { mode: 'system', label: 'System', icon: 'ri-smartphone-line' },
];
</script>

<style scoped lang="scss">
.mode-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
}

.mode-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  padding: 1.1rem 0.5rem;
  border-radius: var(--unmute-radius-md);
  border: 1.5px solid var(--unmute-glass-border);
  background: var(--unmute-surface);
  color: var(--unmute-text-secondary);
  font-weight: 600;
  font-size: 0.88rem;

  i {
    font-size: 1.6rem;
  }

  &.is-active {
    border-color: var(--unmute-primary);
    color: var(--unmute-accent-text);
    background: var(--unmute-primary-surface);
  }
}

.settings-card {
  padding: 1.25rem;
  border-radius: var(--unmute-radius-lg);
  background: var(--unmute-surface);
  border: 1px solid var(--unmute-glass-border);
  box-shadow: var(--unmute-shadow-sm);
}

.section-heading {
  font-size: 0.95rem;
  font-weight: 700;
  margin-bottom: 0.9rem;
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
}

.swatch {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.75rem;
  height: 2.75rem;
  border: 0;
  border-radius: 50%;
  background: var(--swatch);
  color: #fff;
  font-size: 1.3rem;
  transition: transform var(--unmute-transition-fast);

  &:hover {
    transform: scale(1.06);
  }

  &.is-active {
    box-shadow: 0 0 0 3px var(--unmute-surface), 0 0 0 5px var(--unmute-primary);
  }
}
</style>
