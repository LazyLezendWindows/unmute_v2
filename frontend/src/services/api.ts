import axios, { InternalAxiosRequestConfig } from 'axios';
import { begin } from './activity';
import { API_BASE_URL } from '../config';

/** API error carrying the HTTP status so callers can distinguish auth failures from other errors. */
export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}

let unauthorizedHandler: (() => void) | null = null;

/** Registered by the auth store so an expired/revoked session anywhere resets auth state. */
export function onUnauthorized(handler: () => void): void {
  unauthorizedHandler = handler;
}

export const api = axios.create({
  baseURL: API_BASE_URL,
  // The session lives in an HttpOnly cookie set by the backend; JS never sees the token.
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Every request feeds the global loader; `silent: true` opts out (e.g. background polling).
declare module 'axios' {
  interface AxiosRequestConfig {
    silent?: boolean;
  }
}

type TrackedConfig = InternalAxiosRequestConfig & { endActivity?: () => void };

api.interceptors.request.use((config: TrackedConfig) => {
  if (!config.silent) config.endActivity = begin();
  return config;
});

api.interceptors.response.use(
  (response) => {
    (response.config as TrackedConfig).endActivity?.();
    return response;
  },
  (error) => {
    (error.config as TrackedConfig | undefined)?.endActivity?.();
    const status: number | undefined = error.response?.status;
    // Server faults carry no useful detail for users; client errors (4xx) explain what to fix.
    const message = !error.response
      ? 'Unable to reach Unmute. Check your connection.'
      : status !== undefined && status >= 500
        ? 'Something went wrong on our side. Please try again.'
        : error.response.data?.error || error.response.data?.message || 'Something went wrong. Please try again.';

    if (status === 401 && !String(error.config?.url || '').startsWith('/auth/')) {
      unauthorizedHandler?.();
    }

    return Promise.reject(new ApiError(message, status));
  }
);
