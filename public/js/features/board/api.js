import { authFetch, postJson } from '../../core/session.js';

export async function fetchCategories() {
  const response = await authFetch('/api/categories');
  return response.ok ? response.json() : [];
}

export async function fetchLeaderboard() {
  const response = await authFetch('/api/users-stats');
  return response.ok ? response.json() : null;
}

export async function sendPoint({ recipientId, categoryId }) {
  const response = await postJson('/api/points', { to_user_id: String(recipientId), category_id: String(categoryId) });
  return { ok: response.ok, body: await response.json().catch(() => ({})) };
}

export async function addReason(pointId, reason) {
  const response = await postJson(`/api/points/${encodeURIComponent(pointId)}/reason`, { reason }, 'PATCH');
  return { ok: response.ok, body: await response.json().catch(() => ({})) };
}

export async function undoLastPoint() {
  return (await authFetch('/api/points/undo', { method: 'POST' })).ok;
}
