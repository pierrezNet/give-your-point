import { t, tText } from '../core/i18n.js';
import { closeButtonHtml, openModal } from '../core/dialogs.js';
import { registerActions } from '../core/actions.js';
import { renderTurnstile, resetTurnstile, turnstileSiteKey, turnstileToken } from '../core/turnstile.js';

const showResult = (line, key, tone) => {
  line.textContent = tText(key);
  line.className = `text-sm text-center ${tone}`;
};

export async function showRecoverModal() {
  if (document.getElementById('recover-modal')) return;
  const siteKey = await turnstileSiteKey();
  const { element } = openModal({
    id: 'recover-modal',
    content: `
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
      </form>`,
  });
  renderTurnstile('#recover-turnstile', siteKey);

  element.querySelector('#recover-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const message = element.querySelector('#recover-msg');
    const token = turnstileToken(element);
    if (!token) {
      showResult(message, 'onboarding.error_turnstile_pending', 'text-red-600');
      return;
    }
    const submit = element.querySelector('#recover-submit');
    submit.disabled = true;
    const response = await fetch('/api/recover', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: element.querySelector('#recover-email').value.trim(), turnstile_token: token }),
    }).catch(() => null);
    submit.disabled = false;
    if (response?.status === 403) {
      showResult(message, 'recover.captcha_error', 'text-red-600');
      resetTurnstile('#recover-turnstile');
    } else {
      showResult(message, 'recover.sent', 'text-emerald-700 font-bold');
    }
  });
}

registerActions({ 'show-recover': showRecoverModal });
