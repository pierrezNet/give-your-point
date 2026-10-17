import { fetchCurrentUser, getSessionToken } from './session.js';
import { tText } from './i18n.js';
import { uiToast } from './dialogs.js';

function leave(messageKey) {
  uiToast(tText(messageKey));
  location.href = '/';
  return null;
}

export async function requirePageRole(allowedRoles, deniedMessageKey) {
  if (!getSessionToken()) return leave('admin.connect_first');
  const me = await fetchCurrentUser();
  if (!me) return leave('admin.session_invalid');
  if (!allowedRoles.includes(me.role)) return leave(deniedMessageKey);
  return me;
}

export function revealRoleLinks(me) {
  const show = (selector) => document.querySelectorAll(selector).forEach((link) => link.classList.remove('hidden'));
  if (['superadmin', 'owner'].includes(me.role)) show('[data-requires-role="superadmin"]');
  if (me.role === 'owner') show('[data-requires-role="owner"]');
}
