import { applyI18n, t, tText } from '../core/i18n.js';
import { apiErrorMessage } from '../core/api.js';
import { track } from '../core/track.js';
import { escapeHtml } from '../core/html.js';
import { loadTurnstile, turnstileSiteKey, turnstileToken } from '../core/turnstile.js';
import { publicHeaderHtml } from './publicHeader.js';

const invalidLinkHtml = () => `
  <main class="min-h-screen bg-gray-100 flex flex-col items-center justify-center p-4 text-center">
    <div class="text-5xl mb-4" aria-hidden="true">🔗</div>
    <h1 class="text-2xl font-black text-slate-800">${t('join.invalid_title')}</h1>
    <p class="text-slate-600 mt-2 max-w-sm">${t('join.invalid_msg')}</p>
    <a href="/" class="mt-6 inline-block bg-blue-600 text-white px-6 py-3 rounded-xl font-bold hover:bg-blue-700 transition">${t('join.back_home')}</a>
  </main>`;

const joinFormHtml = (invitation, siteKey) => `
  <div class="min-h-screen bg-gray-100">
    ${publicHeaderHtml({ withAboutLink: false })}
    <main class="max-w-md mx-auto px-4 py-16">
      <div id="join-card" class="bg-white rounded-3xl shadow-xl p-8 space-y-5 border border-slate-200 text-center">
        <div class="text-5xl" aria-hidden="true">🎉</div>
        <div>
          <h1 class="text-2xl font-black text-slate-800">${t('join.heading', { team: invitation.team_name })}</h1>
          <p class="text-sm text-slate-600 mt-2">${t('join.subtitle', { company: invitation.company_name })}</p>
        </div>
        <form id="join-form" class="space-y-3 text-left">
          <label for="join-name" class="sr-only">${t('join.name_placeholder')}</label>
          <input id="join-name" type="text" required minlength="1" maxlength="40" placeholder="${t('join.name_placeholder')}"
                 class="w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500" />
          <div class="cf-turnstile" data-sitekey="${escapeHtml(siteKey)}" data-size="flexible"></div>
          <button type="submit" id="join-submit" class="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50">${t('join.submit')}</button>
          <p id="join-error" class="text-red-600 text-xs text-center hidden" role="alert"></p>
        </form>
        <a href="/" class="text-xs font-bold text-slate-500 hover:underline block">${t('join.have_account')}</a>
      </div>
    </main>
  </div>`;

const pendingHtml = (teamName) => `
  <div class="text-5xl" aria-hidden="true">⏳</div>
  <h1 class="text-2xl font-black text-slate-800">${t('join.pending_title')}</h1>
  <p class="text-sm text-slate-600">${t('join.pending_msg', { team: teamName })}</p>
  <a href="/" class="text-xs font-bold text-slate-500 hover:underline block">${t('join.back_home')}</a>`;

async function fetchInvitation(code) {
  const response = await fetch(`/api/join/${encodeURIComponent(code)}`).catch(() => null);
  return response?.ok ? response.json() : null;
}

function showError(message) {
  const errorLine = document.getElementById('join-error');
  errorLine.textContent = message;
  errorLine.classList.remove('hidden');
}

async function submitJoin(event, code, invitation) {
  event.preventDefault();
  document.getElementById('join-error').classList.add('hidden');
  const name = document.getElementById('join-name').value.trim();
  const token = turnstileToken();
  if (!token) {
    showError(tText('onboarding.error_turnstile_pending'));
    return;
  }
  const submit = document.getElementById('join-submit');
  submit.disabled = true;
  submit.textContent = tText('join.submit_loading');
  try {
    const response = await fetch('/api/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, name, turnstile_token: token }),
    });
    if (response.ok) {
      track('join_soumis');
      document.getElementById('join-card').innerHTML = pendingHtml(invitation.team_name);
      return;
    }
    showError(apiErrorMessage(await response.json().catch(() => ({})), 'join.error_generic'));
  } catch {
    showError(tText('join.error_generic'));
  } finally {
    submit.disabled = false;
    submit.textContent = tText('join.submit');
  }
}

export async function renderJoin(code) {
  const [invitation, siteKey] = await Promise.all([fetchInvitation(code), turnstileSiteKey()]);
  track('join_vue');
  document.body.innerHTML = invitation ? joinFormHtml(invitation, siteKey) : invalidLinkHtml();
  applyI18n();
  if (!invitation) return;
  if (siteKey) loadTurnstile();
  document.getElementById('join-form').addEventListener('submit', (event) => submitJoin(event, code, invitation));
}
