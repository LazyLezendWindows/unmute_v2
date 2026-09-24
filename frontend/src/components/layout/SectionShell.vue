<template>
  <div class="section-shell w-100" :class="{ 'has-aside': $slots.aside }">
    <!-- Web: the section's menu on the left, the page on the right. Phones: the page alone.
         (Comments stay inside the root: a second root node breaks the page transition in dev builds.) -->
    <aside v-if="$slots.aside" class="section-aside d-none d-lg-block">
      <slot name="aside" />
    </aside>
    <div class="section-main min-w-0">
      <slot />
    </div>
  </div>
</template>

<style scoped lang="scss">
.section-shell {
  max-width: 36rem;
  margin: 0 auto;

  @media (min-width: 992px) {
    &.has-aside {
      max-width: 64rem;
      display: grid;
      grid-template-columns: 20rem minmax(0, 1fr);
      gap: 2rem;
      align-items: start;

      // The menu beside the page replaces the phone back arrow.
      :deep(.page-back) {
        display: none;
      }
    }
  }
}

.section-aside {
  position: sticky;
  top: 2rem;
}
</style>
