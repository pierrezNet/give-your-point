import { fetchCurrentUser } from '../../core/session.js';
import { tText } from '../../core/i18n.js';
import { apiErrorMessage } from '../../core/api.js';
import { openModal, uiConfirm, uiToast } from '../../core/dialogs.js';
import { registerActions } from '../../core/actions.js';
import { saveEmail } from './api.js';
import { profileHtml } from './view.js';
import { canAskForPush, enablePushNotifications } from '../push/controller.js';

let profileModal = null;

async function submitEmail(email) {
  const errorLine = document.getElementById('profile-error');
  errorLine.classList.add('hidden');
  const result = await saveEmail(email);
  if (!result.ok) {
    errorLine.textContent = apiErrorMessage(result.body, 'profile.error_save');
    errorLine.classList.remove('hidden');
    return;
  }
  profileModal?.close();
  uiToast(tText(email ? 'profile.toast_verify' : 'profile.toast_removed'), 'success');
}

async function showProfile() {
  const me = await fetchCurrentUser();
  if (!me) return;
  profileModal = openModal({ id: 'profile-modal', content: profileHtml(me.email || '', { canAskForPush: canAskForPush() }) });
  document.getElementById('profile-form').addEventListener('submit', (event) => {
    event.preventDefault();
    submitEmail(document.getElementById('profile-email').value.trim());
  });
}

export function startProfile() {
  registerActions({
    'show-profile': showProfile,
    'enable-push': async (button) => {
      const enabled = await enablePushNotifications().catch(() => false);
      button.remove();
      uiToast(tText(enabled ? 'profile.push_enabled' : 'profile.push_refused'), enabled ? 'success' : 'info');
    },
    'remove-profile-email': async () => {
      if (await uiConfirm(tText('profile.confirm_remove'))) await submitEmail('');
    },
  });
}
