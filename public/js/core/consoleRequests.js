import { tText } from './i18n.js';
import { apiErrorMessage } from './api.js';
import { uiToast } from './dialogs.js';

function leaveIfSignedOut(result) {
  if (result.status !== 401) return false;
  uiToast(tText('common.access_denied'));
  location.href = '/';
  return true;
}

export async function run(call, fallbackKey = 'common.error') {
  const result = await call;
  if (leaveIfSignedOut(result)) return null;
  if (!result.ok) uiToast(apiErrorMessage(result.data, fallbackKey));
  return result.ok ? result.data ?? {} : null;
}

export const listOf = async (call) => (await run(call)) ?? [];
