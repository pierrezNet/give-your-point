import { authFetch } from '../core/session.js';
import { escapeHtml } from '../core/html.js';
import { getLang, t } from '../core/i18n.js';
import { closeButtonHtml, openModal } from '../core/dialogs.js';
import { registerActions } from '../core/actions.js';

const ACTIVE_FLAVOR_COUNT = 10;
const CALM_FLAVOR_COUNT = 5;

let activity = null;

const isCalm = (team) => (team.points_7d || 0) === 0;

function teamFlavor(team) {
  const calm = isCalm(team);
  const variant = Math.floor(Math.random() * (calm ? CALM_FLAVOR_COUNT : ACTIVE_FLAVOR_COUNT));
  return t(`company.flavor_${calm ? 'calm' : 'active'}_${variant}`, { team: team.name, cat: (team.top_category || '').toLowerCase() });
}

function statLine(team) {
  const plural = (count, singular, pluralForm) => `${count} ${count > 1 ? pluralForm : singular}`;
  const [givers, points, categories] = [team.givers || 0, team.points_7d || 0, team.categories_used || 0];
  return getLang() === 'en'
    ? `${plural(givers, 'member', 'members')} gave ${plural(points, 'pt', 'pts')} across ${plural(categories, 'category', 'categories')}`
    : `${plural(givers, 'membre a', 'membres ont')} distribué ${plural(points, 'pt', 'pts')} dans ${plural(categories, 'catégorie', 'catégories')}`;
}

export async function loadCompanyActivity() {
  const pill = document.getElementById('company-activity-pill');
  const response = await authFetch('/api/company/teams-activity').catch(() => null);
  if (!response?.ok) return;
  const data = await response.json();
  const otherTeams = (data.teams || []).filter((team) => String(team.id) !== String(data.my_team_id));
  if (!otherTeams.length) return;

  activity = { company: data.company_name, otherTeams };
  const [leader] = otherTeams;
  pill.innerHTML = `
    <span class="leading-none" aria-hidden="true">👀</span>
    <span class="font-bold text-slate-600">${t('company.pill_label')}</span>
    <span class="inline-flex items-center gap-1 bg-slate-100 rounded-full px-2 py-0.5 text-xs">
      <span aria-hidden="true">${isCalm(leader) ? '😴' : '🔥'}</span>
      <span class="font-black text-slate-700">${escapeHtml(leader.name)}</span>
      <span class="font-black text-blue-600">${leader.points_7d || 0}</span>
    </span>
    <span class="text-slate-400" aria-hidden="true">→</span>`;
  pill.classList.replace('hidden', 'inline-flex');
}

function showCompanyActivity() {
  if (!activity) return;
  const rows = activity.otherTeams.map((team, index) => `
    <div class="bg-slate-50 rounded-xl px-4 py-3 border border-slate-100">
      <div class="flex items-center justify-between gap-2">
        <span class="flex items-center gap-2 min-w-0">
          <span class="text-xl shrink-0" aria-hidden="true">${isCalm(team) ? '😴' : index === 0 ? '🔥' : '👏'}</span>
          <span class="font-black text-slate-800 truncate">${escapeHtml(team.name)}</span>
        </span>
        <span class="text-blue-600 font-black shrink-0">${team.points_7d || 0} <span class="text-[10px] text-slate-500 uppercase">${t('index.pts_short')}</span></span>
      </div>
      ${isCalm(team) ? '' : `<p class="text-xs text-slate-600 mt-1">${escapeHtml(statLine(team))}</p>`}
      <p class="text-sm text-slate-600 italic mt-1">${teamFlavor(team)}</p>
    </div>`).join('');
  openModal({
    id: 'company-modal',
    content: `
      <div class="flex justify-between items-center mb-4 border-b border-slate-100 pb-4">
        <h2 class="text-xl font-black text-slate-800">${t('company.activity_title', { company: activity.company })}</h2>
        ${closeButtonHtml()}
      </div>
      <div class="space-y-2 max-h-[60vh] overflow-y-auto">${rows}</div>
      <p class="text-xs text-slate-500 mt-4">${t('company.activity_hint')}</p>`,
  });
}

registerActions({ 'show-company-activity': showCompanyActivity });
