import { authFetch } from '../../core/session.js';

export async function fetchTeamsActivity() {
  const response = await authFetch('/api/company/teams-activity').catch(() => null);
  return response?.ok ? response.json() : null;
}
