import { apiRequest } from '../../core/api.js';

const userUrl = (userId, action = '') => `/api/admin/users/${encodeURIComponent(userId)}${action}`;

export const adminApi = {
  members: () => apiRequest('/api/admin/users'),
  activeDares: () => apiRequest('/api/admin/dares'),
  teamCategories: () => apiRequest('/api/categories'),
  spammers: () => apiRequest('/api/admin/spammers'),
  inviteLink: () => apiRequest('/api/admin/invite-link'),
  regenerateInvite: () => apiRequest('/api/admin/regenerate-invite', { method: 'POST' }),
  sendInvite: (email) => apiRequest('/api/admin/invite', { method: 'POST', body: { email } }),

  addMember: (member) => apiRequest('/api/admin/users', { method: 'POST', body: member }),
  deactivateMember: (userId) => apiRequest(userUrl(userId), { method: 'DELETE' }),
  restoreMember: (userId) => apiRequest(userUrl(userId, '/restore'), { method: 'PATCH' }),
  rejectMember: (userId) => apiRequest(userUrl(userId, '/reject'), { method: 'DELETE' }),
  magicLink: (userId) => apiRequest(userUrl(userId, '/magic-link'), { method: 'POST' }),
  regenerateLink: (userId) => apiRequest(userUrl(userId, '/regenerate-link'), { method: 'POST' }),
  resendLink: (userId) => apiRequest(userUrl(userId, '/resend-link'), { method: 'POST' }),
  pardonSpammer: (userId) => apiRequest(userUrl(userId, '/pardon-spammer'), { method: 'POST' }),
  clearDare: (userId, categoryId) => apiRequest(`/api/admin/clear-category/${encodeURIComponent(userId)}/${encodeURIComponent(categoryId)}`, { method: 'POST' }),

  badges: () => apiRequest('/api/admin/categories'),
  addBadge: (badge) => apiRequest('/api/admin/categories', { method: 'POST', body: badge }),
  deactivateBadge: (categoryId) => apiRequest(`/api/admin/categories/${encodeURIComponent(categoryId)}`, { method: 'DELETE' }),
  restoreBadge: (categoryId) => apiRequest(`/api/admin/categories/${encodeURIComponent(categoryId)}/restore`, { method: 'PATCH' }),

  rules: () => apiRequest('/api/admin/rules'),
  addRule: (rule) => apiRequest('/api/admin/rules', { method: 'POST', body: rule }),
  updateRule: (ruleId, rule) => apiRequest(`/api/admin/rules/${encodeURIComponent(ruleId)}`, { method: 'PATCH', body: rule }),
  deleteRule: (ruleId) => apiRequest(`/api/admin/rules/${encodeURIComponent(ruleId)}`, { method: 'DELETE' }),

  dareLog: () => apiRequest('/api/admin/dare-log'),
  deleteDareLog: (entryId) => apiRequest(`/api/admin/dare-log/${encodeURIComponent(entryId)}`, { method: 'DELETE' }),
  pointsLog: () => apiRequest('/api/admin/points-log'),
  deletePoint: (pointId) => apiRequest(`/api/admin/points/${encodeURIComponent(pointId)}`, { method: 'DELETE' }),
};
