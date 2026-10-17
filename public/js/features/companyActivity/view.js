import { escapeHtml } from '../../core/html.js';
import { getLang, t } from '../../core/i18n.js';
import { closeButtonHtml } from '../../core/dialogs.js';
import { flavorKey, isCalm, statLine, teamMood } from './model.js';

export const activityPillHtml = (leader) => `
  <span class="leading-none" aria-hidden="true">👀</span>
  <span class="font-bold text-slate-600">${t('company.pill_label')}</span>
  <span class="inline-flex items-center gap-1 bg-slate-100 rounded-full px-2 py-0.5 text-xs">
    <span aria-hidden="true">${isCalm(leader) ? '😴' : '🔥'}</span>
    <span class="font-black text-slate-700">${escapeHtml(leader.name)}</span>
    <span class="font-black text-blue-600">${escapeHtml(leader.points_7d || 0)}</span>
  </span>
  <span class="text-slate-600" aria-hidden="true">→</span>`;

const teamRowHtml = (team, position) => `
  <div class="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
    <div class="flex items-center justify-between gap-2">
      <span class="flex items-center gap-2 min-w-0">
        <span class="text-xl shrink-0" aria-hidden="true">${teamMood(team, position)}</span>
        <span class="font-black text-slate-800 truncate">${escapeHtml(team.name)}</span>
      </span>
      <span class="text-blue-600 font-black shrink-0">${escapeHtml(team.points_7d || 0)} <span class="text-xs text-slate-600 uppercase">${t('index.pts_short')}</span></span>
    </div>
    ${isCalm(team) ? '' : `<p class="text-xs text-slate-600 mt-1">${escapeHtml(statLine(team, getLang()))}</p>`}
    <p class="text-sm text-slate-600 italic mt-1">${t(flavorKey(team), { team: team.name, cat: (team.top_category || '').toLowerCase() })}</p>
  </div>`;

export const companyActivityHtml = (companyName, teams) => `
  <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
    <h2 class="text-xl font-black text-slate-800">${t('company.activity_title', { company: companyName })}</h2>
    ${closeButtonHtml()}
  </div>
  <div class="space-y-2 max-h-[60vh] overflow-y-auto">${teams.map(teamRowHtml).join('')}</div>
  <p class="text-xs text-slate-600 mt-4">${t('company.activity_hint')}</p>`;
