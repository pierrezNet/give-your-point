import { authFetch, postJson } from '../../core/session.js';

export async function fetchInviteUrl() {
  const response = await authFetch('/api/admin/invite-link').catch(() => null);
  return response?.ok ? (await response.json()).url : null;
}

export async function sendInvite(email) {
  return (await postJson('/api/admin/invite', { email })).ok;
}
