import { getLang, tText } from '../../core/i18n.js';
import { apiErrorMessage } from '../../core/api.js';
import { track } from '../../core/track.js';
import { loadTurnstile, turnstileSiteKey, turnstileToken } from '../../core/turnstile.js';
import { showRecoverModal, startRecover } from '../recover/controller.js';
import { createSpace } from './api.js';

const WELCOME_FLAG_KEY = 'dtp_welcome';

function showError(message) {
  const errorLine = document.getElementById('ob-error');
  errorLine.textContent = message;
  errorLine.classList.remove('hidden');
}

function setSubmitting(isSubmitting) {
  const submit = document.getElementById('ob-submit');
  submit.disabled = isSubmitting;
  submit.textContent = tText(isSubmitting ? 'onboarding.submit_loading' : 'onboarding.submit');
}

async function submitOnboarding(event) {
  event.preventDefault();
  track('onboarding_soumis');
  document.getElementById('ob-error').classList.add('hidden');
  const token = turnstileToken();
  if (!token) {
    showError(tText('onboarding.error_turnstile_pending'));
    return;
  }
  const form = event.target;
  setSubmitting(true);
  try {
    const outcome = await createSpace({
      company_name: form.company_name.value.trim(),
      admin_name: form.admin_name.value.trim(),
      admin_email: form.admin_email.value.trim(),
      locale: getLang(),
      turnstile_token: token,
    });
    if (outcome.ok) {
      localStorage.setItem(WELCOME_FLAG_KEY, '1');
      location.href = `/login/${outcome.body.token}`;
      return;
    }
    showError(apiErrorMessage(outcome.body, 'onboarding.error_generic'));
  } catch {
    showError(tText('onboarding.error_server'));
  } finally {
    setSubmitting(false);
  }
}

export async function startLanding() {
  startRecover();
  track('landing_vue');
  document.getElementById('onboarding-form').addEventListener('submit', submitOnboarding);
  const siteKey = await turnstileSiteKey();
  if (siteKey) {
    document.querySelectorAll('#landing .cf-turnstile').forEach((widget) => { widget.dataset.sitekey = siteKey; });
    loadTurnstile();
  }
  if (new URLSearchParams(location.search).get('lost') === '1') showRecoverModal();
}
