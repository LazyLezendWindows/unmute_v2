import { beforeEach, describe, expect, it, vi } from 'vitest';
import { flushPromises, mount } from '@vue/test-utils';
import { reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';
import PersonPage from '../../src/pages/PersonPage.vue';
import MatchesPage from '../../src/pages/MatchesPage.vue';
import EditProfilePage from '../../src/pages/EditProfilePage.vue';
import PhotosPage from '../../src/pages/PhotosPage.vue';

const state = vi.hoisted(() => ({ auth: null as any, chat: null as any, discover: null as any }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), show: vi.fn() }));
const uploadPhoto = vi.hoisted(() => vi.fn());
vi.mock('../../src/stores/auth', () => ({ useAuthStore: () => state.auth }));
vi.mock('../../src/stores/chat', () => ({ useChatStore: () => state.chat }));
vi.mock('../../src/stores/discover', () => ({ useDiscoverStore: () => state.discover }));
vi.mock('../../src/stores/toast', () => ({ useToastStore: () => toast }));
vi.mock('../../src/services/api', () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock('../../src/services/media', async (original) => ({ ...await original<object>(), uploadPhoto }));

const stubs = {
  ScreenBar: true,
  PageHeader: true,
  SetupProgress: true,
  EducationPicker: true,
  UModal: true,
  SafetyModal: { props: ['isOpen', 'targetUserId'], template: '<div v-if="isOpen" data-test="safety">{{ targetUserId }}</div>' },
};

function person(id = 'person-1', name = 'Alex') {
  return {
    id, displayName: name, age: 26, bio: '', avatarUrl: '/main.jpg',
    photos: ['/one.jpg', '/two.jpg', '/three.jpg', '/four.jpg', '/five.jpg', '/six.jpg'],
    interests: [], interactionPreferences: [], distanceKm: null, isOnline: false,
  };
}

async function routerAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }, { path: '/people/:id', component: PersonPage }],
  });
  await router.push(path);
  await router.isReady();
  return router;
}

beforeEach(() => {
  vi.clearAllMocks();
  uploadPhoto.mockReset();
  localStorage.clear();
  state.auth = reactive({ user: { id: 'viewer' }, profile: person('viewer', 'You'), updateProfile: vi.fn(async () => {}) });
  state.chat = reactive({
    matches: [], likedProfiles: [], likesReceived: [], matchesLoading: false, likedLoading: false,
    loadMatches: vi.fn(async () => {}), loadLikedProfiles: vi.fn(async () => {}),
  });
  state.discover = reactive({ feed: [], loadFeed: vi.fn(async () => {}) });
});

