import { escapeHtml } from '../../core/html.js';
import { t, tText } from '../../core/i18n.js';

export const REASON_MAX_LENGTH = 140;
const RANK_COLORS = { 1: 'bg-yellow-400', 2: 'bg-slate-300', 3: 'bg-amber-600' };
const DEFAULT_RANK_COLOR = 'bg-blue-500';

export const POINT_TOAST_STYLES = {
  success: { background: 'bg-slate-800', durationMs: 5000, undoable: true },
  warning: { background: 'bg-amber-500', durationMs: 6000, undoable: true },
  danger: { background: 'bg-rose-600', durationMs: 8000, undoable: true },
  error: { background: 'bg-orange-600', durationMs: 5000, undoable: false },
};

export const categoryButtonsHtml = (categories) => categories.map((category) => `
  <button type="button" draggable="true" data-category-id="${escapeHtml(category.id)}" aria-pressed="false"
          class="category-card bg-white p-2 lg:p-4 rounded-xl shadow-sm border border-gray-100 flex items-center gap-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all text-left">
    <span class="category-emoji text-xl lg:text-2xl pointer-events-none">${escapeHtml(category.emoji)}</span>
    <span class="text-base lg:text-2xl pointer-events-none">${escapeHtml(category.name)}</span>
  </button>`).join('');

const badgesHtml = (topCategories = []) => topCategories.map((category) => `
  <div class="flex items-center bg-gray-50 px-2 py-1 rounded-md border border-gray-100">
    <span class="text-sm">${escapeHtml(category.emoji)}</span>
    <span class="text-[10px] font-bold ml-1 text-gray-500">${escapeHtml(category.count)}</span>
  </div>`).join('') || `<span class="text-[10px] text-gray-400 italic">${t('index.no_badge')}</span>`;

const bannerHtml = (className, placement, text) => text
  ? `<div class="${className} absolute ${placement} left-1/2 -translate-x-1/2 text-white px-3 py-1 rounded-full text-[10px] font-black shadow-lg z-10 whitespace-nowrap">${escapeHtml(text)}</div>`
  : '';

export function userCardHtml(user, { isMe }) {
  const highlighted = Boolean(user.gage || user.spammer);
  return `
    <article data-user-id="${escapeHtml(user.id)}" data-is-me="${isMe}" style="view-transition-name: card-${escapeHtml(user.id)}"
             class="user-card relative bg-white p-2 lg:p-3 rounded-2xl shadow-sm border-2 transition-all flex flex-col items-center text-center ${
               isMe ? 'cursor-not-allowed border-slate-200' : 'cursor-pointer hover:shadow-md border-transparent'} ${highlighted ? 'gage-active border-orange-500' : ''}">
      <button type="button" class="history-button absolute top-3 left-3 text-slate-300 hover:text-blue-500 hover:scale-110 transition-all z-30 p-1"
              aria-label="${escapeHtml(tText('history.title', { name: user.name }))}">
        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      <div class="rank-badge absolute top-3 right-3 ${RANK_COLORS[user.rank] ?? DEFAULT_RANK_COLOR} text-white text-[10px] font-black px-2 py-1 rounded-lg shadow-sm">#${escapeHtml(user.rank)}</div>
      <div class="collapse lg:visible w-16 h-16 bg-linear-to-br from-blue-100 to-blue-50 rounded-full mb-3 flex items-center justify-center text-blue-600 text-2xl font-bold border border-blue-100 shadow-inner" aria-hidden="true">
        ${escapeHtml((user.name || 'U')[0].toUpperCase())}
      </div>
      <h3 class="font-bold text-gray-800 text-lg">${escapeHtml(user.name)} ${isMe ? t('index.you_label') : ''}</h3>
      <p class="user-points-total text-blue-600 font-black text-sm mb-3">${escapeHtml(user.total_points || 0)} ${t('index.pts_short')}</p>
      <div class="top-categories-container flex flex-wrap justify-center gap-2 mt-2 w-full">${badgesHtml(user.topCategories)}</div>
      ${bannerHtml('gage-banner', '-top-3 bg-orange-600', user.gage ? tText('index.gage_label', { dare: user.gage.toUpperCase() }) : null)}
      ${bannerHtml('spammer-banner', '-bottom-3 bg-purple-600', user.spammer ? tText('index.spammer_label') : null)}
    </article>`;
}

export const recipientSelectorHtml = (emoji, recipients) => `
  <div class="mb-6">
    <div class="text-5xl mb-2" aria-hidden="true">${escapeHtml(emoji)}</div>
    <h2 class="text-slate-600 text-sm font-medium">${t('selector.who')}</h2>
  </div>
  <div class="grid grid-cols-3 gap-4 mb-6">
    ${recipients.map((user) => `
      <button type="button" data-recipient-id="${escapeHtml(user.id)}" class="flex flex-col items-center gap-2 group">
        <span class="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center text-blue-600 font-bold text-xl group-active:bg-blue-600 group-active:text-white transition-all shadow-sm" aria-hidden="true">
          ${escapeHtml(user.name[0].toUpperCase())}
        </span>
        <span class="text-[11px] font-bold text-slate-600 truncate w-full">${escapeHtml(user.name)}</span>
      </button>`).join('')}
  </div>
  <button type="button" data-close-modal class="text-slate-500 font-bold text-xs uppercase tracking-widest py-2">${t('common.cancel')}</button>`;

export const reasonDialogHtml = (recipientName) => `
  <div class="text-4xl mb-2" aria-hidden="true">🎯</div>
  <h2 class="text-lg font-black text-slate-800 mb-1">${t('reason.title', { name: recipientName })}</h2>
  <p class="text-xs text-slate-600 mb-4">${t('reason.hint')}</p>
  <form class="space-y-3">
    <label for="reason-input" class="sr-only">${t('reason.placeholder')}</label>
    <input id="reason-input" type="text" maxlength="${REASON_MAX_LENGTH}" autocomplete="off" autofocus placeholder="${t('reason.placeholder')}"
           class="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500 text-left" />
    <div class="flex gap-2">
      <button type="button" data-close-modal class="flex-1 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50">${t('common.cancel')}</button>
      <button type="submit" class="flex-1 bg-blue-600 text-white py-3 rounded-xl font-bold hover:bg-blue-700">${t('reason.submit')}</button>
    </div>
  </form>`;

export function pointToastHtml(message, type) {
  const { background, undoable } = POINT_TOAST_STYLES[type] ?? POINT_TOAST_STYLES.error;
  return `
    <div id="toast-notification" role="status" aria-live="polite"
         class="fixed bottom-8 left-1/2 -translate-x-1/2 ${background} text-white px-6 py-3 rounded-full shadow-2xl z-[200] flex items-center gap-4 max-w-[90vw]">
      <span class="text-sm font-medium">${escapeHtml(message)}</span>
      ${undoable ? `<button type="button" data-action="undo-last-point" class="text-yellow-200 font-black uppercase text-xs hover:text-white transition-colors shrink-0">${t('toast.undo')}</button>` : ''}
    </div>`;
}

export function pointOutcomeMessage(result) {
  if (result.gageTriggered) return { type: 'danger', message: tText('toast.gage_triggered', result.gageTriggered) };
  if (result.gageWarning) return { type: 'warning', message: tText('toast.gage_warning', result.gageWarning) };
  return { type: 'success', message: tText('toast.point_sent') };
}
