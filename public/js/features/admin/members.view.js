import { escapeHtml } from '../../core/html.js';
import { t, tText } from '../../core/i18n.js';

export const SPAM_WATCH_THRESHOLD = 0.5;

export const maskEmail = (email) => {
  const [local = '', domain = ''] = String(email).split('@');
  return `${local.slice(0, 2)}…@…${domain.slice(-3)}`;
};

function memberStatusHtml(user, isPending) {
  if (user.active === 1) return '';
  return isPending
    ? `<span class="text-xs font-black uppercase text-blue-700 not-italic">⏳ ${t('admin.pending_flag')}</span>`
    : t('admin.user_deactivated');
}

function emailCellHtml(user) {
  if (user.active !== 1) return '<span class="text-slate-600">—</span>';
  if (!user.email) return '<span class="text-slate-600">—</span>';
  return `
    <div class="flex flex-col gap-0.5">
      <span class="font-mono text-slate-600">${escapeHtml(maskEmail(user.email))}</span>
      ${user.email_verified
        ? `<span class="text-xs font-black uppercase text-emerald-700">✓ ${t('admin.email_confirmed')}</span>`
        : `<span class="text-xs font-black uppercase text-amber-700">⏳ ${t('admin.email_pending')}</span>`}
    </div>`;
}

function dareButtonsHtml(user, activeDares, categories) {
  return categories
    .filter((category) => activeDares.some((dare) => String(dare.categoryId) === String(category.id)))
    .map((category) => `
      <button type="button" data-action="clear-dare" data-user-id="${escapeHtml(user.id)}" data-category-id="${escapeHtml(category.id)}"
              title="${escapeHtml(category.name)}" aria-label="${escapeHtml(tText('admin.confirm_clear_category', { cat: category.name, user: user.name }))}"
              class="w-10 h-10 flex flex-col items-center justify-center bg-orange-50 hover:bg-orange-100 rounded-lg border border-orange-200 transition-all shadow-sm animate-bounce-short">
        <span class="text-xs">${escapeHtml(category.emoji)}</span>
      </button>`).join('');
}

function memberActionsHtml(user, isPending) {
  const id = escapeHtml(user.id);
  if (user.active !== 1) {
    return `
      <button type="button" data-action="restore-member" data-user-id="${id}" class="text-xs font-black text-emerald-700 uppercase">${t(isPending ? 'admin.validate' : 'common.restore')}</button>
      ${isPending ? `<button type="button" data-action="reject-member" data-user-id="${id}" title="${t('admin.reject_title')}" class="text-xs font-black text-red-700 hover:text-red-800 uppercase">${t('admin.reject')}</button>` : ''}`;
  }
  return `
    ${user.email
      ? `<button type="button" data-action="resend-link" data-user-id="${id}" class="text-xs font-black text-blue-700 uppercase hover:underline">${t('admin.resend_link')}</button>
         <button type="button" data-action="reveal-link" data-user-id="${id}" class="text-sm text-slate-600 hover:text-slate-700" title="${t('admin.reveal_link_title')}" aria-label="${t('admin.reveal_link_title')}">🔗</button>`
      : `<button type="button" data-action="copy-link" data-user-id="${id}" class="text-xs font-black text-blue-700 uppercase hover:underline">${t('common.copy_link')}</button>`}
    <button type="button" data-action="regenerate-link" data-user-id="${id}" title="${t('admin.regen_title')}" aria-label="${t('admin.regen_title')}" class="text-base text-amber-700 hover:text-amber-700 leading-none">↻</button>
    <button type="button" data-action="deactivate-member" data-user-id="${id}" class="text-xs font-black text-red-600 hover:text-red-700 uppercase">${t('common.deactivate')}</button>`;
}

export function memberRowHtml(user, { dares, categories }) {
  const isActive = user.active === 1;
  const isPending = !isActive && !user.has_activity;
  const activeDares = dares.filter((dare) => dare.userId === user.id);
  return `
    <tr class="border-b border-slate-100 ${isActive ? 'hover:bg-slate-50' : 'bg-slate-100'} transition-colors">
      <td class="p-4">
        <div class="font-bold ${isActive ? 'text-slate-800' : 'text-slate-600 italic'}">${escapeHtml(user.name)} ${memberStatusHtml(user, isPending)}</div>
        ${activeDares.map(() => `<div class="text-xs text-orange-700 font-black uppercase">${t('admin.has_gage')}</div>`).join('')}
      </td>
      <td class="p-4 text-xs hidden sm:table-cell">${emailCellHtml(user)}</td>
      <td class="p-4">
        <div class="flex items-center justify-end gap-3">
          <div class="flex gap-1">${dareButtonsHtml(user, activeDares, categories)}</div>
          <div class="flex items-center gap-4 ml-4 border-l border-slate-200 pl-4">${memberActionsHtml(user, isPending)}</div>
        </div>
      </td>
    </tr>`;
}

export const pendingBannerHtml = (count) => count
  ? `<div class="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-6 text-sm text-slate-800 font-bold" role="status">⏳ ${t('admin.pending_banner', { n: count })}</div>`
  : '';

export const spamWatchlist = (spammers) => spammers.filter((spammer) => spammer.flagged || spammer.progress >= SPAM_WATCH_THRESHOLD);

const spammerRowHtml = (spammer) => {
  const percent = Math.min(Math.round(spammer.progress * 100), 100);
  return `
    <div class="flex items-center gap-3">
      <span class="text-sm font-bold ${spammer.flagged ? 'text-purple-700' : 'text-amber-900'} w-28 sm:w-32 truncate shrink-0">${spammer.flagged ? '🚨 ' : ''}${escapeHtml(spammer.name)}</span>
      <div class="flex-1 h-2 bg-white rounded-full overflow-hidden border border-amber-100" role="progressbar" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100">
        <div class="h-full ${spammer.flagged ? 'bg-purple-500' : 'bg-amber-400'} rounded-full" style="width:${percent}%"></div>
      </div>
      <span class="text-xs font-black ${spammer.flagged ? 'text-purple-700' : 'text-amber-700'} w-9 text-right shrink-0">${percent}%</span>
      ${spammer.flagged ? `<button type="button" data-action="pardon-spammer" data-user-id="${escapeHtml(spammer.userId)}" class="text-xs font-black uppercase text-emerald-700 hover:underline whitespace-nowrap shrink-0">${t('admin.spammer_pardon')}</button>` : ''}
    </div>`;
};

export const spamBannerHtml = (watched) => watched.length ? `
  <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6">
    <div class="font-black text-amber-800 text-sm mb-3 flex items-center gap-2">⚠️ ${t('admin.spam_zone_title')}</div>
    <div class="space-y-2">${watched.map(spammerRowHtml).join('')}</div>
  </div>` : '';
