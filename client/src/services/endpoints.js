import { api, supportApi, unwrap, getAnonymousId, setSupportToken } from './api';

/* -------------------------------------------------------------------------
 * Auth
 * ---------------------------------------------------------------------- */
export const authService = {
  setupState: () => api.get('/auth/setup-state').then(unwrap),
  bootstrap: (payload) => api.post('/auth/bootstrap', payload).then(unwrap),
  login: (payload) => api.post('/auth/login', payload).then(unwrap),
  me: () => api.get('/auth/me').then(unwrap),
  logout: () => api.post('/auth/logout').then(unwrap),
  updateProfile: (payload) => api.patch('/auth/profile', payload).then(unwrap),
  changePassword: (payload) => api.patch('/auth/password', payload).then(unwrap),
  listAgents: () => api.get('/auth/agents').then(unwrap),
  listUsers: (params) => api.get('/auth/users', { params }).then(unwrap),
  createUser: (payload) => api.post('/auth/users', payload).then(unwrap),
  updateUser: (id, payload) => api.patch(`/auth/users/${id}`, payload).then(unwrap),
  deleteUser: (id) => api.delete(`/auth/users/${id}`).then(unwrap),
};

/* -------------------------------------------------------------------------
 * Products / knowledge / training
 * ---------------------------------------------------------------------- */
export const productService = {
  list: (params) => api.get('/products', { params }).then(unwrap),
  get: (id) => api.get(`/products/${id}`).then(unwrap),
  create: (payload) => api.post('/products', payload).then(unwrap),
  update: (id, payload) => api.patch(`/products/${id}`, payload).then(unwrap),
  remove: (id, force) => api.delete(`/products/${id}`, { params: { force } }).then(unwrap),
  setAgents: (id, agentIds) => api.put(`/products/${id}/agents`, { agentIds }).then(unwrap),
};

export const knowledgeService = {
  list: (params) => api.get('/knowledge', { params }).then((r) => r.data),
  get: (id) => api.get(`/knowledge/${id}`).then(unwrap),
  create: (payload) => api.post('/knowledge', payload).then(unwrap),
  update: (id, payload) => api.patch(`/knowledge/${id}`, payload).then(unwrap),
  remove: (id) => api.delete(`/knowledge/${id}`).then(unwrap),
  toggle: (id) => api.patch(`/knowledge/${id}/toggle`).then(unwrap),
  categories: () => api.get('/knowledge/categories').then(unwrap),
  testRetrieval: (payload) => api.post('/knowledge/test-retrieval', payload).then(unwrap),
  reindex: (productId) => api.post('/knowledge/reindex', { productId }).then(unwrap),
};

export const trainingService = {
  list: (params) => api.get('/training', { params }).then(unwrap),
  get: (id) => api.get(`/training/${id}`).then(unwrap),
  create: (payload) => api.post('/training', payload).then(unwrap),
  update: (id, payload) => api.patch(`/training/${id}`, payload).then(unwrap),
  remove: (id) => api.delete(`/training/${id}`).then(unwrap),
  toggle: (id) => api.patch(`/training/${id}/toggle`).then(unwrap),
};

/* -------------------------------------------------------------------------
 * Inbox
 * ---------------------------------------------------------------------- */
