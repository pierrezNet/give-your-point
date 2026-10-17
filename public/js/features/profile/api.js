import { postJson } from '../../core/session.js';

export async function saveEmail(email) {
  const response = await postJson('/api/me', { email }, 'PATCH');
  return { ok: response.ok, body: await response.json().catch(() => ({})) };
}
