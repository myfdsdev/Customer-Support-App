import axios from 'axios';

/**
 * Two axios instances on purpose.
 *
 * `api`        carries the staff JWT (admin console)
 * `supportApi` carries the anonymous visitor's support token
 *
 * Keeping them separate means a logged-in agent browsing a customer support
 * page never accidentally sends their staff credentials to the public API,
 * and vice versa.
 */

const BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const TOKEN_KEY = 'support_platform_token';
export const SUPPORT_TOKEN_KEY = 'support_session_token';
export const ANON_KEY = 'support_anonymous_id';

export const api = axios.create({ baseURL: BASE_URL, timeout: 45000 });
export const supportApi = axios.create({ baseURL: BASE_URL, timeout: 60000 });

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

supportApi.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(SUPPORT_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Normalises axios/network/API errors into a single readable message. */
export function toMessage(error) {
  if (error?.response?.data?.message) return error.response.data.message;
  if (error?.response?.data?.details?.length) return error.response.data.details[0].message;
  if (error?.code === 'ECONNABORTED') return 'The request timed out. Please try again.';
  if (error?.message === 'Network Error') return 'Cannot reach the server. Is the API running?';
  return error?.message || 'Something went wrong';
}

api.interceptors.response.use(
  (res) => res,
  (error) => {
    // A dead staff session should bounce to login rather than render 401s
    // in every panel — but never redirect away from a customer support page.
    if (error?.response?.status === 401 && !window.location.pathname.startsWith('/support')) {
      localStorage.removeItem(TOKEN_KEY);
      if (!window.location.pathname.startsWith('/admin/login')) {
        window.location.href = '/admin/login';
      }
    }
    error.friendlyMessage = toMessage(error);
    return Promise.reject(error);
  }
);

supportApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) sessionStorage.removeItem(SUPPORT_TOKEN_KEY);
    error.friendlyMessage = toMessage(error);
    return Promise.reject(error);
  }
);

export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

export const setSupportToken = (t) => sessionStorage.setItem(SUPPORT_TOKEN_KEY, t);
export const getSupportToken = () => sessionStorage.getItem(SUPPORT_TOKEN_KEY);
export const clearSupportToken = () => sessionStorage.removeItem(SUPPORT_TOKEN_KEY);

/** Stable per-browser id so a returning visitor keeps their history. */
export function getAnonymousId() {
  let id = localStorage.getItem(ANON_KEY);
  if (!id) {
    id = `anon_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    localStorage.setItem(ANON_KEY, id);
  }
  return id;
}

export const unwrap = (res) => res.data?.data;
