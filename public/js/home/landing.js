import { getLang, t, tText, applyI18n } from '../core/i18n.js';
import { apiErrorMessage } from '../core/api.js';
import { track } from '../core/track.js';
import { escapeHtml } from '../core/html.js';
import { loadTurnstile, turnstileSiteKey, turnstileToken } from '../core/turnstile.js';
import { mockupSvg } from './mockup.js';
import { publicHeaderHtml } from './publicHeader.js';
import { showRecoverModal } from './recover.js';

const WELCOME_FLAG_KEY = 'dtp_welcome';
const FAQ_ENTRIES = ['free', 'data', 'account'];
const HOW_STEPS = [['🎁', 1], ['📈', 2], ['⚠️', 3]];
const AUDIENCES = [['team', 'bg-blue-50 border-blue-100'], ['class', 'bg-emerald-50 border-emerald-100'], ['friends', 'bg-amber-50 border-amber-100']];

const inputClass = 'w-full p-3 rounded-lg border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500';

const heroHtml = () => `
  <section class="max-w-5xl mx-auto px-4 pt-12 pb-8 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <h1 class="text-4xl md:text-5xl font-black text-slate-800 leading-tight">${t('app.title')} 🎯</h1>
            <p class="text-lg text-slate-600 mt-4">${t('landing.hero_pitch')}</p>
            <div class="mt-6 flex flex-wrap items-center gap-4">
              <a href="#create" class="inline-block bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold transition shadow-lg shadow-blue-600/20">${t('landing.cta_create')}</a>
              <a href="#have-link" class="text-sm font-bold text-blue-700 hover:underline">${t('landing.have_link_link')}</a>
            </div>
          </div>
          <div class="flex justify-center md:justify-end">${mockupSvg()}</div>
        </section>`;

const howItWorksHtml = () => `
  <section class="max-w-5xl mx-auto px-4 py-12">
          <h2 class="text-2xl font-black text-slate-800 mb-8 text-center">${t('landing.how_title')}</h2>
          <div class="grid md:grid-cols-3 gap-6">
            ${HOW_STEPS.map(([emoji, step]) => `
              <div class="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <div class="text-3xl mb-2" aria-hidden="true">${emoji}</div>
                <h3 class="font-bold text-slate-800 mb-1">${t(`landing.how_step${step}_title`)}</h3>
                <p class="text-sm text-slate-600">${t(`landing.how_step${step}_desc`)}</p>
              </div>`).join('')}
          </div>
        </section>`;

const audiencesHtml = () => `
  <section class="max-w-5xl mx-auto px-4 py-12">
          <h2 class="text-2xl font-black text-slate-800 mb-8 text-center">${t('landing.who_title')}</h2>
          <div class="grid md:grid-cols-3 gap-6">
            ${AUDIENCES.map(([audience, colors]) => `
              <div class="${colors} rounded-2xl p-6 border">
                <h3 class="font-bold text-slate-800 mb-2">${t(`landing.who_${audience}_title`)}</h3>
                <p class="text-sm text-slate-600">${t(`landing.who_${audience}_desc`)}</p>
              </div>`).join('')}
          </div>
        </section>`;

const onboardingFormHtml = (siteKey) => `
  <section id="create" class="max-w-md mx-auto px-4 py-12">
          <div class="bg-white rounded-3xl shadow-xl p-8 space-y-5 border border-slate-200">
            <div class="text-center">
              <h2 class="text-2xl font-black text-slate-800">${t('landing.create_title')}</h2>
              <p class="text-sm text-slate-600 mt-2">${t('landing.create_subtitle')}</p>
            </div>
            <form id="onboarding-form" class="space-y-3">
              <label for="ob-company" class="sr-only">${t('onboarding.company_placeholder')}</label>
              <input id="ob-company" type="text" required minlength="2" maxlength="60" placeholder="${t('onboarding.company_placeholder')}" class="${inputClass}" />
              <label for="ob-admin" class="sr-only">${t('onboarding.admin_placeholder')}</label>
              <input id="ob-admin" type="text" required minlength="1" maxlength="40" placeholder="${t('onboarding.admin_placeholder')}" class="${inputClass}" />
              <label for="ob-email" class="sr-only">${t('onboarding.email_placeholder')}</label>
              <input id="ob-email" type="email" maxlength="120" placeholder="${t('onboarding.email_placeholder')}" class="${inputClass}" />
              <div class="cf-turnstile" data-sitekey="${escapeHtml(siteKey)}" data-size="flexible"></div>
              <button type="submit" id="ob-submit" class="w-full bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700 transition disabled:opacity-50">${t('onboarding.submit')}</button>
              <p id="ob-error" class="text-red-600 text-xs text-center hidden" role="alert"></p>
            </form>
            <p class="text-[11px] text-slate-500 text-center">${t('landing.legal_note')}</p>
          </div>
        </section>`;

