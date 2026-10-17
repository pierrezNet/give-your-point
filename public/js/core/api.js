import { hasTranslation, tText } from './i18n.js';

export function apiErrorMessage(body, fallbackKey) {
  const key = body?.code ? `errors.${body.code}` : null;
  if (key && hasTranslation(key)) return tText(key, body.params ?? {});
  return body?.error || tText(fallbackKey);
}

export async function errorMessageOf(response, fallbackKey) {
  const body = response ? await response.json().catch(() => ({})) : {};
  return apiErrorMessage(body, fallbackKey);
}
