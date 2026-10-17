import { hasTranslation, tText } from './i18n.js';
import { authFetch, postJson } from './session.js';

export function apiErrorMessage(body, fallbackKey) {
  const key = body?.code ? `errors.${body.code}` : null;
  if (key && hasTranslation(key)) return tText(key, body.params ?? {});
  return body?.error || tText(fallbackKey);
}

export async function errorMessageOf(response, fallbackKey) {
  const body = response ? await response.json().catch(() => ({})) : {};
  return apiErrorMessage(body, fallbackKey);
}

export async function apiRequest(url, { method = 'GET', body } = {}) {
  const response = body === undefined ? await authFetch(url, { method }) : await postJson(url, body, method);
  const data = await response.json().catch(() => null);
  return { ok: response.ok, status: response.status, data };
}
