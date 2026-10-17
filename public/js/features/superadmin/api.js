import { apiRequest } from '../../core/api.js';

const teamUrl = (teamId, action = '') => `/api/superadmin/teams/${encodeURIComponent(teamId)}${action}`;
const userUrl = (userId, action) => `/api/superadmin/users/${encodeURIComponent(userId)}${action}`;

export const superadminApi = {
  teams: () => apiRequest('/api/superadmin/teams'),
  createTeam: (name) => apiRequest('/api/superadmin/teams', { method: 'POST', body: { name } }),
  renameTeam: (teamId, name) => apiRequest(teamUrl(teamId), { method: 'PATCH', body: { name } }),
  deactivateTeam: (teamId) => apiRequest(teamUrl(teamId), { method: 'DELETE' }),
  restoreTeam: (teamId) => apiRequest(teamUrl(teamId, '/restore'), { method: 'PATCH' }),
  addMember: (teamId, member) => apiRequest(teamUrl(teamId, '/users'), { method: 'POST', body: member }),
  admins: () => apiRequest('/api/superadmin/admins'),
  members: () => apiRequest('/api/superadmin/users'),
  magicLink: (userId) => apiRequest(userUrl(userId, '/magic-link'), { method: 'POST' }),
  promote: (userId, role) => apiRequest(userUrl(userId, '/promote'), { method: 'POST', body: { role } }),
  demote: (userId) => apiRequest(userUrl(userId, '/demote'), { method: 'POST' }),
};
