import { fetchCurrentUser, postJson } from '../core/session.js';
import { escapeHtml } from '../core/html.js';
import { t, tText } from '../core/i18n.js';
import { apiErrorMessage } from '../core/api.js';
import { closeButtonHtml, openModal, uiConfirm, uiToast } from '../core/dialogs.js';
import { registerActions } from '../core/actions.js';

let profileModal = null;

async function saveEmail(email) {
  const errorLine = document.getElementById('profile-error');
  errorLine.classList.add('hidden');
  const response = await postJson('/api/me', { email }, 'PATCH');
  if (!response.ok) {
    errorLine.textContent = apiErrorMessage(await response.json().catch(() => ({})), 'profile.error_save');
    errorLine.classList.remove('hidden');
    return;
  }
  profileModal?.close();
  uiToast(tText(email ? 'profile.toast_verify' : 'profile.toast_removed'), 'success');
}

export async function showProfile() {
  const me = await fetchCurrentUser();
  if (!me) return;
  const email = me.email || '';
  profileModal = openModal({
    id: 'profile-modal',
    content: `
      <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
        <h2 class="text-xl font-black text-slate-800">${t('profile.title')}</h2>
        ${closeButtonHtml()}
      </div>
      <p class="text-sm text-slate-600 mb-4">${t('profile.desc')}</p>
      <form id="profile-form" class="space-y-3">
        <label for="profile-email" class="sr-only">${t('profile.placeholder')}</label>
        <input id="profile-email" type="email" maxlength="120" autofocus value="${escapeHtml(email)}" placeholder="${t('profile.placeholder')}"
               class="w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
        <p id="profile-error" class="text-red-600 text-xs hidden" role="alert"></p>
        <div class="flex gap-2 justify-end">
          ${email ? `<button type="button" data-action="remove-profile-email" class="text-red-600 hover:text-red-700 text-sm font-bold px-3">${t('common.remove')}</button>` : ''}
          <button type="button" data-close-modal class="text-slate-600 hover:text-slate-800 text-sm font-bold px-3">${t('common.cancel')}</button>
          <button type="submit" class="bg-blue-600 text-white px-5 py-2 rounded-xl font-bold hover:bg-blue-700 transition">${t('common.save')}</button>
        </div>
      </form>`,
  });
  document.getElementById('profile-form').addEventListener('submit', (event) => {
    event.preventDefault();
    saveEmail(document.getElementById('profile-email').value.trim());
  });
}

registerActions({
  'show-profile': showProfile,
  'remove-profile-email': async () => {
    if (await uiConfirm(tText('profile.confirm_remove'))) await saveEmail('');
  },
});