describe('profile navigation and photos', () => {
  it('reaches every gallery photo and returns to the main photo', async () => {
    state.discover.feed = [person()];
    const router = await routerAt('/people/person-1');
    const wrapper = mount(PersonPage, { global: { plugins: [router], stubs } });
    for (let index = 1; index <= 6; index++) {
      await wrapper.get('[aria-label="Next photo"]').trigger('click');
      expect(wrapper.get('.photo-count').text()).toBe(`${index + 1}/7`);
      expect(wrapper.get('.gallery-main').attributes('style')).toContain(person().photos[index - 1]);
    }
    await wrapper.get('[aria-label="Next photo"]').trigger('click');
    expect(wrapper.get('.photo-count').text()).toBe('1/7');
    await wrapper.get('[aria-label="Previous photo"]').trigger('click');
    expect(wrapper.get('.photo-count').text()).toBe('7/7');
    wrapper.unmount();
  });

  it('opens a liked profile that is no longer in Discover', async () => {
    state.chat.likedProfiles = [{ ...person(), distanceKm: undefined }];
    const router = await routerAt('/people/person-1');
    const wrapper = mount(PersonPage, { global: { plugins: [router], stubs } });
    await flushPromises();
    expect(wrapper.get('h1').text()).toContain('Alex');
    expect(wrapper.text()).not.toContain('km away');
    expect(router.currentRoute.value.path).toBe('/people/person-1');
    wrapper.unmount();
  });

  it('reloads profile sources when opening a profile URL directly', async () => {
    state.discover.loadFeed.mockImplementation(async () => { state.discover.feed = [person()]; });
    const router = await routerAt('/people/person-1');
    const wrapper = mount(PersonPage, { global: { plugins: [router], stubs } });
    await flushPromises();
    expect(state.discover.loadFeed).toHaveBeenCalledOnce();
    expect(wrapper.get('h1').text()).toContain('Alex');
    expect(router.currentRoute.value.path).toBe('/people/person-1');
    wrapper.unmount();
  });

  it('resets the gallery when another profile uses the same page instance', async () => {
    state.discover.feed = [person(), { ...person('person-2', 'Sam'), photos: [] }];
    const router = await routerAt('/people/person-1');
    const wrapper = mount(PersonPage, { global: { plugins: [router], stubs } });
    await wrapper.get('[aria-label="Next photo"]').trigger('click');
    await router.push('/people/person-2');
    expect(wrapper.get('h1').text()).toContain('Sam');
    expect(wrapper.get('.photo-count').text()).toBe('1/1');
    wrapper.unmount();
  });

  it('opens the match safety dialog without navigating to the profile', async () => {
    state.chat.matches = [{ matchId: 'match-1', conversationId: 'chat-1', user: person(), lastMessage: null }];
    const router = await routerAt('/matches');
    const wrapper = mount(MatchesPage, { global: { plugins: [router], stubs } });
    const button = wrapper.get('[aria-label="Report or block Alex"]');
    await button.trigger('keydown', { key: 'Enter' });
    await button.trigger('click');
    await flushPromises();
    expect(router.currentRoute.value.path).toBe('/matches');
    expect(wrapper.get('[data-test="safety"]').text()).toBe('person-1');
    wrapper.unmount();
  });

  it('retains a photo after a failed removal and prevents overlapping saves', async () => {
    let rejectRemoval: (error: Error) => void = () => {};
    state.auth.updateProfile.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectRemoval = reject; }));
    const router = await routerAt('/profile/edit');
    const wrapper = mount(EditProfilePage, { global: { plugins: [router], stubs } });
    await wrapper.get('[aria-label="Remove photo 1"]').trigger('click');
    expect(wrapper.get('.save-btn').attributes('disabled')).toBeDefined();
    expect(wrapper.get('[aria-label="Remove photo 2"]').attributes('disabled')).toBeDefined();
    rejectRemoval(new Error('Offline'));
    await flushPromises();
    expect(wrapper.findAll('.photo-remove')).toHaveLength(6);
    expect(wrapper.get('.photo-slot').attributes('style')).toContain('/one.jpg');
    expect(toast.error).toHaveBeenCalledWith('Photo not removed. Offline');
    await wrapper.get('[aria-label="Remove photo 1"]').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('.photo-remove')).toHaveLength(5);
    expect(wrapper.get('.photo-slot').attributes('style')).toContain('/two.jpg');
    wrapper.unmount();
  });

  it.each([EditProfilePage, PhotosPage])('keeps successful uploads when another selected photo fails', async (page) => {
    state.auth.profile.photos = [];
    uploadPhoto.mockResolvedValueOnce('/uploaded.jpg').mockRejectedValueOnce(new Error('Upload failed'));
    const router = await routerAt('/profile/photos');
    const wrapper = mount(page, { global: { plugins: [router], stubs } });
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', { value: [
      new File(['image'], 'good.jpg', { type: 'image/jpeg' }),
      new File(['image'], 'failed.jpg', { type: 'image/jpeg' }),
    ] });
    await input.trigger('change');
    await flushPromises();
    expect(state.auth.updateProfile).toHaveBeenCalledWith({ avatarUrl: '/main.jpg', photos: ['/uploaded.jpg'] });
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('failed.jpg'));
    wrapper.unmount();
  });
});
