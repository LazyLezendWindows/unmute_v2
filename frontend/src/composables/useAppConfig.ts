import { ref } from 'vue';
import { api } from '../services/api';

/** Which optional services the server has switched on (from /auth/config), loaded once. */
interface AppConfig {
  googleClientId: string | null;
  phoneSignIn: boolean;
  /** GIF picker in chat (GIPHY_API_KEY on the server). */
  gifs: boolean;
}

const appConfig = ref<AppConfig | null>(null);
let loader: Promise<AppConfig | null> | null = null;

export function loadAppConfig(): Promise<AppConfig | null> {
  if (appConfig.value) return Promise.resolve(appConfig.value);
  loader ??= api
    .get('/auth/config', { silent: true })
    .then((res) => (appConfig.value = { gifs: false, phoneSignIn: false, googleClientId: null, ...res.data.data }))
    .catch(() => {
      loader = null;
      return null;
    });
  return loader;
}

export function useAppConfig() {
  void loadAppConfig();
  return appConfig;
}
