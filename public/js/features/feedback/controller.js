import { getLang, t, tText } from '../../core/i18n.js';
import { apiErrorMessage } from '../../core/api.js';
import { openModal } from '../../core/dialogs.js';
import { registerActions } from '../../core/actions.js';
import { escapeHtml } from '../../core/html.js';
import { loadTurnstile, renderTurnstile, resetTurnstile, turnstileSiteKey, turnstileToken } from '../../core/turnstile.js';
import { sendFeedback } from './api.js';
import { counterText, feedbackErrorHtml, feedbackFormHtml, feedbackSentHtml } from './view.js';

function showError(modal, message) {
  const line = modal.querySelector('#feedback-error');
  line.innerHTML = feedbackErrorHtml(escapeHtml(message));
  line.classList.remove('hidden');
}

async function submitFeedback(event, modal) {
  event.preventDefault();
  const form = event.target;
  modal.querySelector('#feedback-error').classList.add('hidden');
  if (!form.message.value.trim()) {
    showError(modal, tText('feedback.message_required'));
    form.message.focus();
    return;
  }
  const token = turnstileToken(modal);
  if (!token) {
    showError(modal, tText('onboarding.error_turnstile_pending'));
    return;
  }
  const submit = modal.querySelector('#feedback-submit');
  submit.disabled = true;
  submit.textContent = tText('feedback.sending');
  let outcome;
  try {
    outcome = await sendFeedback({
      type: form.type.value,
      message: form.message.value.trim(),
      pseudo: form.pseudo.value.trim(),
      contact: form.contact.value.trim(),
      lang: getLang(),
      turnstile_token: token,
    });
  } catch {
    outcome = { ok: false, body: {} };
  }
  if (outcome.ok) {
    const titleId = modal.getAttribute('aria-labelledby');
    modal.innerHTML = feedbackSentHtml();
    modal.querySelector('h2').id = titleId;
    modal.querySelector('[data-close-modal]').focus();
    return;
  }
  submit.disabled = false;
  submit.textContent = t('feedback.submit');
  resetTurnstile('#feedback-turnstile');
  showError(modal, apiErrorMessage(outcome.body, 'errors.FEEDBACK_UNAVAILABLE'));
}

export async function showFeedbackModal() {
  const { element } = openModal({ id: 'feedback-modal', content: feedbackFormHtml(), panelClass: 'bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl' });
  const message = element.querySelector('#feedback-message');
  message.addEventListener('input', () => { element.querySelector('#feedback-counter').textContent = counterText(message.value.length); });
  element.querySelector('#feedback-form').addEventListener('submit', (event) => submitFeedback(event, element));
  const [siteKey] = await Promise.all([turnstileSiteKey(), loadTurnstile()]);
  if (element.isConnected) renderTurnstile('#feedback-turnstile', siteKey);
}

export function startFeedback() {
  registerActions({ 'show-feedback': showFeedbackModal });
}
