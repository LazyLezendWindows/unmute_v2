/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, any>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_APP_NAME?: string;
  readonly VITE_GOOGLE_CLIENT_ID?: string;
  /** Shown in the Terms of Service and Privacy Policy. */
  readonly VITE_LEGAL_ENTITY?: string;
  readonly VITE_LEGAL_ADDRESS?: string;
  readonly VITE_SUPPORT_EMAIL?: string;
  /** Android/iOS builds don't sell plans unless this is 'razorpay' (only if your store listing allows it). */
  readonly VITE_NATIVE_PURCHASES?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

