import { applyI18n, t, tText } from '../core/i18n.js';
import { authFetch, getSessionToken } from '../core/session.js';
import { escapeHtml } from '../core/html.js';
import { registerActions } from '../core/actions.js';
import { formatShortDate } from '../core/dates.js';

const PERIODS = [['7', 'stats.period_7'], ['30', 'stats.period_30'], ['all', 'stats.period_all']];
const MIN_RECEIVED_FOR_INGRATE = 3;
const PODIUM_ORDER = [1, 0, 2];
const PODIUM_HEIGHTS = ['h-20', 'h-14', 'h-10'];
const MEDALS = ['🥇', '🥈', '🥉'];

let currentPeriod = '30';
const content = () => document.getElementById('stats-content');
const firstName = (name) => String(name).split(' ')[0];

const progressBar = (value, max, color) => `
  <div class="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden" role="presentation">
    <div class="bar-fill ${color} h-3 rounded-full" style="width:0%" data-pct="${max > 0 ? Math.round((value / max) * 100) : 0}"></div>
  </div>`;

const periodBarHtml = (total) => `
  <div class="flex items-center justify-between flex-wrap gap-3">
    <div class="flex gap-2" role="group" aria-label="${t('stats.period_label')}">
      ${PERIODS.map(([period, key]) => `
        <button type="button" data-action="select-period" data-period="${period}" aria-pressed="${currentPeriod === period}"
                class="px-3 py-1.5 rounded-full text-sm font-bold transition-colors ${currentPeriod === period ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'}">${t(key)}</button>`).join('')}
    </div>
    <span class="text-sm font-bold text-slate-600">🎯 ${escapeHtml(total)} ${t('stats.total_points')}</span>
  </div>`;

function youCardHtml(me) {
  if (!me || me.given + me.received + me.gages === 0) return '';
  const rank = (position) => (position ? t('stats.you_rank', { n: position }) : t('stats.you_norank'));
  const cell = (value, label) => `<div><div class="text-3xl font-black">${escapeHtml(value)}</div><div class="text-[11px] opacity-90 mt-0.5">${label}</div></div>`;
  return `
    <section class="bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl p-5 shadow text-white">
      <h2 class="font-black mb-3">${t('stats.you_title')}</h2>
      <div class="grid grid-cols-3 gap-3 text-center">
        ${cell(me.given, `${t('stats.you_given')} · ${rank(me.rankGiver)}`)}
        ${cell(me.received, `${t('stats.you_received')} · ${rank(me.rankReceiver)}`)}
        ${cell(me.gages, t('stats.you_gages'))}
      </div>
    </section>`;
}

const awardCardHtml = ({ emoji, titleKey, winner, descriptionKey, value }) => `
  <div class="award-card bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex items-center gap-3">
    <span class="text-3xl shrink-0" aria-hidden="true">${emoji}</span>
    <div class="min-w-0 flex-1">
      <div class="text-[10px] font-black uppercase tracking-wider text-slate-500">${t(titleKey)}</div>
      <div class="text-sm font-black text-slate-800 truncate">${escapeHtml(winner)}</div>
      <div class="text-[11px] text-slate-500 truncate">${t(descriptionKey)} · ${escapeHtml(value)}</div>
    </div>
  </div>`;

function mostObsessed(matrix) {
  return matrix.filter((cell) => cell.from_id !== cell.to_id).reduce((best, cell) => (!best || cell.total > best.total ? cell : best), null);
}

function bestDuo(matrix) {
  const byPair = new Map(matrix.map((cell) => [`${cell.from_id}|${cell.to_id}`, cell]));
  return matrix.reduce((best, cell) => {
    if (cell.from_id >= cell.to_id) return best;
    const reverse = byPair.get(`${cell.to_id}|${cell.from_id}`);
    if (!reverse) return best;
    const score = cell.total + reverse.total;
    return !best || score > best.score ? { a: cell.from_name, b: cell.to_name, score } : best;
  }, null);
}

function biggestIngrate(givers, receivers) {
  const givenById = new Map(givers.map((giver) => [giver.id, giver.total]));
  return receivers.reduce((best, receiver) => {
    if (receiver.total < MIN_RECEIVED_FOR_INGRATE) return best;
    const score = receiver.total - (givenById.get(receiver.id) ?? 0);
    return score > 0 && (!best || score > best.score) ? { name: receiver.name, score } : best;
  }, null);
}

