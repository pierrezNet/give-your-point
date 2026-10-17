import { tText } from '../../core/i18n.js';
import { openModal } from '../../core/dialogs.js';
import { registerActions } from '../../core/actions.js';
import { renderTurnstile, resetTurnstile, turnstileSiteKey, turnstileToken } from '../../core/turnstile.js';
import { requestMagicLink } from './api.js';
import { recoverHtml } from './view.js';

const showResult = (line, key, tone) => {
  line.textContent = tText(key);
  line.className = `text-sm text-center ${tone}`;
};

async function submitRecovery(event, modal) {
  event.preventDefault();
  const message = modal.querySelector('#recover-msg');
  const token = turnstileToken(modal);
  if (!token) {
    showResult(message, 'onboarding.error_turnstile_pending', 'text-red-600');
    return;
  }
  const submit = modal.querySelector('#recover-submit');
  submit.disabled = true;
  const { captchaRejected } = await requestMagicLink(modal.querySelector('#recover-email').value.trim(), token);
  submit.disabled = false;
  if (captchaRejected) {
    showResult(message, 'recover.captcha_error', 'text-red-600');
    resetTurnstile('#recover-turnstile');
  } else {
    showResult(message, 'recover.sent', 'text-emerald-700 font-bold');
  }
}

export async function showRecoverModal() {
  if (document.getElementById('recover-modal')) return;
  const siteKey = await turnstileSiteKey();
  const { element } = openModal({ id: 'recover-modal', content: recoverHtml() });
  renderTurnstile('#recover-turnstile', siteKey);
  element.querySelector('#recover-form').addEventListener('submit', (event) => submitRecovery(event, element));
}

export function startRecover() {
  registerActions({ 'show-recover': showRecoverModal });
}