export const conversationService = {
  list: (params) => api.get('/conversations', { params }).then((r) => r.data),
  counts: () => api.get('/conversations/counts').then(unwrap),
  get: (id) => api.get(`/conversations/${id}`).then(unwrap),
  listMessages: (id, params) => api.get(`/conversations/${id}/messages`, { params }).then(unwrap),
  update: (id, payload) => api.patch(`/conversations/${id}`, payload).then(unwrap),
  send: (id, payload) => api.post(`/conversations/${id}/messages`, payload).then(unwrap),
  sendFile: (id, formData) =>
    api
      .post(`/conversations/${id}/messages`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(unwrap),
  assign: (id, agentId) => api.post(`/conversations/${id}/assign`, { agentId }).then(unwrap),
  transfer: (id, agentId, note) => api.post(`/conversations/${id}/transfer`, { agentId, note }).then(unwrap),
  resolve: (id) => api.post(`/conversations/${id}/resolve`).then(unwrap),
  reopen: (id) => api.post(`/conversations/${id}/reopen`).then(unwrap),
  summarize: (id) => api.post(`/conversations/${id}/summarize`).then(unwrap),
  suggestReply: (id) => api.post(`/conversations/${id}/suggest-reply`).then(unwrap),
};

export const customerService = {
  list: (params) => api.get('/customers', { params }).then((r) => r.data),
  online: (params) => api.get('/customers/online', { params }).then(unwrap),
  get: (id) => api.get(`/customers/${id}`).then(unwrap),
  update: (id, payload) => api.patch(`/customers/${id}`, payload).then(unwrap),
  addNote: (id, payload) => api.post(`/customers/${id}/notes`, payload).then(unwrap),
  deleteNote: (id, noteId) => api.delete(`/customers/${id}/notes/${noteId}`).then(unwrap),
  setProduct: (id, productId, payload) => api.put(`/customers/${id}/products/${productId}`, payload).then(unwrap),
  removeProduct: (id, productId) => api.delete(`/customers/${id}/products/${productId}`).then(unwrap),
};

export const ticketService = {
  list: (params) => api.get('/tickets', { params }).then((r) => r.data),
  meta: () => api.get('/tickets/meta').then(unwrap),
  get: (id) => api.get(`/tickets/${id}`).then(unwrap),
  create: (payload) => api.post('/tickets', payload).then(unwrap),
  update: (id, payload) => api.patch(`/tickets/${id}`, payload).then(unwrap),
  addNote: (id, note) => api.post(`/tickets/${id}/notes`, { note }).then(unwrap),
  remove: (id) => api.delete(`/tickets/${id}`).then(unwrap),
};

export const announcementService = {
  list: (params) => api.get('/announcements', { params }).then((r) => r.data),
  create: (payload) => api.post('/announcements', payload).then(unwrap),
  update: (id, payload) => api.patch(`/announcements/${id}`, payload).then(unwrap),
  remove: (id) => api.delete(`/announcements/${id}`).then(unwrap),
};

export const recommendationService = {
  list: (params) => api.get('/recommendations', { params }).then((r) => r.data),
  create: (payload) => api.post('/recommendations', payload).then(unwrap),
  update: (id, payload) => api.patch(`/recommendations/${id}`, payload).then(unwrap),
  remove: (id) => api.delete(`/recommendations/${id}`).then(unwrap),
};

export const dashboardService = {
  stats: (params) => api.get('/dashboard/stats', { params }).then(unwrap),
  breakdown: (params) => api.get('/dashboard/product-breakdown', { params }).then(unwrap),
  recent: () => api.get('/dashboard/recent').then(unwrap),
  analytics: (params) => api.get('/analytics', { params }).then(unwrap),
  health: () => api.get('/health').then(unwrap),
};

/* -------------------------------------------------------------------------
 * Public customer surface
 * ---------------------------------------------------------------------- */
export const supportService = {
  home: (slug) => supportApi.get(`/support/${slug}`).then(unwrap),

  /** Opens (or resumes) the visitor session and stores the returned token. */
  async startSession(slug, currentPage) {
    const data = await supportApi
      .post(`/support/${slug}/session`, { anonymousId: getAnonymousId(), currentPage })
      .then(unwrap);
    setSupportToken(data.supportToken);
    localStorage.setItem('support_anonymous_id', data.anonymousId);
    return data;
  },

  heartbeat: (slug, payload) => supportApi.post(`/support/${slug}/session/heartbeat`, payload).then(unwrap),
  endSession: (slug) => supportApi.post(`/support/${slug}/session/end`).then(unwrap),
  identify: (slug, payload) => supportApi.post(`/support/${slug}/identify`, payload).then(unwrap),
  conversation: (slug) => supportApi.get(`/support/${slug}/conversation`).then(unwrap),
  chat: (slug, message, clientMessageId) =>
    supportApi.post(`/support/${slug}/chat`, { message, clientMessageId }).then(unwrap),
  handoff: (slug, reason) => supportApi.post(`/support/${slug}/handoff`, { reason }).then(unwrap),
  feedback: (slug, helpful) => supportApi.post(`/support/${slug}/feedback`, { helpful }).then(unwrap),
  training: (slug, params) => supportApi.get(`/support/${slug}/training`, { params }).then(unwrap),
  help: (slug, params) => supportApi.get(`/support/${slug}/help`, { params }).then(unwrap),
  article: (slug, id) => supportApi.get(`/support/${slug}/help/${id}`).then(unwrap),
  videoClick: (slug, videoId) => supportApi.post(`/support/${slug}/training/${videoId}/click`).then(unwrap),
  recommendationClick: (slug, id) => supportApi.post(`/support/${slug}/recommendations/${id}/click`).then(unwrap),
  upload: (slug, formData) =>
    supportApi
      .post(`/support/${slug}/upload`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then(unwrap),
};