function awardsHtml({ givers, receivers, matrix, gages }) {
  const obsessed = mostObsessed(matrix);
  const duo = bestDuo(matrix);
  const ingrate = biggestIngrate(givers, receivers);
  const awards = [
    givers[0] && { emoji: '🎁', titleKey: 'stats.award_santa_t', winner: givers[0].name, descriptionKey: 'stats.award_santa_d', value: `${givers[0].total} ${tText('stats.u_given')}` },
    receivers[0] && { emoji: '⭐', titleKey: 'stats.award_star_t', winner: receivers[0].name, descriptionKey: 'stats.award_star_d', value: `${receivers[0].total} ${tText('stats.u_received')}` },
    obsessed && { emoji: '👀', titleKey: 'stats.award_obsessed_t', winner: `${obsessed.from_name} → ${obsessed.to_name}`, descriptionKey: 'stats.award_obsessed_d', value: `${obsessed.total}×` },
    gages[0] && { emoji: '🥐', titleKey: 'stats.award_gageking_t', winner: gages[0].name, descriptionKey: 'stats.award_gageking_d', value: `${gages[0].total} ${tText('stats.u_gages_n')}` },
    duo && { emoji: '🤝', titleKey: 'stats.award_duo_t', winner: `${duo.a} ↔ ${duo.b}`, descriptionKey: 'stats.award_duo_d', value: `${duo.score}` },
    ingrate && { emoji: '🐀', titleKey: 'stats.award_ingrate_t', winner: ingrate.name, descriptionKey: 'stats.award_ingrate_d', value: `+${ingrate.score}` },
  ].filter(Boolean);
  return awards.length ? `
    <section>
      <h2 class="font-black text-slate-800 mb-3 flex items-center gap-2">${t('stats.awards_title')}</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">${awards.map(awardCardHtml).join('')}</div>
    </section>` : '';
}

function podiumHtml(ranking, color) {
  if (!ranking.length) return `<p class="text-sm text-slate-500 py-4">${t('stats.empty')}</p>`;
  const top = ranking.slice(0, 3);
  const columns = PODIUM_ORDER.map((position) => {
    const entry = top[position];
    if (!entry) return '<div class="flex-1"></div>';
    return `
      <div class="flex flex-col items-center gap-1 flex-1 min-w-0">
        <span class="text-2xl" aria-hidden="true">${MEDALS[position]}</span>
        <span class="text-xs font-bold text-slate-700 truncate w-full text-center">${escapeHtml(entry.name)}</span>
        <div class="podium-bar w-full ${color} rounded-t-lg ${PODIUM_HEIGHTS[position]} flex items-start justify-center pt-1">
          <span class="text-white font-black text-sm">${escapeHtml(entry.total)}</span>
        </div>
      </div>`;
  }).join('');
  const rest = ranking.slice(3).map((entry, index) => `
    <div class="flex items-center gap-3">
      <span class="text-xs font-black text-slate-500 w-5">#${index + 4}</span>
      <span class="text-sm font-bold text-slate-700 flex-1 truncate">${escapeHtml(entry.name)}</span>
      <span class="text-sm font-black text-slate-600">${escapeHtml(entry.total)}</span>
    </div>`).join('');
  return `<div class="flex items-end justify-center gap-2 mb-1">${columns}</div>${rest ? `<div class="space-y-2 pt-3 mt-2 border-t border-slate-100">${rest}</div>` : ''}`;
}

const cardHtml = (titleKey, accent, body, extraClass = '') => `
  <section class="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 ${extraClass}">
    <h2 class="font-black text-slate-800 mb-4 flex items-center gap-2"><span class="w-2 h-5 ${accent} rounded-full" aria-hidden="true"></span> ${t(titleKey)}</h2>
    ${body}
  </section>`;

const dareLogHtml = (entries) => entries.map((entry) => `
  <div class="flex items-center gap-3 py-1">
    <span class="text-lg w-7 text-center shrink-0" aria-hidden="true">${escapeHtml(entry.emoji || '🥐')}</span>
    <div class="min-w-0 flex-1">
      <span class="text-sm font-bold text-slate-700">${escapeHtml(entry.name)}</span>
      <span class="text-sm text-slate-600"> — ${escapeHtml(entry.dare_text)}</span>
    </div>
    <span class="text-[11px] text-slate-500 whitespace-nowrap shrink-0">${escapeHtml(entry.category)} · ${escapeHtml(formatShortDate(entry.cleared_at))}</span>
  </div>`).join('');

function categoriesHtml(categories) {
  const max = categories[0]?.total || 1;
  return categories.map((category) => `
    <div class="flex items-center gap-3">
      <span class="text-lg w-7 text-center" aria-hidden="true">${escapeHtml(category.emoji || '')}</span>
      <span class="text-sm font-bold text-slate-700 w-32 truncate">${escapeHtml(category.name)}</span>
      ${progressBar(category.total, max, 'bg-purple-400')}
      <span class="text-sm font-black text-purple-700 w-8 text-right">${escapeHtml(category.total)}</span>
    </div>`).join('');
}

function evolutionHtml(weeks) {
  const max = Math.max(...weeks.map((week) => week.total), 1);
  return `<div class="flex items-end gap-2 h-32">${weeks.map((week) => {
    const weekNumber = week.week.split('-')[1];
    return `
      <div class="flex-1 flex flex-col items-center gap-1">
        <span class="text-[10px] font-black text-indigo-700">${escapeHtml(week.total)}</span>
        <div class="w-full bg-slate-100 rounded-t-md flex items-end" style="height:100px">
          <div class="week-bar w-full bg-indigo-400 rounded-t-md" style="height:0%" data-pct="${Math.round((week.total / max) * 100)}"></div>
        </div>
        <span class="text-[10px] text-slate-500 font-bold">${escapeHtml(weekNumber ? `S${weekNumber}` : week.week)}</span>
      </div>`;
  }).join('')}</div>`;
}

