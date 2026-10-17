import { applyI18n, tText } from '../../core/i18n.js';
import { apiErrorMessage } from '../../core/api.js';
import { track } from '../../core/track.js';
import { loadTurnstile, turnstileSiteKey, turnstileToken } from '../../core/turnstile.js';
import { fetchInvitation, joinTeam } from './api.js';

const TEMPLATE_IDS = ['join-page', 'join-pending', 'join-invalid'];
let templates = null;

function showTemplate(templateId, container = document.body) {
  templates ??= new Map(TEMPLATE_IDS.map((id) => [id, document.getElementById(id)]));
  container.replaceChildren(templates.get(templateId).content.cloneNode(true));
  applyI18n(container);
}

function showError(message) {
  const errorLine = document.getElementById('join-error');
  errorLine.textContent = message;
  errorLine.classList.remove('hidden');
}

function setSubmitting(isSubmitting) {
  const submit = document.getElementById('join-submit');
  submit.disabled = isSubmitting;
  submit.textContent = tText(isSubmitting ? 'join.submit_loading' : 'join.submit');
}

async function submitJoin(event, code, invitation) {
  event.preventDefault();
  document.getElementById('join-error').classList.add('hidden');
  const token = turnstileToken();
  if (!token) {
    showError(tText('onboarding.error_turnstile_pending'));
    return;
  }
  setSubmitting(true);
  try {
    const outcome = await joinTeam({ code, name: event.target.name.value.trim(), turnstileToken: token });
    if (outcome.ok) {
      track('join_soumis');
      showTemplate('join-pending', document.getElementById('join-card'));
      document.getElementById('join-pending-message').textContent = tText('join.pending_msg', { team: invitation.team_name });
      return;
    }
    showError(apiErrorMessage(outcome.body, 'join.error_generic'));
  } catch {
    showError(tText('join.error_generic'));
  } finally {
    setSubmitting(false);
  }
}

export async function startJoin(code) {
  const [invitation, siteKey] = await Promise.all([fetchInvitation(code), turnstileSiteKey()]);
  track('join_vue');
  if (!invitation) {
    showTemplate('join-invalid');
    return;
  }
  showTemplate('join-page');
  document.getElementById('join-heading').textContent = tText('join.heading', { team: invitation.team_name });
  document.getElementById('join-subtitle').textContent = tText('join.subtitle', { company: invitation.company_name });
  document.getElementById('join-form').addEventListener('submit', (event) => submitJoin(event, code, invitation));
  if (siteKey) {
    document.querySelector('#join-form .cf-turnstile').dataset.sitekey = siteKey;
    loadTurnstile();
  }
}
