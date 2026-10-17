import { escapeHtml } from '../../core/html.js';
import { t } from '../../core/i18n.js';
import { closeButtonHtml } from '../../core/dialogs.js';
import { formatSmartDate } from '../../core/dates.js';

const reasonHtml = (point) => point.reason ? `<div class="text-xs italic text-slate-600 mt-1">« ${escapeHtml(point.reason)} »</div>` : '';
const dateBadge = (value, tone) => `<span class="text-xs font-bold ${tone} bg-white px-2 py-1 rounded-md shadow-sm shrink-0">${escapeHtml(formatSmartDate(value))}</span>`;
const emptyLine = (key) => `<p class="text-xs italic text-slate-600 py-2 text-center">${t(key)}</p>`;
const SECTION_COLORS = {
  blue: ['text-blue-600', 'bg-blue-600'],
  emerald: ['text-emerald-700', 'bg-emerald-500'],
  orange: ['text-orange-700', 'bg-orange-500'],
};

const sectionTitle = (key, color) => `
  <h3 class="font-black text-xs uppercase tracking-widest ${SECTION_COLORS[color][0]} mb-4 mt-8 first:mt-0 flex items-center gap-2">
    <span class="w-2 h-2 ${SECTION_COLORS[color][1]} rounded-full" aria-hidden="true"></span> ${t(key)}
  </h3>`;

function receivedHtml(points) {
  if (!points.length) return emptyLine('history.empty_received');
  return points.map((point) => `
    <div class="flex items-start justify-between gap-2 text-sm bg-slate-50 p-3 rounded-xl border border-slate-100">
      <div class="min-w-0">
        <span class="text-slate-700">${escapeHtml(point.emoji)} <b>${escapeHtml(point.cat_name)}</b> <span class="text-slate-600 text-xs">${t('history.received_from')}</span> ${escapeHtml(point.from_name)}</span>
        ${reasonHtml(point)}
      </div>
      ${dateBadge(point.created_at, 'text-slate-600')}
    </div>`).join('');
}

function givenHtml(points) {
  if (!points.length) return emptyLine('history.empty_given');
  return points.map((point) => `
    <div class="flex items-start justify-between gap-2 text-sm bg-emerald-50/30 p-3 rounded-xl border border-emerald-100">
      <div class="min-w-0">
        <span class="text-slate-700">${t('history.gave')} ${escapeHtml(point.emoji)} <b>${escapeHtml(point.cat_name)}</b> <span class="text-slate-600 text-xs">${t('history.given_to')}</span> ${escapeHtml(point.to_name)}</span>
        ${reasonHtml(point)}
      </div>
      ${dateBadge(point.created_at, 'text-emerald-700')}
    </div>`).join('');
}

const daresHtml = (dares) => dares.map((dare) => `
  <div class="flex items-center justify-between text-sm bg-orange-50 p-3 rounded-xl border border-orange-100">
    <span class="text-slate-700">${escapeHtml(dare.emoji)} <b>${escapeHtml(dare.dare_text)}</b></span>
    ${dateBadge(dare.cleared_at, 'text-orange-700')}
  </div>`).join('');

export const historyHtml = (userName, history) => `
      <div class="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
        <h2 class="text-xl font-black text-slate-800">${t('history.title', { name: userName })}</h2>
        ${closeButtonHtml()}
      </div>
      ${sectionTitle('history.received', 'blue')}
      <div class="space-y-3">${receivedHtml(history.received)}</div>
      ${sectionTitle('history.given', 'emerald')}
      <div class="space-y-3">${givenHtml(history.given)}</div>
      ${history.dares?.length ? `${sectionTitle('history.dares', 'orange')}<div class="space-y-3">${daresHtml(history.dares)}</div>` : ''}`;