function heatmapHtml(matrix) {
  const names = [...new Set(matrix.flatMap((cell) => [cell.from_name, cell.to_name]))].sort();
  if (names.length < 2) return '';
  const totals = new Map(matrix.map((cell) => [`${cell.from_name}|${cell.to_name}`, cell.total]));
  const maxCell = Math.max(...matrix.map((cell) => cell.total), 1);
  const cellHtml = (from, to) => {
    if (from === to) return '<td class="p-1"><div class="w-8 h-8 rounded bg-slate-100 flex items-center justify-center text-slate-400" aria-hidden="true">—</div></td>';
    const value = totals.get(`${from}|${to}`) ?? 0;
    const alpha = value > 0 ? 0.15 + (value / maxCell) * 0.75 : 0;
    return `<td class="p-1"><div class="heatmap-cell w-8 h-8 rounded flex items-center justify-center font-black ${alpha > 0.5 ? 'text-white' : 'text-rose-800'} cursor-default"
                style="background:rgba(244,63,94,${alpha})" title="${escapeHtml(from)} → ${escapeHtml(to)} : ${value} ${t('stats.u_points_n')}">${value > 0 ? value : ''}</div></td>`;
  };
  return cardHtml('stats.heatmap_title', 'bg-rose-500', `
    <p class="text-xs text-slate-500 mb-4">${t('stats.heatmap_hint')}</p>
    <table class="text-[11px] border-collapse">
      <thead><tr><th class="p-1 w-20"></th>${names.map((name) => `<th scope="col" class="p-1 text-center font-bold text-slate-600 max-w-12"><div class="rotate-[-45deg] origin-left translate-x-3 whitespace-nowrap">${escapeHtml(firstName(name))}</div></th>`).join('')}</tr></thead>
      <tbody>${names.map((from) => `<tr><th scope="row" class="p-1 font-bold text-slate-600 pr-3 whitespace-nowrap text-left">${escapeHtml(firstName(from))}</th>${names.map((to) => cellHtml(from, to)).join('')}</tr>`).join('')}</tbody>
    </table>`, 'overflow-x-auto');
}

function render(stats) {
  const givers = stats.givers ?? [];
  const receivers = stats.receivers ?? [];
  const matrix = stats.matrix ?? [];
  const gages = stats.gages ?? [];
  const periodCard = `<div class="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">${periodBarHtml(stats.totalPoints || 0)}</div>`;
  if (!stats.totalPoints) {
    content().innerHTML = `${periodCard}<div class="text-center py-16 text-slate-500 font-bold">${t('stats.empty')}</div>`;
    return;
  }
  content().innerHTML = `
    ${periodCard}
    ${youCardHtml(stats.me)}
    ${awardsHtml({ givers, receivers, matrix, gages })}
    <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
      ${cardHtml('stats.givers', 'bg-emerald-500', podiumHtml(givers, 'bg-emerald-500'))}
      ${cardHtml('stats.receivers', 'bg-blue-500', podiumHtml(receivers, 'bg-blue-500'))}
    </div>
    ${stats.gageLog?.length ? cardHtml('stats.gages_title', 'bg-orange-500', `<div class="space-y-2">${dareLogHtml(stats.gageLog)}</div>`) : ''}
    ${cardHtml('stats.categories', 'bg-purple-500', `<div class="space-y-3">${categoriesHtml(stats.categories ?? [])}</div>`)}
    ${cardHtml('stats.evolution_title', 'bg-indigo-500', evolutionHtml(stats.evolution ?? []))}
    ${heatmapHtml(matrix)}`;
  requestAnimationFrame(() => {
    content().querySelectorAll('.bar-fill').forEach((bar) => { bar.style.width = `${bar.dataset.pct}%`; });
    content().querySelectorAll('.week-bar').forEach((bar) => { bar.style.height = `${bar.dataset.pct}%`; });
  });
}

async function loadStats() {
  if (!getSessionToken()) {
    content().innerHTML = `<p class="text-center text-slate-600">${t('stats.connect_first')}</p>`;
    return;
  }
  const response = await authFetch(`/api/stats?period=${currentPeriod}`, { cache: 'no-store' });
  if (!response.ok) {
    content().innerHTML = `<p class="text-center text-red-600">${t('stats.error')}</p>`;
    return;
  }
  const stats = await response.json();
  currentPeriod = stats.period || currentPeriod;
  render(stats);
}

registerActions({
  'select-period': (button) => {
    currentPeriod = button.dataset.period;
    loadStats();
  },
});

applyI18n();
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadStats(); });
loadStats();
