import { t } from '../../core/i18n.js';
import { closeButtonHtml } from '../../core/dialogs.js';

export const recoverHtml = () => `
  <div class="flex justify-between items-center mb-4">
    <h2 class="text-xl font-black text-slate-800">${t('recover.title')}</h2>
    ${closeButtonHtml()}
  </div>
  <p class="text-sm text-slate-600 mb-4">${t('recover.desc')}</p>
  <form id="recover-form" class="space-y-3">
    <label for="recover-email" class="sr-only">${t('recover.placeholder')}</label>
    <input id="recover-email" type="email" required autofocus placeholder="${t('recover.placeholder')}"
           class="w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
    <div id="recover-turnstile" data-size="flexible"></div>
    <button type="submit" id="recover-submit" class="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50">${t('recover.submit')}</button>
    <p id="recover-msg" class="text-sm text-center hidden" role="status"></p>
  </form>`;
