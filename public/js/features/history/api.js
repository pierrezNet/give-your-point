import { authFetch } from '../../core/session.js';

export async function fetchHistory(userId) {
  const response = await authFetch(`/api/users/${encodeURIComponent(userId)}/history`).catch(() => null);
  return response?.ok ? response.json() : null;
}
