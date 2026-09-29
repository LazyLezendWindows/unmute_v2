import axios from 'axios';
import { API_BASE_URL } from '../config';
import { begin } from './activity';
import { ApiError } from './api';

/** The admin panel's API: its own session cookie (sent only to /api/v1/admin). */
export const adminApi = axios.create({ baseURL: `${API_BASE_URL}/admin`, withCredentials: true, timeout: 20_000 });

let onSignedOut: (() => void) | null = null;
/** Called when the admin session ends (expired or signed out elsewhere). */
export function onAdminSignedOut(handler: () => void) {
  onSignedOut = handler;
}

adminApi.interceptors.request.use((config) => {
  (config as any).endActivity = begin();
  return config;
});

adminApi.interceptors.response.use(
  (res) => {
    (res.config as any).endActivity?.();
    return res;
  },
  (error) => {
    (error.config as any)?.endActivity?.();
    const status: number | undefined = error.response?.status;
    if (status === 401 && !String(error.config?.url || '').startsWith('/login')) onSignedOut?.();
    const message = !error.response
      ? 'Unable to reach the server. Check your connection.'
      : error.response.data?.error || 'Something went wrong. Please try again.';
    return Promise.reject(new ApiError(message, status));
  }
);

export interface AdminUser {
  id: string;
  email: string;
  name: string;
}

/** Whether the panel still needs its first admin (and whether that needs the server's setup code). */
export async function adminSetupInfo(): Promise<{ needsSetup: boolean; setupRequiresCode: boolean }> {
  try {
    const d = (await adminApi.get('/session')).data.data;
    return { needsSetup: Boolean(d.needsSetup), setupRequiresCode: Boolean(d.setupRequiresCode) };
  } catch {
    return { needsSetup: false, setupRequiresCode: false };
  }
}

export async function adminSession(): Promise<AdminUser | null> {
  try {
    return (await adminApi.get('/session')).data.data.admin;
  } catch {
    return null;
  }
}
