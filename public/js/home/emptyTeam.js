import { authFetch, postJson, ADMIN_ROLES } from '../core/session.js';
import { escapeHtml } from '../core/html.js';
import { t, tText } from '../core/i18n.js';
import { registerActions } from '../core/actions.js';

const WELCOME_FLAG_KEY = 'dtp_welcome';

let currentRole = 'member';
export const setViewerRole = (role) => { currentRole = role; };

function consumeWelcomeFlag() {
  try {
    const isWelcome = localStorage.getItem(WELCOME_FLAG_KEY) === '1';
    localStorage.removeItem(WELCOME_FLAG_KEY);
    return isWelcome;
  } catch {
    return false;
  }
}

function showInviteMessage(key, tone) {
  const message = document.getElementById('empty-invite-msg');
  message.textContent = tText(key);
  message.className = `text-xs ${tone}`;
}

export async function renderEmptyTeamState(container) {
  if (document.getElementById('empty-team-state')) return;
  const isWelcome = consumeWelcomeFlag();
  const canInvite = ADMIN_ROLES.includes(currentRole);

  container.innerHTML = `
    <div id="empty-team-state" class="col-span-full bg-white rounded-3xl border-2 border-dashed border-blue-200 p-8 md:p-12 text-center">
      <div class="text-6xl mb-4" aria-hidden="true">${isWelcome ? '🎉' : '👋'}</div>
      <h3 class="text-2xl font-black text-slate-800">${t(isWelcome ? 'empty.welcome_title' : 'empty.title')}</h3>
      <p class="text-slate-600 mt-2 max-w-md mx-auto">${t(canInvite ? 'empty.desc' : 'empty.wait_desc')}</p>
      ${canInvite ? `
      <div class="mt-6 max-w-md mx-auto space-y-3 text-left">
        <div class="flex flex-col sm:flex-row gap-2">
          <input id="empty-invite-link" type="text" readonly value="${escapeHtml(tText('empty.loading_link'))}" aria-label="${t('admin.invite_title')}"
                 class="flex-1 p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-600 text-sm outline-none">
          <button type="button" data-action="copy-empty-invite" class="bg-slate-800 text-white px-5 py-3 rounded-xl font-bold hover:bg-slate-900 transition whitespace-nowrap">${t('empty.copy')}</button>
        </div>
        <form id="empty-invite-form" class="flex flex-col sm:flex-row gap-2">
          <input id="empty-invite-email" type="email" required placeholder="${t('empty.email_placeholder')}" aria-label="${t('empty.email_placeholder')}"
                 class="flex-1 p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500">
          <button type="submit" class="bg-blue-600 text-white px-5 py-3 rounded-xl font-bold hover:bg-blue-700 transition whitespace-nowrap">${t('empty.send')}</button>
        </form>
        <p id="empty-invite-msg" class="text-xs hidden" role="status"></p>
      </div>` : ''}
    </div>`;
  if (!canInvite) return;

  document.getElementById('empty-invite-link').addEventListener('focus', (event) => event.target.select());
  document.getElementById('empty-invite-form').addEventListener('submit', sendInvite);
  const response = await authFetch('/api/admin/invite-link').catch(() => null);
  if (response?.ok) document.getElementById('empty-invite-link').value = (await response.json()).url;
}

async function sendInvite(event) {
  event.preventDefault();
  const input = document.getElementById('empty-invite-email');
  const response = await postJson('/api/admin/invite', { email: input.value.trim() });
  if (response.ok) {
    input.value = '';
    showInviteMessage('empty.email_sent', 'text-emerald-700');
  } else {
    showInviteMessage('empty.email_error', 'text-red-600');
  }
}

registerActions({
  'copy-empty-invite': async () => {
    const input = document.getElementById('empty-invite-link');
    await navigator.clipboard.writeText(input.value).catch(() => null);
    input.select();
    showInviteMessage('empty.link_copied', 'text-emerald-700');
  },
});
