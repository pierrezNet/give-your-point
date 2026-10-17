import { applyI18n, dateLocale, t, tText } from '../core/i18n.js';
import { authFetch } from '../core/session.js';
import { escapeHtml } from '../core/html.js';
import { errorMessageOf } from '../core/api.js';
import { registerActions } from '../core/actions.js';
import { uiConfirm, uiToast } from '../core/dialogs.js';
import { daysSince, parseSqlDate } from '../core/dates.js';
import { requirePageRole } from '../core/guard.js';

const ACTIVE_DAYS = 7;
const IDLE_DAYS = 30;
const RECENT_DAYS = 7;
const FUNNEL_FIELDS = {
  'fn-landing': 'landing_vue', 'fn-onboarding': 'onboarding_soumis', 'fn-created': 'espaces_crees_30j',
  'fn-activated': 'espaces_actives_30j', 'fn-join-views': 'join_vue', 'fn-join-signups': 'join_soumis',
};

let companies = [];
let ownCompanyId = null;

function relativeDate(value) {
  if (!value) return '—';
  const days = daysSince(value);
  if (days === 0) return tText('owner.date_today');
  if (days === 1) return tText('owner.date_yesterday');
  if (days < RECENT_DAYS) return tText('owner.date_n_days_ago', { n: days });
  return parseSqlDate(value).toLocaleDateString(dateLocale(), { day: '2-digit', month: '2-digit', year: '2-digit' });
}

function activityBadge(days) {
  const [key, colors] = days === null ? ['owner.activity_never', 'bg-slate-100 text-slate-600']
    : days <= ACTIVE_DAYS ? ['owner.activity_active', 'bg-emerald-100 text-emerald-800']
    : days <= IDLE_DAYS ? ['owner.activity_idle', 'bg-amber-100 text-amber-800']
    : ['owner.activity_dormant', 'bg-slate-100 text-slate-600'];
  return `<span class="text-[10px] font-black uppercase px-2 py-1 rounded-full ${colors}">${t(key)}</span>`;
}

function companyRowHtml(company) {
  const days = company.last_point_at ? daysSince(company.last_point_at) : null;
  const isOwn = company.id === ownCompanyId;
  const cleanupCandidate = !isOwn && (days === null || days > IDLE_DAYS);
  return `
    <tr class="border-b border-slate-100 ${company.active === 0 ? 'opacity-50' : ''} ${cleanupCandidate ? 'bg-amber-50' : ''}">
      <td class="p-3">
        <div class="font-bold text-slate-800">${escapeHtml(company.name)}</div>
        ${company.active === 0 ? `<div class="text-[10px] font-bold uppercase text-slate-500">${t('owner.company_disabled')}</div>` : ''}
        ${cleanupCandidate ? `<div class="text-[10px] font-black uppercase text-amber-700">🧹 ${t('owner.cleanup_flag')}</div>` : ''}
      </td>
      <td class="p-3 text-sm text-slate-600">${company.admins ? escapeHtml(company.admins) : '<i class="text-slate-500">—</i>'}</td>
      <td class="p-3 text-center text-sm font-bold">${escapeHtml(company.team_count)}</td>
      <td class="p-3 text-center text-sm font-bold">${escapeHtml(company.member_count)}</td>
      <td class="p-3 text-center text-sm hidden md:table-cell">${escapeHtml(company.total_points)}</td>
      <td class="p-3 text-center text-sm font-bold ${company.points_last_7d > 0 ? 'text-emerald-700' : 'text-slate-500'}">${escapeHtml(company.points_last_7d)}</td>
      <td class="p-3 text-xs hidden lg:table-cell"><div class="flex items-center gap-2">${activityBadge(days)}<span class="text-slate-600">${escapeHtml(relativeDate(company.last_point_at))}</span></div></td>
      <td class="p-3 text-xs text-slate-600 hidden lg:table-cell">${escapeHtml(relativeDate(company.created_at))}</td>
      <td class="p-3 text-right whitespace-nowrap">
        ${isOwn
          ? `<span class="text-[10px] font-bold uppercase text-slate-500">${t('owner.your_company')}</span>`
          : `<button type="button" data-action="delete-company" data-company-id="${escapeHtml(company.id)}" class="text-xs font-black uppercase text-red-700 hover:text-red-800 hover:underline">🗑 ${t('owner.delete')}</button>`}
      </td>
    </tr>`;
}

async function loadCompanies() {
  const response = await authFetch('/api/owner/companies');
  if (!response.ok) return;
  companies = await response.json();
  const sum = (field) => companies.reduce((total, company) => total + (company[field] || 0), 0);
  document.getElementById('agg-companies').textContent = companies.length;
  document.getElementById('agg-teams').textContent = sum('team_count');
  document.getElementById('agg-members').textContent = sum('member_count');
  document.getElementById('agg-points-7d').textContent = sum('points_last_7d');
  document.getElementById('companies-list').innerHTML = companies.map(companyRowHtml).join('');
  const cleanupCount = companies.filter((company) => company.id !== ownCompanyId && (!company.last_point_at || daysSince(company.last_point_at) > IDLE_DAYS)).length;
  document.getElementById('cleanup-caption').textContent = cleanupCount ? tText('owner.cleanup_count', { n: cleanupCount }) : '';
}

async function loadFunnel() {
  const response = await authFetch('/api/owner/funnel');
  if (!response.ok) return;
  const funnel = await response.json();
  for (const [elementId, field] of Object.entries(FUNNEL_FIELDS)) document.getElementById(elementId).textContent = funnel[field];
  const rate = (numerator, denominator) => (denominator > 0 ? `${Math.round((numerator / denominator) * 100)}%` : '—');
  document.getElementById('fn-onboarding-rate').textContent = rate(funnel.onboarding_soumis, funnel.landing_vue);
  document.getElementById('fn-created-rate').textContent = rate(funnel.espaces_crees_30j, funnel.onboarding_soumis);
  document.getElementById('fn-activated-rate').textContent = rate(funnel.espaces_actives_30j, funnel.espaces_crees_30j);
}

registerActions({
  'delete-company': async (button) => {
    const company = companies.find((candidate) => candidate.id === button.dataset.companyId);
    if (!company) return;
    const confirmed = await uiConfirm(tText('owner.delete_confirm', {
      name: company.name, teams: company.team_count, members: company.member_count, points: company.total_points,
    }));
    if (!confirmed) return;
    const response = await authFetch(`/api/owner/companies/${company.id}`, { method: 'DELETE' });
    if (response.ok) loadCompanies();
    else uiToast(await errorMessageOf(response, 'owner.delete_error'));
  },
});

async function start() {
  applyI18n();
  const me = await requirePageRole(['owner'], 'owner.not_owner');
  if (!me) return;
  ownCompanyId = me.company_id;
  document.getElementById('owner-body').classList.remove('opacity-0');
  await Promise.all([loadCompanies(), loadFunnel()]);
}

start();
