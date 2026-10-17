import { escapeHtml } from '../../core/html.js';
import { t } from '../../core/i18n.js';
import { closeButtonHtml } from '../../core/dialogs.js';

export const profileHtml = (email, { canAskForPush }) => `
  <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
    <h2 class="text-xl font-black text-slate-800">${t('profile.title')}</h2>
    ${closeButtonHtml()}
  </div>
  <p class="text-sm text-slate-600 mb-4">${t('profile.desc')}</p>
  ${canAskForPush ? `<button type="button" data-action="enable-push" class="w-full mb-4 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold text-sm py-2 rounded-xl">${t('profile.enable_push')}</button>` : ''}
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
  </form>`;
