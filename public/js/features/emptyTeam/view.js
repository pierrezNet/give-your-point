import { escapeHtml } from '../../core/html.js';
import { t, tText } from '../../core/i18n.js';

const inviteToolsHtml = () => `
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
  </div>`;

export const emptyTeamHtml = ({ isWelcome, canInvite }) => `
  <div id="empty-team-state" class="col-span-full bg-white rounded-3xl border-2 border-dashed border-blue-200 p-8 md:p-12 text-center">
    <div class="text-6xl mb-4" aria-hidden="true">${isWelcome ? '🎉' : '👋'}</div>
    <h3 class="text-2xl font-black text-slate-800">${t(isWelcome ? 'empty.welcome_title' : 'empty.title')}</h3>
    <p class="text-slate-600 mt-2 max-w-md mx-auto">${t(canInvite ? 'empty.desc' : 'empty.wait_desc')}</p>
    ${canInvite ? inviteToolsHtml() : ''}
  </div>`;
