import { escapeHtml } from '../../core/html.js';
import { t } from '../../core/i18n.js';
import { formatSmartDate } from '../../core/dates.js';

const trashIcon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" class="${size}" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>`;

function dareLogEntryHtml(entry) {
  const isSpamPardon = !entry.category_id;
  return `
    <div class="flex items-center justify-between p-3 ${isSpamPardon ? 'bg-purple-50 border-purple-100' : 'bg-orange-50 border-orange-100'} rounded-xl border">
      <div class="flex items-center gap-3 text-sm min-w-0">
        <span class="text-lg shrink-0" aria-hidden="true">${escapeHtml(entry.emoji || '🚨')}</span>
        <span class="text-slate-700 min-w-0">
          <b class="text-slate-800">${escapeHtml(entry.user_name)}</b>
          ${t('admin.dare_log_did')} <span class="${isSpamPardon ? 'text-purple-700' : 'text-orange-700'} font-bold">${escapeHtml(entry.dare_text)}</span>
        </span>
      </div>
      <div class="flex items-center gap-3 shrink-0 ml-4">
        <span class="text-xs font-bold text-slate-600">${escapeHtml(formatSmartDate(entry.cleared_at))}</span>
        <button type="button" data-action="delete-dare-log" data-entry-id="${escapeHtml(entry.id)}" title="${t('common.delete')}" aria-label="${t('common.delete')}" class="text-slate-600 hover:text-red-600 transition-colors">${trashIcon('h-4 w-4')}</button>
      </div>
    </div>`;
}

export const dareLogHtml = (entries) => entries.length
  ? entries.map(dareLogEntryHtml).join('')
  : `<p class="text-xs italic text-slate-600 text-center py-4">${t('admin.dare_log_empty')}</p>`;

const pointLogEntryHtml = (point) => `
    <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100 hover:bg-white transition-all group">
      <div class="flex items-center gap-3 text-sm">
        <span class="text-lg" aria-hidden="true">${escapeHtml(point.emoji)}</span>
        <span class="text-slate-700"><b class="text-slate-800">${escapeHtml(point.from_name)}</b> ${t('admin.global_log_gave')} <b class="text-slate-800">${escapeHtml(point.to_name)}</b></span>
      </div>
      <div class="flex items-center gap-4">
        <span class="text-xs font-bold text-slate-600">${escapeHtml(formatSmartDate(point.created_at))}</span>
        <button type="button" data-action="delete-point" data-point-id="${escapeHtml(point.id)}" aria-label="${t('common.delete')}"
                class="text-red-600 hover:text-red-600 transition-colors p-1 opacity-0 group-hover:opacity-100 focus:opacity-100">${trashIcon('h-5 w-5')}</button>
      </div>
    </div>`;

export const pointsLogHtml = (points) => points.map(pointLogEntryHtml).join('');
