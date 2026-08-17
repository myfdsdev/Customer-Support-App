import axios from 'axios';
import { resolveApiBase, toMessage } from './api';

/**
 * Membership-portal API client.
 *
 * A THIRD axios instance, separate from `api` (staff) and `supportApi`
 * (anonymous visitor). It sends the portal session cookie (withCredentials)
 * and, as a fallback for cross-site deployments where third-party cookies are
 * blocked, a bearer token kept in sessionStorage.
 */
const BASE_URL = resolveApiBase(import.meta.env.VITE_API_URL);

export const PORTAL_TOKEN_KEY = 'portal_session_token';

export const portalApi = axios.create({
  baseURL: BASE_URL,
  timeout: 45000,
  withCredentials: true, // send/receive the HTTP-only portal cookie
});

portalApi.interceptors.request.use((config) => {
  const token = sessionStorage.getItem(PORTAL_TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

portalApi.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      sessionStorage.removeItem(PORTAL_TOKEN_KEY);
    }
    error.friendlyMessage = toMessage(error);
    return Promise.reject(error);
  }
);

export const setPortalToken = (t) => t && sessionStorage.setItem(PORTAL_TOKEN_KEY, t);
export const getPortalToken = () => sessionStorage.getItem(PORTAL_TOKEN_KEY);
export const clearPortalToken = () => sessionStorage.removeItem(PORTAL_TOKEN_KEY);

const unwrap = (res) => res.data?.data;

export const portalAuthService = {
  register: (payload) => portalApi.post('/portal/auth/register', payload).then(unwrap),
  login: (payload) => portalApi.post('/portal/auth/login', payload).then(unwrap),
  logout: () => portalApi.post('/portal/auth/logout').then((r) => r.data),
  me: () => portalApi.get('/portal/auth/me').then(unwrap),
  forgotPassword: (email) => portalApi.post('/portal/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (payload) => portalApi.post('/portal/auth/reset-password', payload).then(unwrap),
  verifyEmail: (token) => portalApi.post('/portal/auth/verify-email', { token }).then(unwrap),
};

export const portalService = {
  dashboard: () => portalApi.get('/portal/dashboard').then(unwrap),
  products: () => portalApi.get('/portal/products').then(unwrap),
  refreshPurchases: () => portalApi.post('/portal/products/refresh').then(unwrap),
  product: (slug) => portalApi.get(`/portal/products/${slug}`).then(unwrap),
  launch: (productId) => portalApi.post(`/portal/products/${productId}/launch`).then(unwrap),
  supportProducts: () => portalApi.get('/portal/support/products').then(unwrap),
  startSupport: (productSlug, payload) => portalApi.post(`/portal/support/${productSlug}/start`, payload).then(unwrap),
  conversations: () => portalApi.get('/portal/conversations').then(unwrap),
  notifications: () => portalApi.get('/portal/notifications').then(unwrap),
  markNotificationRead: (id) => portalApi.patch(`/portal/notifications/${id}/read`).then(unwrap),
  markAllNotificationsRead: () => portalApi.patch('/portal/notifications/read-all').then(unwrap),
  profile: () => portalApi.get('/portal/profile').then(unwrap),
  updateProfile: (payload) => portalApi.patch('/portal/profile', payload).then(unwrap),
};

/* Admin-side integration + portal-content services (staff `api` instance). */
export { toMessage };