const haveLinkHtml = () => `
  <section id="have-link" class="max-w-md mx-auto px-4 pb-12">
          <div class="bg-slate-50 rounded-xl p-4 text-sm text-slate-700 border border-slate-200">
            <h3 class="font-bold text-slate-800 mb-1">${t('onboarding.have_link_title')}</h3>
            <p class="text-xs text-slate-600">${t('onboarding.have_link_desc')}</p>
            <button type="button" data-action="show-recover" class="mt-2 text-xs font-bold text-blue-700 hover:underline">${t('recover.link')}</button>
          </div>
        </section>`;

const faqHtml = () => `
  <section class="max-w-3xl mx-auto px-4 py-12">
          <h2 class="text-2xl font-black text-slate-800 mb-6 text-center">${t('landing.faq_title')}</h2>
          <div class="space-y-3">
            ${FAQ_ENTRIES.map((entry) => `
              <details class="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
                <summary class="font-bold text-slate-800 cursor-pointer marker:text-blue-500">${t(`landing.faq_${entry}_q`)}</summary>
                <p class="text-sm text-slate-600 mt-3">${t(`landing.faq_${entry}_a`)}</p>
              </details>`).join('')}
          </div>
        </section>`;

const footerHtml = () => `
  <footer class="max-w-5xl mx-auto px-4 py-8 text-center text-xs text-slate-500 border-t border-slate-200">
        <a href="/about" class="block mb-2 font-bold text-slate-600 hover:text-slate-800 underline">${t('landing.about_link')}</a>
        Made with ❤️ — ${t('app.title')}
      </footer>`;

const landingHtml = (siteKey) => `
  <div class="min-h-screen bg-gray-100">
    ${publicHeaderHtml({ withAboutLink: true })}
    <main>
      ${heroHtml()}
      ${howItWorksHtml()}
      ${audiencesHtml()}
      ${onboardingFormHtml(siteKey)}
      ${haveLinkHtml()}
      ${faqHtml()}
    </main>
    ${footerHtml()}
  </div>`;

function showError(errorLine, message) {
  errorLine.textContent = message;
  errorLine.classList.remove('hidden');
}

async function submitOnboarding(event) {
  event.preventDefault();
  track('onboarding_soumis');
  const errorLine = document.getElementById('ob-error');
  const submit = document.getElementById('ob-submit');
  errorLine.classList.add('hidden');
  const token = turnstileToken();
  if (!token) {
    showError(errorLine, tText('onboarding.error_turnstile_pending'));
    return;
  }
  submit.disabled = true;
  submit.textContent = tText('onboarding.submit_loading');
  try {
    const response = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company_name: document.getElementById('ob-company').value.trim(),
        admin_name: document.getElementById('ob-admin').value.trim(),
        admin_email: document.getElementById('ob-email').value.trim(),
        locale: getLang(),
        turnstile_token: token,
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (response.ok) {
      localStorage.setItem(WELCOME_FLAG_KEY, '1');
      location.href = `/login/${result.token}`;
      return;
    }
    showError(errorLine, apiErrorMessage(result, 'onboarding.error_generic'));
  } catch {
    showError(errorLine, tText('onboarding.error_server'));
  } finally {
    submit.disabled = false;
    submit.textContent = tText('onboarding.submit');
  }
}

export async function renderLanding() {
  const siteKey = await turnstileSiteKey();
  document.body.innerHTML = landingHtml(siteKey);
  applyI18n();
  track('landing_vue');
  if (siteKey) loadTurnstile();
  if (new URLSearchParams(location.search).get('lost') === '1') showRecoverModal();
  document.getElementById('onboarding-form').addEventListener('submit', submitOnboarding);
}
