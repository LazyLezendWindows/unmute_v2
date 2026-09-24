import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { begin } from '../services/activity';

const router = createRouter({
  history: createWebHistory(),
  // Hash links (e.g. Settings → Blocked users) land on their section; other pages start at the top.
  scrollBehavior: (to, _from, saved) => saved || (to.hash ? { el: to.hash, top: 80 } : { top: 0 }),
  routes: [
    {
      path: '/',
      // Unauthenticated visitors are sent on to /welcome by the guard below.
      redirect: '/discover',
    },
    {
      path: '/welcome',
      name: 'welcome',
      component: () => import('../pages/WelcomePage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/login',
      name: 'login',
      component: () => import('../pages/LoginPage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/register',
      name: 'register',
      component: () => import('../pages/RegisterPage.vue'),
      meta: { guestOnly: true },
    },
    {
      path: '/discover',
      name: 'discover',
      component: () => import('../pages/DiscoverPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/matches',
      name: 'matches',
      component: () => import('../pages/MatchesPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/chat/:id?',
      name: 'chat',
      component: () => import('../pages/ChatPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/chat/:id/call',
      name: 'call',
      component: () => import('../pages/CallPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/discover/filters',
      name: 'discover-filters',
      component: () => import('../pages/FiltersPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/people/:id',
      name: 'person',
      component: () => import('../pages/PersonPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile',
      name: 'profile',
      component: () => import('../pages/ProfilePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile/edit',
      name: 'profile-edit',
      component: () => import('../pages/EditProfilePage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile/interests',
      name: 'profile-interests',
      component: () => import('../pages/InterestsPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/profile/location',
      name: 'profile-location',
      component: () => import('../pages/LocationPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/safety',
      name: 'safety',
      component: () => import('../pages/SafetyPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../pages/SettingsPage.vue'),
      meta: { requiresAuth: true },
    },
    {
      path: '/settings/appearance',
      name: 'settings-appearance',
      component: () => import('../pages/AppearancePage.vue'),
      meta: { requiresAuth: true },
    },
  ],
});

// Navigation guard: wait for the backend's session answer before rendering any route (no auth flicker).
// Page changes (lazy-loaded page code, the session check) show the global loader too.
let endNavigation: (() => void) | null = null;
router.beforeEach(() => {
  endNavigation?.();
  endNavigation = begin();
});
router.afterEach(() => {
  endNavigation?.();
  endNavigation = null;
});
router.onError(() => {
  endNavigation?.();
  endNavigation = null;
});

router.beforeEach(async (to) => {
  const authStore = useAuthStore();
  await authStore.ensureSession();

  if (to.meta.requiresAuth && !authStore.isAuthenticated) {
    // Opening the app lands on the welcome screen; a deep link asks to sign in and comes back.
    if (to.fullPath === '/discover') return '/welcome';
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (to.meta.guestOnly && authStore.isAuthenticated) {
    return '/discover';
  }
  return true;
});

export default router;

