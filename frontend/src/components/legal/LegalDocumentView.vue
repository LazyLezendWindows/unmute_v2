<template>
  <article class="legal-doc">
    <p class="legal-updated">Last updated {{ LEGAL_UPDATED }}</p>
    <p class="legal-intro">{{ doc.intro }}</p>
    <section v-for="section in doc.sections" :key="section.heading" class="legal-section">
      <h2>{{ section.heading }}</h2>
      <p v-for="(p, i) in section.paragraphs || []" :key="`p${i}`">{{ p }}</p>
      <ul v-if="section.bullets?.length">
        <li v-for="(b, i) in section.bullets" :key="`b${i}`">{{ b }}</li>
      </ul>
    </section>
  </article>
</template>

<script setup lang="ts">
import { LEGAL_UPDATED, type LegalDocument } from '../../content/legal';

defineProps<{ doc: LegalDocument }>();
</script>

<style scoped lang="scss">
.legal-doc {
  color: var(--unmute-text-secondary);
  font-size: 0.92rem;
  line-height: 1.6;

  p { margin: 0 0 0.6rem; }
}

.legal-updated {
  font-size: 0.8rem;
  color: var(--unmute-text-dim);
}

.legal-intro {
  color: var(--unmute-text-heading);
}

.legal-section {
  margin-top: 1.25rem;

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    font-weight: 800;
    color: var(--unmute-text-heading);
  }

  ul {
    margin: 0;
    padding-left: 1.2rem;
  }

  li + li { margin-top: 0.35rem; }
}
</style>
